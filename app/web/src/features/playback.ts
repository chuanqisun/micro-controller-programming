import type { StateChange } from "./state";

/**
 * Playback controls are now integrated into each operator panel.
 * This file is kept for backward compatibility but the UI initialization
 * and updates are handled in operator.ts per-panel.
 */

export function initPlaybackUI() {
  // Playback UI is now initialized per operator panel in operator.ts
}

export function updatePlaybackUI(_stateChange: StateChange) {
  // Playback UI is now updated per operator panel in operator.ts
}
