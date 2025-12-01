import { tap } from "rxjs";
import { LAPTOP_UDP_RX_PORT } from "./config";
import { BLEDevice, opMac, swMac } from "./features/ble";
import { createHttpServer } from "./features/http";
import { getServerAddress } from "./features/net";
import { broadcast, handleSSE } from "./features/sse";
import { appState$ } from "./features/state";
import { handleBlinkLED, handleConnectSwitchboard } from "./features/switchboard";

const operator = new BLEDevice(opMac);
const switchboard = new BLEDevice(swMac);

async function main() {
  createHttpServer([handleSSE(), handleBlinkLED(switchboard), handleConnectSwitchboard(switchboard)]);

  appState$.pipe(tap(broadcast)).subscribe();

  operator.message$.subscribe((msg) => {
    console.log("[DEBUG] op tx:", msg);
  });

  await operator.send(`server:${await getServerAddress()}:${LAPTOP_UDP_RX_PORT}`);
}

main();
