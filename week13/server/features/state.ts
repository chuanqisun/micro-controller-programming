import { BehaviorSubject } from "rxjs";

export interface AppState {
  opConnected: boolean;
  opConnecting: boolean;
  probeNum: number;
  swConnected: boolean;
  swConnecting: boolean;
}

export const appState$ = new BehaviorSubject<AppState>({
  opConnected: false,
  swConnected: false,
  probeNum: 7,
  opConnecting: false,
  swConnecting: false,
});

export function updateState(updateFn: (state: AppState) => AppState) {
  const currentState = appState$.getValue();
  const newState = updateFn(currentState);
  if (JSON.stringify(currentState) === JSON.stringify(newState)) return;

  appState$.next(newState);
}
