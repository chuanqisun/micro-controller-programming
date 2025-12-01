import { LAPTOP_UDP_RX_PORT } from "./config";
import { BLEDevice, opMac, swMac } from "./features/ble";
import { createHttpServer, type Handler } from "./features/http";
import { getServerAddress } from "./features/net";

const operator = new BLEDevice(opMac);
const switchboard = new BLEDevice(swMac);

async function main() {
  createHttpServer([handleBlinkLED(switchboard)]);

  await switchboard.connect();
  // await operator.connect();

  operator.message$.subscribe((msg) => {
    console.log("[DEBUG] op tx:", msg);
  });

  await operator.send(`server:${await getServerAddress()}:${LAPTOP_UDP_RX_PORT}`);
}

main();

/**
 * /api/blink?id=num
 */
function handleBlinkLED(switchboard: BLEDevice): Handler {
  return (req, res) => {
    if (req.method === "POST" && req.url === "/api/blink") {
      const url = new URL(req.url!, `http://${req.headers.host}`);
      const id = url.searchParams.get("id");

      switchboard.send(`blink:${id}`);

      return true;
    }

    return false;
  };
}
