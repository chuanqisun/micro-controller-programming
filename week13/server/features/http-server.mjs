import * as http from "http";
import * as os from "os";
import { HTTP_PORT, LAPTOP_UDP_RX_PORT } from "../config.mjs";

let httpServer;

export function createHttpServer() {
  httpServer = http.createServer(handleHttpRequest);
  httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTP server listening on port ${HTTP_PORT}`);
  });

  return httpServer;
}

export function closeHttpServer() {
  return new Promise((resolve) => {
    if (httpServer) {
      httpServer.close(resolve);
    } else {
      resolve();
    }
  });
}

function handleHttpRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  if (req.method === "GET" && req.url === "/api/origin") {
    const localIp = getLocalNetworkIp();
    const host = `http://${localIp}:${LAPTOP_UDP_RX_PORT}`;
    res.writeHead(200);
    res.end(JSON.stringify({ host }));
  } else if (req.method === "POST" && req.url.startsWith("/api/probe")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const id = url.searchParams.get("id");
    console.log(`Probe received: id=${id}`);
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, id }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
}

function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}
