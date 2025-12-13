import type { BLEDevice } from "./ble";
import type { Handler } from "./http";
import { updateState } from "./state";
import { withTimeout } from "./timeout";

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

/**
 * /api/sw/blinkon?id=num
 */
export function handleBlinkOnLED(switchboard: BLEDevice): Handler {
  return (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (req.method !== "POST" || url.pathname !== "/api/sw/blinkon") return false;
    const id = url.searchParams.get("id");
    switchboard.send(`blinkon:${id}`);
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));

    return true;
  };
}

/**
 * /api/sw/pulseon?id=num
 */
export function handlePulseOnLED(switchboard: BLEDevice): Handler {
  return (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (req.method !== "POST" || url.pathname !== "/api/sw/pulseon") return false;
    const id = url.searchParams.get("id");
    switchboard.send(`pulseon:${id}`);
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));

    return true;
  };
}

export function handleLEDAllOff(switchboard: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/sw/all-off") return false;

    await turnOffAllLED(switchboard);
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));

    return true;
  };
}

export async function turnOnLED(switchboard: BLEDevice, id: number) {
  await switchboard.send(`fadeon:${id}`);
}

export async function blinkOnLED(switchboard: BLEDevice, id: number) {
  await switchboard.send(`blinkon:${id}`);
}

export async function pulseOnLED(switchboard: BLEDevice, id: number) {
  await switchboard.send(`pulseon:${id}`);
}

export async function turnOffAllLED(switchboard: BLEDevice) {
  await switchboard.send(`fadeoff:all`);
}

export function handleConnectSwitchboard(switchboard: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/sw/connect") return false;

    updateState((state) => ({ ...state, swConnection: "busy" }));
    try {
      await withTimeout(switchboard.connect(), 15000);
      turnOffAllLED(switchboard);
      updateState((state) => ({ ...state, swConnection: "connected" }));
    } catch (error) {
      updateState((state) => ({ ...state, swConnection: "disconnected" }));
    }

    res.writeHead(200);
    res.end();

    return true;
  };
}

export function handleDisconnectSwitchboard(switchboard: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/sw/disconnect") return false;

    updateState((state) => ({ ...state, swConnection: "busy" }));
    try {
      await withTimeout(switchboard.disconnect(), 15000);
    } catch (error) {
      console.error("Error disconnecting switchboard:", error);
    } finally {
      updateState((state) => ({ ...state, swConnection: "disconnected" }));
    }

    res.writeHead(200);
    res.end();

    return true;
  };
}
