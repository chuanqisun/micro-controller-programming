import { BehaviorSubject } from "rxjs";

export type ConnectionStatus = "connected" | "busy" | "disconnected";

export interface AppState {
  aiConnection: ConnectionStatus;
  opConnection: ConnectionStatus;
  opAddress: string;
  probeNum: number;
  btn1: boolean;
  btn2: boolean;
  swConnection: ConnectionStatus;
}

export const appState$ = new BehaviorSubject<AppState>({
  aiConnection: "disconnected",
  opConnection: "disconnected",
  swConnection: "disconnected",
  opAddress: "",
  probeNum: 7,
  btn1: false,
  btn2: false,
});

export function updateState(updateFn: (state: AppState) => AppState) {
  const currentState = appState$.getValue();
  const newState = updateFn(currentState);
  if (JSON.stringify(currentState) === JSON.stringify(newState)) return;

  appState$.next(newState);
}
