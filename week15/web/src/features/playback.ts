import type { StateChange } from "./state";

const playFileBtn = document.getElementById("playFileBtn") as HTMLButtonElement;
const stopPlaybackBtn = document.getElementById("stopPlaybackBtn") as HTMLButtonElement;

export function initPlaybackUI() {
  playFileBtn.addEventListener("click", async () => {
    await fetch("http://localhost:3000/api/play-file", { method: "POST" });
  });

  stopPlaybackBtn.addEventListener("click", async () => {
    await fetch("http://localhost:3000/api/stop-playback", { method: "POST" });
  });
}

export function updatePlaybackUI(stateChange: StateChange) {
  // Playback requires operator to be connected with an address
  const hasOpAddress = !!stateChange.current.opAddress;
  playFileBtn.disabled = !hasOpAddress;
  stopPlaybackBtn.disabled = !hasOpAddress;
}
