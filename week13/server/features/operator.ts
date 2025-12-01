import { debounceTime, distinctUntilChanged, map, Subject } from "rxjs";
import { LAPTOP_UDP_RX_PORT } from "../config";
import type { BLEDevice } from "./ble";
import type { Handler } from "./http";
import { getServerAddress } from "./net";
import { updateState } from "./state";
import { withTimeout } from "./timeout";

const probeRaw$ = new Subject<string>();

export const probeNum$ = probeRaw$.pipe(
  distinctUntilChanged(),
  debounceTime(500),
  map((probeValue) => parseInt(probeValue, 2)),
);

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
