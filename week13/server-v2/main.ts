import { LAPTOP_UDP_RX_PORT } from "./config";
import { BLEDevice, opMac } from "./features/ble";
import { getServerAddress } from "./features/net";

async function main() {
  const operator = new BLEDevice(opMac);
  await operator.connect();

  operator.message$.subscribe((msg) => {
    console.log("[DEBUG] op tx:", msg);
  });

  await operator.send(`server:${await getServerAddress()}:${LAPTOP_UDP_RX_PORT}`);
}

main();
