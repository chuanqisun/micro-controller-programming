import * as http from "http";
import { HTTP_PORT, LAPTOP_UDP_RX_PORT } from "../config.mjs";
import { cancelPlayback, cancelStreaming } from "./audio.mjs";
import { getLocalNetworkIp, setLastSenderIp } from "./ip-discovery.mjs";
import { requestDirectResponse, synthesizeAndStreamSpeech } from "./openai-realtime.mjs";
import { agents } from "./simulation.mjs";

let httpServer;
let sseClients = [];

export function createHttpServer() {
  httpServer = http.createServer(handleHttpRequest);
  httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTP server listening on port ${HTTP_PORT}`);
  });

  return httpServer;
}

export function closeHttpServer() {
  return new Promise((resolve) => {
    sseClients.forEach((client) => {
      client.res.end();
    });
    sseClients = [];
    if (httpServer) {
      httpServer.close(resolve);
    } else {
      resolve();
    }
  });
}

/**
 *
 * @param {string} message
 */
export function emitServerEvent(message) {
  sseClients.forEach((client) => {
    client.res.write(`data: ${message}\n\n`);
  });
}

function handleHttpRequest(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

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
  } else if (req.method === "POST" && req.url.startsWith("/api/locate-operator")) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const address = url.searchParams.get("address");
    if (!address) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Missing address parameter" }));
      return;
    }
    setLastSenderIp(address);
    console.log(`📍 Operator located: ${address}`);
    res.writeHead(200);
    res.end(JSON.stringify({ success: true, address }));
  } else if (req.method === "GET" && req.url === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write("\n");

    sseClients.push({ res });

    req.on("close", () => {
      sseClients = sseClients.filter((client) => client.res !== res);
      console.log("SSE client disconnected");
    });
  } else if (req.method === "POST" && req.url === "/api/speak") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const { text, voice } = JSON.parse(body);
        if (!text) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: "Missing text field" }));
          return;
        }
        await synthesizeAndStreamSpeech(text, voice);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, text }));
      } catch (error) {
        console.error("❌ Error processing /api/speak:", error.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  }
}
