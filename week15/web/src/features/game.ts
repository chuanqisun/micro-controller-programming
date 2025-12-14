import { createSSEObservable } from "./sse";

const newGameBtn = document.getElementById("newGameBtn") as HTMLButtonElement;
const gamePhaseEl = document.getElementById("gamePhase") as HTMLSpanElement;

export function initGameUI() {
  newGameBtn.addEventListener("click", async () => {
    await fetch("http://localhost:3000/api/game/new", { method: "POST" });
  });

  createSSEObservable("http://localhost:3000/api/events").subscribe((msg) => {
    if (msg.type === "gameState") {
      renderGameState(msg);
    }
  });
}

function renderGameState(state: any) {
  gamePhaseEl.textContent = state.phase;
}
