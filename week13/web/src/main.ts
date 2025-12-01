import { tap } from "rxjs";
import { appendDiagnosticsError, updateDiagnosticsState } from "./features/diagnostics";
import { initOperatorUI, updateOperatorUI } from "./features/operator";
import { createSSEObservable } from "./features/sse";
import { state$, stateChange$ } from "./features/state";
import { initSwitchboardUI, updateSwitchboardUI } from "./features/switchboard";
import "./style.css";

initSwitchboardUI();
initOperatorUI();

state$.pipe(tap(updateDiagnosticsState)).subscribe();

stateChange$.pipe(tap(updateSwitchboardUI), tap(updateOperatorUI)).subscribe();

export const sseEvents$ = createSSEObservable("http://localhost:3000/api/events");

sseEvents$.subscribe({
  next: (message) => {
    if (message.state) {
      state$.next(message.state);
    }
  },
  error: (error) => {
    appendDiagnosticsError(error);
  },
});
