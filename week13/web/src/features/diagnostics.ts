import type { AppState } from "../../../server/features/state";

const rawStateDisplay = document.getElementById("rawState") as HTMLDivElement;

export function initDiagnosticsUI() {
  // Initialize any diagnostics UI if needed
}

export function updateDiagnosticsState(state: AppState) {
  rawStateDisplay.textContent = JSON.stringify(state);
}

export function appendDiagnosticsError(error: unknown) {
  rawStateDisplay.textContent += `[${now()}] SSE error: ${JSON.stringify(error)}\n`;
}

function now() {
  return new Date().toISOString().substring(11, 23);
}
