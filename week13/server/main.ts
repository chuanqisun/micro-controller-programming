import { map, tap } from "rxjs";
import { LAPTOP_UDP_RX_PORT } from "./config";
import { BLEDevice, opMac, swMac } from "./features/ble";
import { createHttpServer } from "./features/http";
import { getServerAddress } from "./features/net";
import {
  handleConnectOperator,
  handleDisconnectOperator,
  handleOpAddress,
  handleProbeMessage,
  handleRequestOperatorAddress,
  operatorAddress$,
  probeNum$,
} from "./features/operator";
import { broadcast, handleSSE, newSseClient$ } from "./features/sse";
import { appState$, updateState } from "./features/state";
import { handleBlinkLED, handleConnectSwitchboard, handleDisconnectSwitchboard } from "./features/switchboard";

const operator = new BLEDevice(opMac);
const switchboard = new BLEDevice(swMac);

async function main() {
  createHttpServer([
    handleSSE(),
    handleBlinkLED(switchboard),
    handleConnectSwitchboard(switchboard),
    handleDisconnectSwitchboard(switchboard),
    handleConnectOperator(operator),
    handleDisconnectOperator(operator),
    handleRequestOperatorAddress(operator),
  ]);

  appState$
    .pipe(
      map((state) => ({ state })),
      tap(broadcast),
    )
    .subscribe();

  newSseClient$.pipe(tap(() => broadcast({ state: appState$.value }))).subscribe();

  operator.message$.pipe(tap(handleProbeMessage()), tap(handleOpAddress())).subscribe();
  probeNum$.pipe(tap((num) => updateState((state) => ({ ...state, probeNum: num })))).subscribe();
  operatorAddress$.pipe(tap((address) => updateState((state) => ({ ...state, opAddress: address })))).subscribe();

  await operator.send(`server:${await getServerAddress()}:${LAPTOP_UDP_RX_PORT}`);
}

main();
