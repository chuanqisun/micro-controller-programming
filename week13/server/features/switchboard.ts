import type { BLEDevice } from "./ble";
import type { Handler } from "./http";
import { updateState } from "./state";

/**
 * /api/blink?id=num
 */
export function handleBlinkLED(switchboard: BLEDevice): Handler {
  return (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (req.method !== "POST" || url.pathname !== "/api/sw/blink") return false;
    const id = url.searchParams.get("id");
    switchboard.send(`blink:${id}`);
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));

    return true;
  };
}

export function handleConnectSwitchboard(switchboard: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/sw/connect") return false;

    await switchboard.connect();
    updateState((state) => ({ ...state, swConnected: true }));

    return true;
  };
}

export function handleDisconnectSwitchboard(switchboard: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/sw/disconnect") return false;

    await switchboard.disconnect();
    updateState((state) => ({ ...state, swConnected: false }));

    return true;
  };
}
