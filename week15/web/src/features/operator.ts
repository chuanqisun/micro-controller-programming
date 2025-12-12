import type { StateChange } from "./state";

const connectBtnOp = document.getElementById("connectBtnOp") as HTMLButtonElement;

export function initOperatorUI() {
  connectBtnOp.addEventListener("click", async () => {
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

    (document.getElementById(`blinkOn${i}`) as HTMLButtonElement).addEventListener("click", () => {
      fetch(`http://localhost:3000/api/sw/blinkon?id=${i}`, { method: "POST" });
    });
  }

  for (let i = 0; i < 8; i++) {
    (document.getElementById(`probe${i}`) as HTMLButtonElement).addEventListener("click", () => {
      fetch(`http://localhost:3000/api/probe?id=${i}`, { method: "POST" });
    });
  }

  // Button press-hold handlers
  const btnConfigs = [
    { id: "btnBtn1", mode: "btn1" },
    { id: "btnBtn2", mode: "btn2" },
    { id: "btnBoth", mode: "both" },
  ];

  for (const { id, mode } of btnConfigs) {
    const btn = document.getElementById(id) as HTMLButtonElement;
    const sendBtn = (m: string) => fetch(`http://localhost:3000/api/btn?mode=${m}`, { method: "POST" });

    btn.addEventListener("mousedown", () => sendBtn(mode));
    btn.addEventListener("mouseup", () => sendBtn("none"));
  }
}

export function updateOperatorUI(stateChange: StateChange) {
  connectBtnOp.textContent = stateChange.current.opConnection === "connected" ? "Disconnect" : "Connect";
  connectBtnOp.disabled = stateChange.current.opConnection === "busy";
}
