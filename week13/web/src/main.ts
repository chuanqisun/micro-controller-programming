import { createSSEObservable } from "./features/sse";
import "./style.css";

const logDiv = document.getElementById("log") as HTMLDivElement;

// Switchboard UI elements
const connectBtnSw = document.getElementById("connectBtnSw") as HTMLButtonElement;
const disconnectBtnSw = document.getElementById("disconnectBtnSw") as HTMLButtonElement;
const offAllBtn = document.getElementById("offAll") as HTMLButtonElement;
const speakTextarea = document.getElementById("speakTextarea") as HTMLTextAreaElement;
const speakBtn = document.getElementById("speakBtn") as HTMLButtonElement;

connectBtnSw.addEventListener("click", () => {
  fetch("http://localhost:3000/api/sw/connect", { method: "POST" });
});

for (let i = 0; i < 7; i++) {
  (document.getElementById(`led${i}`) as HTMLButtonElement).addEventListener("click", () => {
    fetch(`http://localhost:3000/api/sw/blink?id=${i}`, { method: "POST" });
  });
}

offAllBtn.addEventListener("click", () => {});

export const sseEvents$ = createSSEObservable("http://localhost:3000/api/events");

sseEvents$.subscribe({
  next: (message) => {
    logDiv.textContent += `[${now()}] SSE: ${JSON.stringify(message)}\n`;
    logDiv.scrollTop = logDiv.scrollHeight;

    if (message.speak !== undefined) {
      speakTextarea.value = message.speak;
    }
  },
  error: (error) => {
    logDiv.textContent += `[${now()}] SSE error: ${error}\n`;
    logDiv.scrollTop = logDiv.scrollHeight;
  },
});

function now() {
  return new Date().toISOString().substring(11, 23);
}
