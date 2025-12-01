import http from "http";
import { HTTP_PORT } from "../config";

export type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => Promise<boolean> | boolean;

export function createHttpServer(handlers: Handler[]) {
  async function handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    for (const handler of handlers) {
      const handled = await handler(req, res);
      if (handled) return;
    }
  }

  const httpServer = http.createServer(handleHttpRequest);
  httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTP server listening on port ${HTTP_PORT}`);
  });

  return httpServer;
}
