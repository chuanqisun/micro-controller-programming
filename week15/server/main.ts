import { map, tap } from "rxjs";
import { HTTP_PORT, LAPTOP_UDP_RX_PORT } from "./config";
import { BLEDevice, opMac, swMac } from "./features/ble";
import { createButtonStateMachine } from "./features/buttons";
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
import { handleBlinkLED, handleConnectSwitchboard, handleDisconnectSwitchboard, handleLEDAllOff } from "./features/switchboard";
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
}

main();
