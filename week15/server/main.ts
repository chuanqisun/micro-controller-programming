import { map, tap } from "rxjs";
import { HTTP_PORT, LAPTOP_UDP_RX_PORT } from "./config";
import { BLEDevice, opMac, swMac } from "./features/ble";
import { createButtonStateMachine } from "./features/buttons";
import { enterAction$, enterExploration$, gmHint$, handleNewGame, phase$, sceneObjects } from "./features/game";
import {
  aiAudioPart$,
  aiResponse$,
  handleAISendText,
  handleConnectAI,
  handleDisconnectAI,
  handleSpeechStart,
  handleSpeechStop,
  handleUserAudio,
  resetAIAudio,
  sendAIText,
} from "./features/gemini-live";
import { createHttpServer } from "./features/http";
import {
  handleBtnApi,
  handleButtonsMessage,
  handleConnectOperator,
  handleDisconnectOperator,
  handleOpAddressMessage,
  handleProbeApi,
  handleProbeMessage,
  handleRequestOperatorAddress,
  logOperatorMessage,
  operatorAddress$,
  operatorButtons$,
  operatorProbeNum$,
} from "./features/operator";
import { handlePlayFile, handleStopPlayback } from "./features/play-file";
import { silenceStart$, speakStart$ } from "./features/silence-detection";
import { broadcast, handleSSE, newSseClient$ } from "./features/sse";
import { appState$, updateState } from "./features/state";
import { handleBlinkLED, handleConnectSwitchboard, handleDisconnectSwitchboard, handleLEDAllOff, turnOffAllLED, turnOnLED } from "./features/switchboard";
import { createUDPServer, sendPcm16UDP, startPcmStream, stopPcmStream } from "./features/udp";

async function main() {
  const operator = new BLEDevice(opMac);
  const switchboard = new BLEDevice(swMac);

  createUDPServer([handleUserAudio()], LAPTOP_UDP_RX_PORT);

  createHttpServer(
    [
      handleSSE(),
      handleBlinkLED(switchboard),
      handleLEDAllOff(switchboard),
      handleConnectSwitchboard(switchboard),
      handleDisconnectSwitchboard(switchboard),
      handleConnectOperator(operator),
      handleDisconnectOperator(operator),
      handleRequestOperatorAddress(operator),
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

  operator.message$.pipe(tap(logOperatorMessage), tap(handleProbeMessage()), tap(handleOpAddressMessage()), tap(handleButtonsMessage())).subscribe();
  operatorProbeNum$.pipe(tap((num) => updateState((state) => ({ ...state, probeNum: num })))).subscribe();
  operatorAddress$.pipe(tap((address) => updateState((state) => ({ ...state, opAddress: address })))).subscribe();
  operatorButtons$.pipe(tap((buttons) => updateState((state) => ({ ...state, btn1: buttons.btn1, btn2: buttons.btn2 })))).subscribe();

  const operataorButtons = createButtonStateMachine(operatorButtons$);

  aiAudioPart$.pipe(tap((buf) => sendPcm16UDP(buf, appState$.value.opAddress))).subscribe();
  aiResponse$.pipe(tap((text) => console.log("AI Response:", text))).subscribe();

  operataorButtons.leaveIdle$
    .pipe(
      tap(() => console.log("leave idle")),
      tap(stopPcmStream)
    )
    .subscribe();
  operataorButtons.enterIdle$
    .pipe(
      tap(() => console.log("enter idle")),
      tap(() => startPcmStream(appState$.value.opAddress))
    )
    .subscribe();
  silenceStart$.pipe(tap(handleSpeechStop)).subscribe();
  speakStart$.pipe(tap(handleSpeechStart)).subscribe();

  /** Game logic */
  gmHint$.pipe(tap((hint) => sendAIText(`[GM HINT] ${hint}`))).subscribe();
  let explorationRound = 0;

  enterExploration$
    .pipe(
      tap(async () => {
        gmHint$.next(
          "Describe the sentence in one short sentence. Allow the players to explore the details. When user decides to take an action, use start_action tool to transition into action phase."
        );
        explorationRound++;
        await turnOffAllLED(switchboard);
        const currentProbe = appState$.value.probeNum;
        const availableProbes = [0, 1, 2, 4, 5, 6].filter((p) => p !== currentProbe);
        const threeRandomProbes = availableProbes.sort(() => 0.5 - Math.random()).slice(0, 3);
        sceneObjects.next(threeRandomProbes);
        threeRandomProbes.forEach((probe) => setTimeout(() => turnOnLED(switchboard, probe), 1000 + Math.random() * 2000));
      })
    )
    .subscribe();

  enterAction$
    .pipe(
      tap(async () => {
        await turnOffAllLED(switchboard);
        turnOnLED(switchboard, 3); // turn on center LED for action
      })
    )
    .subscribe();

  operatorProbeNum$
    .pipe(
      tap((num) => {
        if (num === 7) {
          resetAIAudio();
          return;
        }

        if (phase$.value === "exploration") {
          if (!sceneObjects.value.includes(num)) {
            gmHint$.next(`Player investigated the wrong thing. Tell them there is nothing there.`);
          } else {
            gmHint$.next(
              `Player investigated element (id=${explorationRound + num}) in the scene. Use your imagination to describe the element. Be consistent if user investigated the same id again. It could an object, place, character, etc.`
            );
          }
        }

        if (phase$.value === "action") {
          if (num === 3) {
            gmHint$.next(
              `Player started the action. Wait for player to finish the action, then summarize the output. When players are done with the action, use start_exploration to start the next turn.`
            );
          } else {
            gmHint$.next(`Player tried to leave the action. Warn them to not leave the action until it's over.`);
          }
        }
      })
    )
    .subscribe();
}

main();
