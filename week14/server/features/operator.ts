import { debounceTime, distinctUntilChanged, map, Subject } from "rxjs";
import type { BLEDevice } from "./ble";
import type { Handler } from "./http";
import { updateState } from "./state";
import { withTimeout } from "./timeout";
import { getServerAddress } from "./udp";

const probeRaw$ = new Subject<string>();

const operatorAddressInternal$ = new Subject<string>();
export const operatorAddress$ = operatorAddressInternal$.asObservable();
export const operatorProbeNum$ = probeRaw$.pipe(
  distinctUntilChanged(),
  debounceTime(500),
  map((probeValue) => parseInt(probeValue, 2)),
);

export const operatorButtons$ = new Subject<{ btn1: boolean; btn2: boolean }>();

export function handleConnectOperator(operator: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/op/connect") return false;

    updateState((state) => ({ ...state, opConnection: "busy" }));
    try {
      await withTimeout(operator.connect(), 10000);
      updateState((state) => ({ ...state, opConnection: "connected" }));
    } catch (error) {
      updateState((state) => ({ ...state, opConnection: "disconnected" }));
    }

    res.writeHead(200);
    res.end();

    return true;
  };
}

export function handleDisconnectOperator(operator: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/op/disconnect") return false;

    updateState((state) => ({ ...state, opConnection: "busy" }));
    try {
      await withTimeout(operator.disconnect(), 10000);
    } catch (error) {
      console.error("Error disconnecting operator:", error);
    } finally {
      updateState((state) => ({ ...state, opConnection: "disconnected" }));
    }

    res.writeHead(200);
    res.end();

    return true;
  };
}

export function handleRequestOperatorAddress(operator: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/op/request-address") return false;
    await operator.send(`server:${getServerAddress()}`);

    res.writeHead(200);
    res.end();

    return true;
  };
}

export function handleProbeMessage() {
  return (message: string) => {
    if (message.startsWith("probe:")) {
      const probeId = message.split(":")[1];
      probeRaw$.next(probeId);
    }
  };
}

export function handleProbeApi(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/api/probe")) return false;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = parseInt(url.searchParams.get("id") ?? "0", 10);
    // Convert probe index to 3-bit binary string (e.g., 0 -> "000", 5 -> "101")
    const binaryProbe = id.toString(2).padStart(3, "0");
    probeRaw$.next(binaryProbe);

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

    operatorButtons$.next({ btn1, btn2 });

    res.writeHead(200);
    res.end();

    return true;
  };
}

export function handleOpAddressMessage() {
  return (message: string) => {
    if (message.startsWith("operator:")) {
      const address = message.split(":").slice(1).join(":");
      operatorAddressInternal$.next(address);
    }
  };
}

export function handleButtonsMessage() {
  return (message: string) => {
    if (message.startsWith("buttons:")) {
      const buttonsValue = message.split(":")[1];
      const [btn1Str, btn2Str] = buttonsValue.split(",");
      const btn1 = btn1Str === "on";
      const btn2 = btn2Str === "on";
      operatorButtons$.next({ btn1, btn2 });
    }
  };
}

export function logOperatorMessage(message: string) {
  console.log(`[Operator]: ${message}`);
}
