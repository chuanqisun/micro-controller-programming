import { html, render } from "lit-html";
import type { StateChange } from "./state";

const startBtn = document.getElementById("start-adventure") as HTMLButtonElement;
const adventureLog = document.getElementById("adventure-log") as HTMLDivElement;

export function initAdventureUI() {
  startBtn.addEventListener("click", async () => {
    fetch("http://localhost:3000/api/adventure/start", { method: "POST" });
  });
}

export function updateAdventureUI(stateChange: StateChange) {
  const historyItems = stateChange.current.storyHistory;
  render(html` ${historyItems.map((entry) => html`<p>${entry}</p>`)} `, adventureLog);
}
