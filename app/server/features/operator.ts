import { debounceTime, distinctUntilChanged, filter, map, merge, scan, Subject, type Observable } from "rxjs";
import type { BLEDevice } from "./ble";
import type { Handler } from "./http";
import { updateOperatorByIndex, updateState } from "./state";
import { withTimeout } from "./timeout";
import { getServerAddress } from "./udp";

/**
 * Message with operator context (MAC address for multiplexing).
 */
export interface OperatorMessage {
  mac: string;
  message: string;
}

/**
 * Probe data with operator context.
 */
export interface OperatorProbe {
  mac: string;
  operatorIndex: number;
  probeNum: number;
}

/**
 * Button state with operator context.
 */
export interface OperatorButtons {
  mac: string;
  operatorIndex: number;
  btn1: boolean;
  btn2: boolean;
}

/**
 * Address update with operator context.
 */
export interface OperatorAddress {
  mac: string;
  operatorIndex: number;
  address: string;
}

// Raw probe values keyed by operator index
const probeRawByOperator$ = new Subject<{ operatorIndex: number; probeValue: string }>();

// Centralized observables that emit operator-contextualized data
export const operatorProbeNum$ = probeRawByOperator$.pipe(
  // Debounce per operator - we use the operatorIndex as part of distinctUntilChanged
  distinctUntilChanged((a, b) => a.operatorIndex === b.operatorIndex && a.probeValue === b.probeValue),
  debounceTime(500),
  map(({ operatorIndex, probeValue }) => ({
    operatorIndex,
    probeNum: parseInt(probeValue, 2),
  }))
);

export const operatorButtons$ = new Subject<OperatorButtons>();
export const operatorAddress$ = new Subject<OperatorAddress>();

/**
 * Tracks the active operator index based on last activity.
 * Activity is defined as:
 * - Button state change (press or release)
 * - Probe number change to anything other than 7 (unplugged)
 */
export const activeOperatorIndex$: Observable<number> = merge(
  // Button activity - any button state change makes the operator active
  operatorButtons$.pipe(map(({ operatorIndex }) => operatorIndex)),
  // Probe activity - only when probing (not unplugged, which is 7)
  operatorProbeNum$.pipe(
    filter(({ probeNum }) => probeNum !== 7),
    map(({ operatorIndex }) => operatorIndex)
  )
).pipe(
  distinctUntilChanged(),
  // Emit immediately when operator changes
  scan((_prev, curr) => curr, 0)
);

/**
 * Creates HTTP handlers for a specific operator device.
 * The operatorIndex is used to update the correct operator in the state array.
 */
export function createOperatorHandlers(operator: BLEDevice, operatorIndex: number) {
  const mac = operator.mac;

  const handleConnect: Handler = async (req, res) => {
    if (req.method !== "POST" || req.url !== `/api/op/${operatorIndex}/connect`) return false;

    updateState((state) => updateOperatorByIndex(state, operatorIndex, (op) => ({ ...op, connection: "busy" })));
    try {
      await withTimeout(operator.connect(), 15000);
      updateState((state) => updateOperatorByIndex(state, operatorIndex, (op) => ({ ...op, connection: "connected" })));
    } catch (error) {
      updateState((state) => updateOperatorByIndex(state, operatorIndex, (op) => ({ ...op, connection: "disconnected" })));
    }

    res.writeHead(200);
    res.end();
    return true;
  };

  const handleDisconnect: Handler = async (req, res) => {
    if (req.method !== "POST" || req.url !== `/api/op/${operatorIndex}/disconnect`) return false;

    updateState((state) => updateOperatorByIndex(state, operatorIndex, (op) => ({ ...op, connection: "busy" })));
    try {
      await withTimeout(operator.disconnect(), 15000);
    } catch (error) {
      console.error(`Error disconnecting operator ${operatorIndex}:`, error);
    } finally {
      updateState((state) => updateOperatorByIndex(state, operatorIndex, (op) => ({ ...op, connection: "disconnected" })));
    }

    res.writeHead(200);
    res.end();
    return true;
  };

  const handleRequestAddress: Handler = async (req, res) => {
    if (req.method !== "POST" || req.url !== `/api/op/${operatorIndex}/request-address`) return false;
    await operator.send(`server:${getServerAddress()}`);

    res.writeHead(200);
    res.end();
    return true;
  };

  // Message handlers for this specific operator
  const handleProbeMessage = (message: string) => {
    if (message.startsWith("probe:")) {
      const probeValue = message.split(":")[1];
      probeRawByOperator$.next({ operatorIndex, probeValue });
    }
  };

  const handleOpAddressMessage = (message: string) => {
    if (message.startsWith("operator:")) {
      const address = message.split(":").slice(1).join(":");
      operatorAddress$.next({ mac, operatorIndex, address });
    }
  };

  const handleButtonsMessage = (message: string) => {
    if (message.startsWith("buttons:")) {
      const buttonsValue = message.split(":")[1];
      const [btn1Str, btn2Str] = buttonsValue.split(",");
      const btn1 = btn1Str === "on";
      const btn2 = btn2Str === "on";
      operatorButtons$.next({ mac, operatorIndex, btn1, btn2 });
    }
  };

  const logMessage = (message: string) => {
    console.log(`[Operator ${operatorIndex}]: ${message}`);
  };

  return {
    handlers: [handleConnect, handleDisconnect, handleRequestAddress],
    messageHandlers: { handleProbeMessage, handleOpAddressMessage, handleButtonsMessage, logMessage },
  };
}

/**
 * Creates message handlers for a specific operator (identified by index).
 */
export function createOperatorMessageHandlers(operatorIndex: number, mac: string) {
  const handleProbeMessage = () => (message: string) => {
    if (message.startsWith("probe:")) {
      const probeValue = message.split(":")[1];
      probeRawByOperator$.next({ operatorIndex, probeValue });
    }
  };

  const handleOpAddressMessage = () => (message: string) => {
    if (message.startsWith("operator:")) {
      const address = message.split(":").slice(1).join(":");
      operatorAddress$.next({ mac, operatorIndex, address });
    }
  };

  const handleButtonsMessage = () => (message: string) => {
    if (message.startsWith("buttons:")) {
      const buttonsValue = message.split(":")[1];
      const [btn1Str, btn2Str] = buttonsValue.split(",");
      const btn1 = btn1Str === "on";
      const btn2 = btn2Str === "on";
      operatorButtons$.next({ mac, operatorIndex, btn1, btn2 });
    }
  };

  return { handleProbeMessage, handleOpAddressMessage, handleButtonsMessage };
}

export function handleProbeApi(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/api/probe")) return false;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = parseInt(url.searchParams.get("id") ?? "0", 10);
    const operatorIndex = parseInt(url.searchParams.get("op") ?? "0", 10);
    // Convert probe index to 3-bit binary string (e.g., 0 -> "000", 5 -> "101")
    const binaryProbe = id.toString(2).padStart(3, "0");
    probeRawByOperator$.next({ operatorIndex, probeValue: binaryProbe });

    res.writeHead(200);
    res.end();
    return true;
  };
}

export function handleBtnApi(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/api/btn")) return false;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const mode = url.searchParams.get("mode") ?? "none";
    const operatorIndex = parseInt(url.searchParams.get("op") ?? "0", 10);

    let btn1 = false;
    let btn2 = false;

    if (mode === "btn1") {
      btn1 = true;
    } else if (mode === "btn2") {
      btn2 = true;
    } else if (mode === "both") {
      btn1 = true;
      btn2 = true;
    }

    operatorButtons$.next({ mac: "", operatorIndex, btn1, btn2 });

    res.writeHead(200);
    res.end();
    return true;
  };
}

export function logOperatorMessage(operatorIndex: number) {
  return (message: string) => {
    console.log(`[Operator ${operatorIndex}]: ${message}`);
  };
}
