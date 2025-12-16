import { readFile, writeFile } from "fs/promises";
import type { Handler } from "./http";

export function handleReset(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/reset") return false;

    console.log("[Reset] Restarting server...");

    res.writeHead(200);
    res.end(JSON.stringify({ message: "Restarting server..." }));

    setTimeout(async () => {
      console.log("[Reset] Triggering tsx watch restart");
      const content = await readFile(__filename, "utf-8");
      await writeFile(__filename, content);
    }, 100);

    return true;
  };
}
