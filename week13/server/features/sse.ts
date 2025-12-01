import type { ServerResponse } from "http";
import type { Handler } from "./http";

let sseClients: ServerResponse[] = [];

export function handleSSE(): Handler {
  return (req, res) => {
    if (req.method !== "GET" || req.url !== "/api/events") return false;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write("\n");

    sseClients.push(res);

    req.on("close", () => {
      sseClients = sseClients.filter((client) => client !== res);
      console.log("SSE client disconnected");
    });

    return true;
  };
}

export function broadcast(serializable: any) {
  sseClients.forEach((client) => {
    client.write(`data: ${JSON.stringify(serializable)}\n\n`);
  });
}
