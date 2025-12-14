import { combineLatest, debounceTime, filter, map, tap, withLatestFrom } from "rxjs";
import { HTTP_PORT, LAPTOP_UDP_RX_PORT } from "./config";
import { audioPlayer } from "./features/audio";
import { transcriber } from "./features/azure-stt";
import { BLEDevice, opMacUnit1, opMacUnit2, swMac } from "./features/ble";
import { createButtonStateMachine } from "./features/buttons";
import {
  formatGameStateSummary,
  gameLog$,
  gameStateSummary$,
  handleNewGame,
  handleUserAudio,
  phase$,
  saveDebugBuffer,
  startGameLoop,
  userMessage$,
} from "./features/game";
import { createHttpServer } from "./features/http";
import {
  handleConnectOpenAI,
  handleDisconnectOpenAI,
  handleSendTextOpenAI,
  realtimeOutputAudio$,
  sendText,
  triggerResponse,
  updateSystemInstruction,
} from "./features/openai-realtime";
import {
  activeOperatorIndex$,
  createOperatorHandlers,
  createOperatorMessageHandlers,
  handleBtnApi,
  handleProbeApi,
  logOperatorMessage,
  operatorAddress$,
  operatorButtons$,
  operatorProbeNum$,
} from "./features/operator";
import { handlePlayFile, handleStopPlayback } from "./features/play-file";
import { handleReset } from "./features/process";
import { getDungeonMasterPrompt } from "./features/prompt";
import { silenceStart$, speakStart$ } from "./features/silence-detection";
import { cancelAllSpeakerPlayback } from "./features/speaker";
import { broadcast, handleSSE, newSseClient$ } from "./features/sse";
import { appState$, createDefaultOperatorState, getActiveOperator, updateOperatorByIndex, updateState } from "./features/state";
import {
  handleBlinkOnLED,
  handleConnectSwitchboard,
  handleDisconnectSwitchboard,
  handleFadeOffLED,
  handleFadeOnLED,
  handleLEDAllOff,
  handlePulseOnLED,
} from "./features/switchboard";
import { handleSetAudioOutputMode } from "./features/audio-output";
import { createUDPServer, sendPcm16UDP, startPcmStream, stopPcmStream } from "./features/udp";

async function main() {
  const operatorDevices = [new BLEDevice(opMacUnit1), new BLEDevice(opMacUnit2)];

  updateState((state) => ({
    ...state,
    operators: operatorDevices.map((device) => createDefaultOperatorState(device.mac)),
    activeOperatorIndex: 0,
  }));

  const switchboard = new BLEDevice(swMac);

  createUDPServer([handleUserAudio()], LAPTOP_UDP_RX_PORT);

  const operatorHttpHandlers = operatorDevices.flatMap((device, index) => createOperatorHandlers(device, index).handlers);

  createHttpServer(
    [
      handleSSE(),
      handleBlinkOnLED(switchboard),
      handleFadeOnLED(switchboard),
      handleFadeOffLED(switchboard),
      handlePulseOnLED(switchboard),
      handleLEDAllOff(switchboard),
      handleConnectSwitchboard(switchboard),
      handleDisconnectSwitchboard(switchboard),
      ...operatorHttpHandlers,
      handleProbeApi(),
      handleBtnApi(),

      handleConnectOpenAI(),
      handleDisconnectOpenAI(),
      handleSendTextOpenAI(),

      handleNewGame(switchboard),
      handleReset(),

      handlePlayFile(),
      handleStopPlayback(),
      handleSetAudioOutputMode(),
    ],
    HTTP_PORT
  );

  appState$
    .pipe(
      map((state) => ({ state })),
      tap(broadcast)
    )
    .subscribe();

  newSseClient$.pipe(tap(() => broadcast({ state: appState$.value }))).subscribe();
  gameStateSummary$
    .pipe(
      map((summary) => formatGameStateSummary(summary)),
      tap((summary) => broadcast({ type: "gameStateSummary", summary }))
    )
    .subscribe();

  operatorDevices.forEach((device, index) => {
    const messageHandlers = createOperatorMessageHandlers(index, device.mac);
    device.message$
      .pipe(
        tap(logOperatorMessage(index)),
        tap(messageHandlers.handleProbeMessage()),
        tap(messageHandlers.handleOpAddressMessage()),
        tap(messageHandlers.handleButtonsMessage())
      )
      .subscribe();

    device.disconnect$
      .pipe(
        tap(() => {
          console.log(`[Main] Operator ${index} disconnected, updating state`);
          updateState((state) =>
            updateOperatorByIndex(state, index, (op) => ({
              ...op,
              connection: "disconnected",
              address: "", // Clear address on disconnect
            }))
          );
        })
      )
      .subscribe();
  });

  operatorProbeNum$
    .pipe(tap(({ operatorIndex, probeNum }) => updateState((state) => updateOperatorByIndex(state, operatorIndex, (op) => ({ ...op, probeNum })))))
    .subscribe();

  operatorAddress$
    .pipe(
      tap(({ operatorIndex, address }) => {
        updateState((state) => updateOperatorByIndex(state, operatorIndex, (op) => ({ ...op, address })));
        // Auto-start PCM stream when active operator reports its address
        if (operatorIndex === appState$.value.activeOperatorIndex) {
          console.log(`[Main] Operator ${operatorIndex} connected with address ${address}, starting PCM stream`);
          startPcmStream(address);
        }
      })
    )
    .subscribe();

  operatorButtons$
    .pipe(tap(({ operatorIndex, btn1, btn2 }) => updateState((state) => updateOperatorByIndex(state, operatorIndex, (op) => ({ ...op, btn1, btn2 })))))
    .subscribe();

  activeOperatorIndex$
    .pipe(
      tap((operatorIndex) => {
        updateState((state) => ({ ...state, activeOperatorIndex: operatorIndex }));
      })
    )
    .subscribe();

  const activeOperatorButtons$ = operatorButtons$.pipe(filter(({ operatorIndex }) => operatorIndex === appState$.value.activeOperatorIndex));

  const operatorButtonsMachine = createButtonStateMachine(activeOperatorButtons$.pipe(map(({ btn1, btn2 }) => ({ btn1, btn2 }))));

  realtimeOutputAudio$
    .pipe(
      tap((buf) => {
        const state = appState$.value;
        const activeOp = getActiveOperator(state);
        const mode = state.audioOutputMode;
        
        if (activeOp?.address && (mode === "controller" || mode === "both")) {
          sendPcm16UDP(buf, activeOp.address);
        }
        
        if (mode === "laptop" || mode === "both") {
          audioPlayer.push(buf);
        }
      })
    )
    .subscribe();

  operatorButtonsMachine.leaveIdle$
    .pipe(
      filter(() => phase$.value === "live"),
      tap(() => console.log("leave idle")),
      tap(stopPcmStream)
    )
    .subscribe();

  combineLatest([gameStateSummary$, gameLog$])
    .pipe(
      debounceTime(100),
      tap(([summary, log]) => updateSystemInstruction(getDungeonMasterPrompt({ snapshot: formatGameStateSummary(summary), log })))
    )
    .subscribe();

  operatorButtonsMachine.enterIdle$
    .pipe(
      filter(() => phase$.value === "live"),
      tap(() => console.log("enter idle")),
      tap(() => {
        const activeOp = getActiveOperator(appState$.value);
        if (activeOp?.address) {
          startPcmStream(activeOp.address);
        }
      })
    )
    .subscribe();

  operatorProbeNum$
    .pipe(
      tap((update) => {
        const activeAddress = getActiveOperator(appState$.value)?.address;
        if (!activeAddress) return;
        if (update.probeNum === 7) {
          stopPcmStream();
          cancelAllSpeakerPlayback();
        } else {
          startPcmStream(activeAddress);
        }
      })
    )
    .subscribe();

  silenceStart$
    .pipe(
      filter(() => phase$.value === "live"),
      tap(() => console.log("Silence detected, committing transcription")),
      withLatestFrom(appState$),
      tap(([_, appState]) => {
        transcriber.commit().then((text) => {
          if (!text) return;
          userMessage$.next({
            address: getActiveOperator(appState$.value)?.address!,
            message: `
[Player ${appState.activeOperatorIndex + 1} spoke] 
${text.trim()}
            `.trim(),
          });
        });
        transcriber.mute();
        saveDebugBuffer();
      }),
      filter(() => phase$.value === "live")
    )
    .subscribe();

  speakStart$
    .pipe(
      filter(() => phase$.value === "live"),
      tap(() => console.log("Speech detected, clearing transcription buffer")),
      tap(() => transcriber.unmute()),
      filter(() => phase$.value === "live")
    )
    .subscribe();

  userMessage$
    .pipe(
      tap(({ message }) => {
        sendText(message);
        triggerResponse();
      })
    )
    .subscribe();

  startGameLoop(switchboard);
}

main();
