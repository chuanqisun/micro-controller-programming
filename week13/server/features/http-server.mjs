import * as http from "http";
import * as os from "os";
import { HTTP_PORT } from "../config.mjs";

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

  if (req.method === "GET" && req.url === "/api/ip") {
    const localIp = getLocalNetworkIp();
    res.writeHead(200);
    res.end(JSON.stringify({ ip: localIp }));
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
