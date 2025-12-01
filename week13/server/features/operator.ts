import { debounceTime, distinctUntilChanged, map, Subject } from "rxjs";
import { LAPTOP_UDP_RX_PORT } from "../config";
import type { BLEDevice } from "./ble";
import type { Handler } from "./http";
import { getServerAddress } from "./net";
import { updateState } from "./state";
import { withTimeout } from "./timeout";

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
    await operator.send(`server:${await getServerAddress()}:${LAPTOP_UDP_RX_PORT}`);

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

export function handleOpAddress() {
  return (message: string) => {
    console.log("Received operator address message:", message);
    if (message.startsWith("operator:")) {
      const address = message.split(":").slice(1).join(":");
      operatorAddressInternal$.next(address);
    }
  };
}
