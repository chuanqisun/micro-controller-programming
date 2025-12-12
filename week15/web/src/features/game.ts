import { createSSEObservable } from "./sse";

const newGameBtn = document.getElementById("newGameBtn") as HTMLButtonElement;
const gamePhaseEl = document.getElementById("gamePhase") as HTMLSpanElement;
const sceneNameEl = document.getElementById("sceneName") as HTMLSpanElement;
const lastActionEl = document.getElementById("lastAction") as HTMLSpanElement;
const actionOptionsEl = document.getElementById("actionOptions") as HTMLDivElement;
const sceneElementsEl = document.getElementById("sceneElements") as HTMLDivElement;

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
  sceneNameEl.textContent = state.sceneName || "-";
  lastActionEl.textContent = state.lastActionChoice || "-";

  if (state.phase === "action" && state.actionOptions) {
    actionOptionsEl.style.display = "block";
    actionOptionsEl.innerHTML = `
      <strong>Options:</strong><br>
      A: ${state.actionOptions.a}<br>
      B: ${state.actionOptions.b}
    `;
  } else {
    actionOptionsEl.style.display = "none";
  }

  if (state.elements && state.elements.length > 0) {
    sceneElementsEl.innerHTML = `
      <h3>Scene Elements:</h3>
      <ul>
        ${state.elements
          .map(
            (e: any) => `
          <li>
            <strong>${e.name}</strong> (Probe ${e.probeId}) - ${e.status}
          </li>
        `
          )
          .join("")}
      </ul>
    `;
  } else {
    sceneElementsEl.innerHTML = "<p>No elements in scene</p>";
  }
}
