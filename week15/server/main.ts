import { filter, map, tap } from "rxjs";
import { HTTP_PORT, LAPTOP_UDP_RX_PORT, SAMPLE_RATE } from "./config";
import { downsamplePcm16 } from "./features/audio";
import { BLEDevice, opMacUnit1, opMacUnit2, swMac } from "./features/ble";
import { createButtonStateMachine } from "./features/buttons";
import { handleNewGame, phase$, startGameLoop } from "./features/game";
import {
  aiAudioPart$,
  aiResponse$,
  handleAISendText,
  handleConnectAI,
  handleDisconnectAI,
  handleSpeechStart,
  handleSpeechStop,
  handleUserAudio,
} from "./features/gemini-live";
import { createHttpServer } from "./features/http";
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
import { silenceStart$, speakStart$ } from "./features/silence-detection";
import { broadcast, handleSSE, newSseClient$ } from "./features/sse";
import { appState$, createDefaultOperatorState, getActiveOperator, updateOperatorByIndex, updateState } from "./features/state";
import { handleBlinkOnLED, handleConnectSwitchboard, handleDisconnectSwitchboard, handleLEDAllOff, handlePulseOnLED } from "./features/switchboard";
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
      handlePulseOnLED(switchboard),
      handleLEDAllOff(switchboard),
      handleConnectSwitchboard(switchboard),
      handleDisconnectSwitchboard(switchboard),
      ...operatorHttpHandlers,
      handleProbeApi(),
      handleBtnApi(),

      handleConnectAI(),
      handleDisconnectAI(),
      handleAISendText(),

      handleNewGame(),

      handlePlayFile(),
      handleStopPlayback(),
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

  // Update state when probe numbers change (scoped to operator index)
  operatorProbeNum$
    .pipe(tap(({ operatorIndex, probeNum }) => updateState((state) => updateOperatorByIndex(state, operatorIndex, (op) => ({ ...op, probeNum })))))
    .subscribe();

  // Update state when addresses change (scoped to operator index)
  operatorAddress$
    .pipe(tap(({ operatorIndex, address }) => updateState((state) => updateOperatorByIndex(state, operatorIndex, (op) => ({ ...op, address })))))
    .subscribe();

  // Update state when buttons change (scoped to operator index)
  operatorButtons$
    .pipe(tap(({ operatorIndex, btn1, btn2 }) => updateState((state) => updateOperatorByIndex(state, operatorIndex, (op) => ({ ...op, btn1, btn2 })))))
    .subscribe();

  // Track active operator - update state when activity occurs
  activeOperatorIndex$
    .pipe(
      tap((operatorIndex) => {
        updateState((state) => ({ ...state, activeOperatorIndex: operatorIndex }));
      })
    )
    .subscribe();

  // For button state machine, use the active operator's buttons
  // Filter to only respond to the active operator's buttons
  const activeOperatorButtons$ = operatorButtons$.pipe(filter(({ operatorIndex }) => operatorIndex === appState$.value.activeOperatorIndex));

  const operatorButtonsMachine = createButtonStateMachine(activeOperatorButtons$.pipe(map(({ btn1, btn2 }) => ({ btn1, btn2 }))));

  // Send audio to the active operator's address (downsample from Gemini's 24kHz to operator's 16kHz)
  aiAudioPart$
    .pipe(
      map((buf) => downsamplePcm16(buf, 24000, SAMPLE_RATE)),
      tap((buf) => {
        const activeOp = getActiveOperator(appState$.value);
        if (activeOp?.address) {
          sendPcm16UDP(buf, activeOp.address);
        }
      })
    )
    .subscribe();

  aiResponse$.pipe(tap((text) => console.log("AI Response:", text))).subscribe();

  operatorButtonsMachine.leaveIdle$
    .pipe(
      filter(() => phase$.value === "live"),
      tap(() => console.log("leave idle")),
      tap(stopPcmStream)
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

  silenceStart$
    .pipe(
      filter(() => phase$.value === "live"),
      tap(handleSpeechStop)
    )
    .subscribe();
  speakStart$
    .pipe(
      filter(() => phase$.value === "live"),
      tap(handleSpeechStart)
    )
    .subscribe();

  startGameLoop(switchboard);
}

main();
