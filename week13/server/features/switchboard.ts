import type { BLEDevice } from "./ble";
import type { Handler } from "./http";

/**
 * /api/blink?id=num
 */
export function handleBlinkLED(switchboard: BLEDevice): Handler {
  return (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (req.method !== "POST" || url.pathname !== "/api/blink") return false;
    const id = url.searchParams.get("id");
    switchboard.send(`blink:${id}`);
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));

    return true;
  };
}

export function handleConnectSwitchboard(switchboard: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/connect-sw") return false;
    await switchboard.connect();
    return true;
  };
}
