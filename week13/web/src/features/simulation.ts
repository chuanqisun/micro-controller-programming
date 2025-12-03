import type { StateChange } from "./state";

const connectBtnSim = document.getElementById("connectBtnSim") as HTMLButtonElement;

export function initSimulationUI() {
  connectBtnSim.addEventListener("click", async () => {
    if (connectBtnSim.textContent === "Connect") {
      fetch("http://localhost:3000/api/ai/connect", { method: "POST" });
      // fetch("http://localhost:3000/api/gemini/connect", { method: "POST" });
    } else {
      fetch("http://localhost:3000/api/ai/disconnect", { method: "POST" });
      // fetch("http://localhost:3000/api/gemini/disconnect", { method: "POST" });
    }
  });
}

export function updateSimulationUI(stateChange: StateChange) {
  connectBtnSim.textContent = stateChange.current.aiConnection === "connected" ? "Disconnect" : "Connect";
  connectBtnSim.disabled = stateChange.current.aiConnection === "busy";
}
