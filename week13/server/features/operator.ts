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

export function handleConnectOperator(operator: BLEDevice): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/op/connect") return false;

    updateState((state) => ({ ...state, opConnection: "busy" }));
    try {
      await withTimeout(operator.connect(), 5000);
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
      await withTimeout(operator.disconnect(), 5000);
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

export function handleOpAddressMessage() {
  return (message: string) => {
    console.log("Received operator address message:", message);
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
      updateState((state) => ({ ...state, btn1, btn2 }));
    }
  };
}
