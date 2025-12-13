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

  offAllBtn.addEventListener("click", () => {
    fetch("http://localhost:3000/api/sw/all-off", { method: "POST" });
  });

  // LED blink buttons
  for (let i = 0; i < 7; i++) {
    const ledBtn = document.getElementById(`led${i}`) as HTMLButtonElement | null;
    ledBtn?.addEventListener("click", () => {
      fetch(`http://localhost:3000/api/sw/blink?id=${i}`, { method: "POST" });
    });

    const blinkOnBtn = document.getElementById(`blinkOn${i}`) as HTMLButtonElement | null;
    blinkOnBtn?.addEventListener("click", () => {
      fetch(`http://localhost:3000/api/sw/blinkon?id=${i}`, { method: "POST" });
    });
  }
}

export function updateSwitchboardUI(stateChange: StateChange) {
  connectBtnSw.textContent = stateChange.current.swConnection === "connected" ? "Disconnect" : "Connect";
  connectBtnSw.disabled = stateChange.current.swConnection === "busy";
}
