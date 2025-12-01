import { Observable, Subject, tap } from "rxjs";
import { type AppState } from "../../server/features/state";
import { createSSEObservable } from "./features/sse";
import "./style.css";

const rawStateDisplay = document.getElementById("rawState") as HTMLDivElement;

// Switchboard UI elements
const connectBtnSw = document.getElementById("connectBtnSw") as HTMLButtonElement;
const offAllBtn = document.getElementById("offAll") as HTMLButtonElement;

const state$ = new Subject<AppState>();

export const stateChange$: Observable<{ previous: AppState | undefined; current: AppState }> = new Observable(
  (subscriber) => {
    let previousState: AppState | undefined = undefined;
    state$.subscribe((currentState) => {
      subscriber.next({ previous: previousState, current: currentState });
      previousState = currentState;
    });

    return () => state$.unsubscribe();
  },
);

connectBtnSw.addEventListener("click", () => {
  connectBtnSw.disabled = true;
  if (connectBtnSw.textContent === "Connect") {
    fetch("http://localhost:3000/api/sw/connect", { method: "POST" });
  } else {
    fetch("http://localhost:3000/api/sw/disconnect", { method: "POST" });
  }
});

for (let i = 0; i < 7; i++) {
  (document.getElementById(`led${i}`) as HTMLButtonElement).addEventListener("click", () => {
    fetch(`http://localhost:3000/api/sw/blink?id=${i}`, { method: "POST" });
  });
}

offAllBtn.addEventListener("click", () => {});

state$
  .pipe(
    tap((state) => {
      rawStateDisplay.textContent = JSON.stringify(state);
    }),
  )
  .subscribe();

stateChange$
  .pipe(
    tap((state) => {
      if (state.previous?.swConnected !== state.current.swConnected) {
        connectBtnSw.disabled = false;
        connectBtnSw.textContent = state.current.swConnected ? "Disconnect" : "Connect";
      }
    }),
  )
  .subscribe();

export const sseEvents$ = createSSEObservable("http://localhost:3000/api/events");

sseEvents$.subscribe({
  next: (message) => {
    if (message.state) {
      state$.next(message.state);
    }
  },
  error: (error) => {
    rawStateDisplay.textContent += `[${now()}] SSE error: ${JSON.stringify(error)}\n`;
  },
});

function now() {
  return new Date().toISOString().substring(11, 23);
}
