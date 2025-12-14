import { createSSEObservable } from "./sse";

const newGameBtn = document.getElementById("newGameBtn") as HTMLButtonElement;
const gamePhaseEl = document.getElementById("gamePhase") as HTMLSpanElement;
const gameSummaryEl = document.getElementById("gameSummary") as HTMLPreElement;

export function initGameUI() {
  newGameBtn.addEventListener("click", async () => {
    await fetch("http://localhost:3000/api/game/new", { method: "POST" });
  });

  createSSEObservable("http://localhost:3000/api/events").subscribe((msg) => {
    if (msg.type === "gameState") {
      renderGameState(msg);
    } else if (msg.type === "gameStateSummary") {
      gameSummaryEl.textContent = msg.summary;
    }
  });
}

function renderGameState(state: any) {
  gamePhaseEl.textContent = state.phase;
}
