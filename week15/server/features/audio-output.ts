import type { Handler } from "./http";
import { appState$, type AudioOutputMode, updateState } from "./state";

export function handleSetAudioOutputMode(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/audio-output") return false;

    const body = await new Promise<string>((resolve) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => resolve(data));
    });

    const { mode } = JSON.parse(body);

    if (!["controller", "laptop", "both"].includes(mode)) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Invalid audio output mode" }));
      return true;
    }

    updateState((state) => ({ ...state, audioOutputMode: mode as AudioOutputMode }));

    console.log(`[Audio] Output mode set to: ${mode}`);

    res.writeHead(200);
    res.end(JSON.stringify({ mode: appState$.value.audioOutputMode }));
    return true;
  };
}
