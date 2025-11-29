import * as http from "http";
import * as os from "os";
import { HTTP_PORT, LAPTOP_UDP_RX_PORT } from "../config.mjs";
import { cancelPlayback, cancelStreaming } from "./audio.mjs";
import { requestDirectResponse } from "./openai-realtime.mjs";
import { agents } from "./simulation.mjs";

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

    const agent = agents.find((a) => a.id.toString() === id);
    if (agent) {
      requestDirectResponse(`You are ${agent.name}. Please say your name`);
    }

    res.writeHead(200);
    res.end(JSON.stringify({ success: true, id }));
  } else if (req.method === "POST" && req.url === "/api/unplug") {
    cancelStreaming();
    cancelPlayback();
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, message: "Voice generation stopped" }));
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
