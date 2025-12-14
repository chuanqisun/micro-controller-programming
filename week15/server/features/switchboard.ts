import type { BLEDevice } from "./ble";
import type { Handler } from "./http";
import { turnOffAllLEDStates, updateLEDState, updateState } from "./state";
import { withTimeout } from "./timeout";

/**
 * /api/sw/blinkon?id=num
 */
export function handleBlinkOnLED(switchboard: BLEDevice): Handler {
  return async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (req.method !== "POST" || url.pathname !== "/api/sw/blinkon") return false;
    const id = url.searchParams.get("id");
    await switchboard.send(`blinkon:${id}`);
    updateLEDState(Number(id), "blinkon");
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));

    return true;
  };
}

/**
 * /api/sw/pulseon?id=num
 */
export function handlePulseOnLED(switchboard: BLEDevice): Handler {
  return async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (req.method !== "POST" || url.pathname !== "/api/sw/pulseon") return false;
    const id = url.searchParams.get("id");
    await switchboard.send(`pulseon:${id}`);
    updateLEDState(Number(id), "pulseon");
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));

    return true;
  };
}

export function handleLEDAllOff(switchboard: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/sw/all-off") return false;

    await turnOffAllLED(switchboard);
    turnOffAllLEDStates();
    res.writeHead(200);
    res.end(JSON.stringify({ status: "ok" }));

    return true;
  };
}

export async function turnOnLED(switchboard: BLEDevice, id: number) {
  await switchboard.send(`fadeon:${id}`);
  updateLEDState(id, "fadeon");
}

export async function turnOffLED(switchboard: BLEDevice, id: number) {
  await switchboard.send(`fadeoff:${id}`);
  updateLEDState(id, "off");
}

export async function blinkOnLED(switchboard: BLEDevice, id: number) {
  await switchboard.send(`blinkon:${id}`);
  updateLEDState(id, "blinkon");
}

export async function pulseOnLED(switchboard: BLEDevice, id: number) {
  await switchboard.send(`pulseon:${id}`);
  updateLEDState(id, "pulseon");
}

export async function turnOffAllLED(switchboard: BLEDevice) {
  await switchboard.send(`fadeoff:all`);
  turnOffAllLEDStates();
}

export function handleConnectSwitchboard(switchboard: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/sw/connect") return false;

    updateState((state) => ({ ...state, swConnection: "busy" }));
    try {
      await withTimeout(switchboard.connect(), 15000);
      turnOffAllLED(switchboard);
      turnOffAllLEDStates();
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
