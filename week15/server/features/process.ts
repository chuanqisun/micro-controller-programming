import { spawn } from "child_process";
import type { Handler } from "./http";

export function handleReset(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/reset") return false;

    console.log("[Reset] Restarting server...");

    res.writeHead(200);
    res.end(JSON.stringify({ message: "Restarting server..." }));

    // Spawn npm run dev:server in a detached process, then exit
    setTimeout(() => {
      console.log("[Reset] Starting new process and exiting current one");
      spawn("npm", ["run", "dev:server"], {
        detached: true,
        stdio: "inherit",
        cwd: process.cwd(),
      }).unref();

      process.exit(0);
    }, 100);

    return true;
  };
}
