import type { StateChange } from "./state";

const connectBtnSw = document.getElementById("connectBtnSw") as HTMLButtonElement;
const offAllBtn = document.getElementById("offAll") as HTMLButtonElement;

export function initSwitchboardUI() {
  connectBtnSw.addEventListener("click", () => {
    connectBtnSw.disabled = true;
    if (connectBtnSw.textContent === "Connect") {
      fetch("http://localhost:3000/api/sw/connect", { method: "POST" });
    } else {
      fetch("http://localhost:3000/api/sw/disconnect", { method: "POST" });
    }
  });
}

export function updateSwitchboardUI(stateChange: StateChange) {
  connectBtnSw.textContent = stateChange.current.swConnection === "connected" ? "Disconnect" : "Connect";
  connectBtnSw.disabled = stateChange.current.swConnection === "busy";
}
