import type { OperatorState } from "../../../server/features/state";
import type { StateChange } from "./state";

const API_BASE = "http://localhost:3000";

/**
 * Initialize UI for all operator panels.
 * Each panel is identified by data-operator attribute (0, 1, etc.)
 */
export function initOperatorUI() {
  const panels = document.querySelectorAll<HTMLDivElement>(".operator-panel");

  panels.forEach((panel) => {
    const operatorIndex = parseInt(panel.dataset.operator ?? "0", 10);
    initOperatorPanel(panel, operatorIndex);
  });
}

/**
 * Initialize a single operator panel with all its controls.
 */
function initOperatorPanel(panel: HTMLDivElement, operatorIndex: number) {
  // Connect/Disconnect toggle button
  const connectBtn = panel.querySelector<HTMLButtonElement>(".connectBtnOp");
  connectBtn?.addEventListener("click", async () => {
    if (connectBtn.textContent === "Connect") {
      await fetch(`${API_BASE}/api/op/${operatorIndex}/connect`, { method: "POST" });
      await fetch(`${API_BASE}/api/op/${operatorIndex}/request-address`, { method: "POST" });
    } else {
      fetch(`${API_BASE}/api/op/${operatorIndex}/disconnect`, { method: "POST" });
    }
  });

  // Probe buttons
  const probeButtons = panel.querySelectorAll<HTMLButtonElement>(".probe");
  probeButtons.forEach((btn) => {
    const probeId = btn.dataset.probe;
    btn.addEventListener("click", () => {
      fetch(`${API_BASE}/api/probe?id=${probeId}&op=${operatorIndex}`, { method: "POST" });
    });
  });

  // Button press-hold handlers
  const btnConfigs = [
    { selector: ".btnBtn1", mode: "btn1" },
    { selector: ".btnBtn2", mode: "btn2" },
    { selector: ".btnBoth", mode: "both" },
  ];

  for (const { selector, mode } of btnConfigs) {
    const btn = panel.querySelector<HTMLButtonElement>(selector);
    if (!btn) continue;

    const sendBtn = (m: string) => fetch(`${API_BASE}/api/btn?mode=${m}&op=${operatorIndex}`, { method: "POST" });

    btn.addEventListener("mousedown", () => sendBtn(mode));
    btn.addEventListener("mouseup", () => sendBtn("none"));
  }

  // Play file button
  const playFileBtn = panel.querySelector<HTMLButtonElement>(".playFileBtn");
  playFileBtn?.addEventListener("click", async () => {
    await fetch(`${API_BASE}/api/play-file?op=${operatorIndex}`, { method: "POST" });
  });

  // Stop playback button
  const stopPlaybackBtn = panel.querySelector<HTMLButtonElement>(".stopPlaybackBtn");
  stopPlaybackBtn?.addEventListener("click", async () => {
    await fetch(`${API_BASE}/api/stop-playback?op=${operatorIndex}`, { method: "POST" });
  });
}

/**
 * Update all operator panel UIs based on state changes.
 */
export function updateOperatorUI(stateChange: StateChange) {
  const panels = document.querySelectorAll<HTMLDivElement>(".operator-panel");

  panels.forEach((panel) => {
    const operatorIndex = parseInt(panel.dataset.operator ?? "0", 10);
    const operator = stateChange.current.operators[operatorIndex];

    if (operator) {
      updateOperatorPanel(panel, operator);
    }
  });
}

/**
 * Update a single operator panel based on its state.
 */
function updateOperatorPanel(panel: HTMLDivElement, operator: OperatorState) {
  const connectBtn = panel.querySelector<HTMLButtonElement>(".connectBtnOp");
  const playFileBtn = panel.querySelector<HTMLButtonElement>(".playFileBtn");
  const stopPlaybackBtn = panel.querySelector<HTMLButtonElement>(".stopPlaybackBtn");

  if (connectBtn) {
    connectBtn.textContent = operator.connection === "connected" ? "Disconnect" : "Connect";
    connectBtn.disabled = operator.connection === "busy";
  }

  // Playback requires operator to be connected with an address
  const hasOpAddress = !!operator.address;
  if (playFileBtn) {
    playFileBtn.disabled = !hasOpAddress;
  }
  if (stopPlaybackBtn) {
    stopPlaybackBtn.disabled = !hasOpAddress;
  }

  // Update probe button active states
  const probeButtons = panel.querySelectorAll<HTMLButtonElement>(".probe");
  probeButtons.forEach((btn) => {
    const probeId = parseInt(btn.dataset.probe ?? "-1", 10);
    if (probeId === operator.probeNum) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  });

  // Update button state active classes
  const btn1Btn = panel.querySelector<HTMLButtonElement>(".btnBtn1");
  const btn2Btn = panel.querySelector<HTMLButtonElement>(".btnBtn2");
  const bothBtn = panel.querySelector<HTMLButtonElement>(".btnBoth");

  if (btn1Btn) {
    btn1Btn.classList.toggle("active", operator.btn1 && !operator.btn2);
  }
  if (btn2Btn) {
    btn2Btn.classList.toggle("active", operator.btn2 && !operator.btn1);
  }
  if (bothBtn) {
    bothBtn.classList.toggle("active", operator.btn1 && operator.btn2);
  }
}
