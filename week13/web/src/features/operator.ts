import type { StateChange } from "./state";

const connectBtnOp = document.getElementById("connectBtnOp") as HTMLButtonElement;

export function initOperatorUI() {
  connectBtnOp.addEventListener("click", async () => {
    connectBtnOp.disabled = true;
    if (connectBtnOp.textContent === "Connect") {
      await fetch("http://localhost:3000/api/op/connect", { method: "POST" });
      await fetch("http://localhost:3000/api/op/request-address", { method: "POST" });
    } else {
      fetch("http://localhost:3000/api/op/disconnect", { method: "POST" });
    }
  });

  for (let i = 0; i < 7; i++) {
    (document.getElementById(`led${i}`) as HTMLButtonElement).addEventListener("click", () => {
      fetch(`http://localhost:3000/api/sw/blink?id=${i}`, { method: "POST" });
    });
  }
}

export function updateOperatorUI(stateChange: StateChange) {
  connectBtnOp.textContent = stateChange.current.opConnected ? "Disconnect" : "Connect";
  connectBtnOp.disabled = stateChange.current.opConnecting;
}
