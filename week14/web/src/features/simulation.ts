import type { StateChange } from "./state";

const connectBtnSim = document.getElementById("connectBtnSim") as HTMLButtonElement;
const geminiTextInput = document.getElementById("geminiText") as HTMLInputElement;
const geminiSendBtn = document.getElementById("geminiSend") as HTMLButtonElement;

export function initSimulationUI() {
  connectBtnSim.addEventListener("click", async () => {
    if (connectBtnSim.textContent === "Connect") {
      // fetch("http://localhost:3000/api/ai/connect", { method: "POST" });
      fetch("http://localhost:3000/api/gemini/connect", { method: "POST" });
    } else {
      // fetch("http://localhost:3000/api/ai/disconnect", { method: "POST" });
      fetch("http://localhost:3000/api/gemini/disconnect", { method: "POST" });
    }
  });

  geminiSendBtn.addEventListener("click", sendGeminiText);
  geminiTextInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      sendGeminiText();
    }
  });
}

function sendGeminiText() {
  const text = geminiTextInput.value.trim();
  if (!text) return;

  fetch("http://localhost:3000/api/gemini/send-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  geminiTextInput.value = "";
}

export function updateSimulationUI(stateChange: StateChange) {
  connectBtnSim.textContent = stateChange.current.aiConnection === "connected" ? "Disconnect" : "Connect";
  connectBtnSim.disabled = stateChange.current.aiConnection === "busy";
}
