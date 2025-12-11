import type { StateChange } from "./state";

const connectBtnSim = document.getElementById("connectBtnSim") as HTMLButtonElement;
const aiTextInput = document.getElementById("aiText") as HTMLInputElement;
const aiSendBtn = document.getElementById("aiSend") as HTMLButtonElement;

export function initSimulationUI() {
  connectBtnSim.addEventListener("click", async () => {
    if (connectBtnSim.textContent === "Connect") {
      fetch("http://localhost:3000/api/gemini/connect", { method: "POST" });
    } else {
      fetch("http://localhost:3000/api/gemini/disconnect", { method: "POST" });
    }
  });

  aiSendBtn.addEventListener("click", sendAiText);
  aiTextInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      sendAiText();
    }
  });
}

function sendAiText() {
  const text = aiTextInput.value.trim();
  if (!text) return;

  fetch("http://localhost:3000/api/gemini/send-text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  aiTextInput.value = "";
}

export function updateSimulationUI(stateChange: StateChange) {
  connectBtnSim.textContent = stateChange.current.aiConnection === "connected" ? "Disconnect" : "Connect";
  connectBtnSim.disabled = stateChange.current.aiConnection === "busy";
}
