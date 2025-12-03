import { tap } from "rxjs";
import { appendDiagnosticsError, updateDiagnosticsState } from "./features/diagnostics";
import { initOperatorUI, updateOperatorUI } from "./features/operator";
import { initSimulationUI, updateSimulationUI } from "./features/simulation";
import { createSSEObservable } from "./features/sse";
import { state$, stateChange$ } from "./features/state";
import { initSwitchboardUI, updateSwitchboardUI } from "./features/switchboard";
import { initAdventureUI, updateAdventureUI } from "./features/text-adventures";
import "./style.css";

initSwitchboardUI();
initOperatorUI();
initSimulationUI();
initAdventureUI();

state$.pipe(tap(updateDiagnosticsState)).subscribe();

stateChange$
  .pipe(tap(updateSwitchboardUI), tap(updateOperatorUI), tap(updateSimulationUI), tap(updateAdventureUI))
  .subscribe();

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
