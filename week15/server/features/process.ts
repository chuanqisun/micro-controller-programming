import { spawn } from "child_process";
import type { Handler } from "./http";

export function handleReset(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/reset") return false;

    console.log("[Reset] Restarting server...");

    res.writeHead(200);
    res.end(JSON.stringify({ message: "Restarting server..." }));

    setTimeout(() => {
      console.log("[Reset] Killing port and starting new process");
      spawn("bash", ["-c", "npx kill-port 3000 && npm run dev:server"], {
        detached: true,
        stdio: "inherit",
        cwd: process.cwd(),
      }).unref();

      process.exit(0);
    }, 100);

    return true;
  };
}
