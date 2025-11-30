import * as http from "http";
import { HTTP_PORT, LAPTOP_UDP_RX_PORT } from "../config.mjs";
import { cancelPlayback, cancelStreaming } from "./audio.mjs";
import { getLocalNetworkIp, setLastSenderIp } from "./ip-discovery.mjs";
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
    const host = `${localIp}:${LAPTOP_UDP_RX_PORT}`;
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
  } else if (req.method === "POST" && req.url.startsWith("/api/operator-address")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const address = url.searchParams.get("address");
    if (!address) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Missing address parameter" }));
      return;
    }
    setLastSenderIp(address);
    console.log(`📍 Operator paired: ${address}`);
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, address }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
}
