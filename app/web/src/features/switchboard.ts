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

  // LED cycle buttons (off -> pulseon -> blinkon -> fadeon -> off)
  for (let i = 0; i < 7; i++) {
    const blinkOnBtn = document.getElementById(`blinkOn${i}`) as HTMLButtonElement | null;
    blinkOnBtn?.addEventListener("click", () => {
      // Get current state from the button's class
      const currentState = blinkOnBtn.classList.contains("pulseon")
        ? "pulseon"
        : blinkOnBtn.classList.contains("blinkon")
          ? "blinkon"
          : blinkOnBtn.classList.contains("fadeon")
            ? "fadeon"
            : "off";

      // Cycle to next state
      if (currentState === "off") {
        // off -> pulseon
        fetch(`http://localhost:3000/api/sw/pulseon?id=${i}`, { method: "POST" });
      } else if (currentState === "pulseon") {
        // pulseon -> blinkon
        fetch(`http://localhost:3000/api/sw/blinkon?id=${i}`, { method: "POST" });
      } else if (currentState === "blinkon") {
        // blinkon -> fadeon
        fetch(`http://localhost:3000/api/sw/fadeon?id=${i}`, { method: "POST" });
      } else {
        // fadeon -> off
        fetch(`http://localhost:3000/api/sw/fadeoff?id=${i}`, { method: "POST" });
      }
    });
  }
}

export function updateSwitchboardUI(stateChange: StateChange) {
  connectBtnSw.textContent = stateChange.current.swConnection === "connected" ? "Disconnect" : "Connect";
  connectBtnSw.disabled = stateChange.current.swConnection === "busy";

  // Update LED button animations based on state
  for (let i = 0; i < 7; i++) {
    const btn = document.getElementById(`blinkOn${i}`) as HTMLButtonElement | null;
    if (btn && stateChange.current.leds) {
      const ledStatus = stateChange.current.leds[i];

      // Remove all animation classes
      btn.classList.remove("off", "fadeon", "blinkon", "pulseon");

      // Add the current state class
      if (ledStatus) {
        btn.classList.add(ledStatus);
      }
    }
  }
}
