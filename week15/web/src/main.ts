import { tap } from "rxjs";
import { appendDiagnosticsError, updateDiagnosticsState } from "./features/diagnostics";
import { initGameUI } from "./features/game";
import { initOperatorUI, updateOperatorUI } from "./features/operator";
import { initPlaybackUI, updatePlaybackUI } from "./features/playback";
import { initSimulationUI, updateSimulationUI } from "./features/simulation";
import { createSSEObservable } from "./features/sse";
import { state$, stateChange$ } from "./features/state";
import { initSwitchboardUI, updateSwitchboardUI } from "./features/switchboard";
import "./style.css";

initSwitchboardUI();
initOperatorUI();
initSimulationUI();
initPlaybackUI();
initGameUI();

state$.pipe(tap(updateDiagnosticsState)).subscribe();

stateChange$.pipe(tap(updateSwitchboardUI), tap(updateOperatorUI), tap(updateSimulationUI), tap(updatePlaybackUI)).subscribe();

export const sseEvents$ = createSSEObservable("http://localhost:3000/api/events");

sseEvents$.subscribe({
  next: (message) => {
    if (message.state) {
      state$.next(message.state);
    }
    if (message.gameLog !== undefined) {
      const gameLogEl = document.getElementById("gameLog");
      if (gameLogEl) {
        gameLogEl.textContent = message.gameLog;
      }
    }
  },
  error: (error) => {
    appendDiagnosticsError(error);
  },
});
