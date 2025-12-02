import { map, tap } from "rxjs";
import { HTTP_PORT, LAPTOP_UDP_RX_PORT } from "./config";
import { BLEDevice, opMac, swMac } from "./features/ble";
import { createHttpServer } from "./features/http";
import {
  handleButtonsMessage,
  handleConnectOperator,
  handleDisconnectOperator,
  handleOpAddressMessage,
  handleProbeMessage,
  handleRequestOperatorAddress,
  operatorAddress$,
  operatorProbeNum$,
} from "./features/operator";
import { handleAudio, handleConnectSession, handleDisconnectSession } from "./features/simulation";
import { broadcast, handleSSE, newSseClient$ } from "./features/sse";
import { appState$, updateState } from "./features/state";
import { handleBlinkLED, handleConnectSwitchboard, handleDisconnectSwitchboard } from "./features/switchboard";
import { createUDPServer } from "./features/udp";

async function main() {
  const operator = new BLEDevice(opMac);
  const switchboard = new BLEDevice(swMac);

  createUDPServer([handleAudio()], LAPTOP_UDP_RX_PORT);

  createHttpServer(
    [
      handleSSE(),
      handleBlinkLED(switchboard),
      handleConnectSwitchboard(switchboard),
      handleDisconnectSwitchboard(switchboard),
      handleConnectOperator(operator),
      handleDisconnectOperator(operator),
      handleRequestOperatorAddress(operator),
      handleConnectSession(),
      handleDisconnectSession(),
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
    .pipe(tap(handleProbeMessage()), tap(handleOpAddressMessage()), tap(handleButtonsMessage()))
    .subscribe();
  operatorProbeNum$.pipe(tap((num) => updateState((state) => ({ ...state, probeNum: num })))).subscribe();
  operatorAddress$.pipe(tap((address) => updateState((state) => ({ ...state, opAddress: address })))).subscribe();
}

main();
