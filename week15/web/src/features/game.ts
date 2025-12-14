import { createSSEObservable } from "./sse";

const newGameBtn = document.getElementById("newGameBtn") as HTMLButtonElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const gamePhaseEl = document.getElementById("gamePhase") as HTMLSpanElement;
const gameSummaryEl = document.getElementById("gameSummary") as HTMLPreElement;
const audioOutputRadios = document.querySelectorAll('input[name="audioOutput"]') as NodeListOf<HTMLInputElement>;

export function initGameUI() {
  newGameBtn.addEventListener("click", async () => {
    await fetch("http://localhost:3000/api/game/new", { method: "POST" });
  });

  resetBtn.addEventListener("click", async () => {
    if (confirm("Are you sure you want to restart the server?")) {
      await fetch("http://localhost:3000/api/reset", { method: "POST" });
    }
  });

  audioOutputRadios.forEach((radio) => {
    radio.addEventListener("change", async () => {
      if (radio.checked) {
        await fetch("http://localhost:3000/api/audio-output", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: radio.value }),
        });
      }
    });
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
