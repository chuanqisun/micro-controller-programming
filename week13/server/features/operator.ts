import type { BLEDevice } from "./ble";
import type { Handler } from "./http";
import { updateState } from "./state";
import { withTimeout } from "./timeout";

export function handleConnectOperator(operator: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/op/connect") return false;

    updateState((state) => ({ ...state, opConnecting: true }));
    try {
      await withTimeout(operator.connect(), 5000);
      updateState((state) => ({ ...state, opConnected: true }));
    } catch (error) {
      updateState((state) => ({ ...state, opConnected: false }));
    }
    updateState((state) => ({ ...state, opConnecting: false }));

    res.writeHead(200);
    res.end();

    return true;
  };
}

export function handleDisconnectOperator(operator: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/op/disconnect") return false;

    await operator.disconnect();
    updateState((state) => ({ ...state, opConnected: false }));

    res.writeHead(200);
    res.end();

    return true;
  };
}
