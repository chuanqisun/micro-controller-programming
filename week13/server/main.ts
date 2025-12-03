import { concatMap, filter, map, tap } from "rxjs";
import { HTTP_PORT, LAPTOP_UDP_RX_PORT } from "./config";
import { BLEDevice, opMac, swMac } from "./features/ble";
import { createButtonStateMachine } from "./features/buttons";
import {
  geminiResponse$,
  geminiTranscript$,
  handleConnectGemini,
  handleDisconnectGemini,
} from "./features/gemini-live";
import { createHttpServer } from "./features/http";
import {
  handleButtonsMessage,
  handleConnectOperator,
  handleDisconnectOperator,
  handleOpAddressMessage,
  handleProbeMessage,
  handleRequestOperatorAddress,
  logOperatorMessage,
  operatorAddress$,
  operatorButtons$,
  operatorProbeNum$,
} from "./features/operator";
import { silence$ } from "./features/silence-detection";
import {
  handleAudio,
  handleConnectSession,
  handleDisconnectSession,
  interrupt,
  triggerResponse,
} from "./features/simulation";
import { cancelAllSpeakerPlayback } from "./features/speaker";
import { broadcast, handleSSE, newSseClient$ } from "./features/sse";
import { appState$, updateState } from "./features/state";
import {
  handleBlinkLED,
  handleConnectSwitchboard,
  handleDisconnectSwitchboard,
  handleLEDAllOff,
  turnOnLED,
} from "./features/switchboard";
import {
  handleCommitOption,
  handlePreviewOption,
  handleStartTextAdventures,
  previewOption,
  textGenerated$,
} from "./features/text-adventures";
import { createUDPServer } from "./features/udp";

async function main() {
  const operator = new BLEDevice(opMac);
  const switchboard = new BLEDevice(swMac);

  createUDPServer([handleAudio()], LAPTOP_UDP_RX_PORT);

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
      handleConnectSession(),
      handleDisconnectSession(),

      handleConnectGemini(),
      handleDisconnectGemini(),
      handleStartTextAdventures(),
      handlePreviewOption(),
      handleCommitOption(),
    ],
    HTTP_PORT,
  );

  appState$
    .pipe(
      map((state) => ({ state })),
      tap(broadcast),
    )
    .subscribe();

  newSseClient$.pipe(tap(() => broadcast({ state: appState$.value }))).subscribe();

  operator.message$
    .pipe(
      tap(logOperatorMessage),
      tap(handleProbeMessage()),
      tap(handleOpAddressMessage()),
      tap(handleButtonsMessage()),
    )
    .subscribe();
  operatorProbeNum$.pipe(tap((num) => updateState((state) => ({ ...state, probeNum: num })))).subscribe();
  operatorAddress$.pipe(tap((address) => updateState((state) => ({ ...state, opAddress: address })))).subscribe();
  operatorButtons$
    .pipe(tap((buttons) => updateState((state) => ({ ...state, btn1: buttons.btn1, btn2: buttons.btn2 }))))
    .subscribe();

  const operataorButtons = createButtonStateMachine(operatorButtons$);

  operataorButtons.leaveIdle$.pipe(tap(interrupt)).subscribe();
  silence$.pipe(tap(triggerResponse)).subscribe();

  // Gemini Live API subscriptions
  geminiTranscript$.pipe(tap((text) => console.log(`🎤 Transcript: ${text}`))).subscribe();
  geminiResponse$.pipe(tap((text) => console.log(`🤖 Gemini: ${text}`))).subscribe();

  // Text adventures subscriptions
  textGenerated$.pipe(concatMap((index) => turnOnLED(switchboard, index))).subscribe();
  operatorProbeNum$
    .pipe(
      filter((num) => num !== 7),
      tap((index) => previewOption(index)),
    )
    .subscribe();
  operatorProbeNum$
    .pipe(
      filter((num) => num === 7),
      tap(cancelAllSpeakerPlayback),
    )
    .subscribe();
}

main();
