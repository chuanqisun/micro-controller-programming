import OpenAI from "openai";
import { Subject } from "rxjs";
import { WebSocket } from "ws";
import type { Handler } from "./http";
import { updateState } from "./state";
import { withTimeout } from "./timeout";

let realtimeWs: WebSocket | null = null;
let sessionReady = false;

export const realtimeOutputAudio$ = new Subject<Buffer>();

export function handleConnectOpenAI(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/connect") return false;

    updateState((state) => ({ ...state, aiConnection: "busy" }));
    try {
      realtimeWs?.close();
      realtimeWs = await withTimeout(createRealtimeConnection(), 5000);
      updateState((state) => ({ ...state, aiConnection: "connected" }));
    } catch (error) {
      updateState((state) => ({ ...state, aiConnection: "disconnected" }));
    }

    res.writeHead(200);
    res.end();

    return true;
  };
}

export function handleDisconnectOpenAI(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/disconnect") return false;

    updateState((state) => ({ ...state, aiConnection: "busy" }));

    try {
      realtimeWs?.close();
      realtimeWs = null;
      sessionReady = false;
    } catch (error) {
      console.error("Error stopping AI session:", error);
    } finally {
      updateState((state) => ({ ...state, aiConnection: "disconnected" }));
    }

    res.writeHead(200);
    res.end();

    return true;
  };
}

/**
 * POST /api/ai/send-text
 *
 * payload: { text: string }
 * */
export function handleSendTextOpenAI(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/send-text") return false;

    const payloadText = await new Promise<string>((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed.text);
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", (err) => {
        reject(err);
      });
    });

    if (realtimeWs && sessionReady) {
      sendText(payloadText);
      triggerResponse();
      console.log(`📤 Sent text to AI: ${payloadText}`);
    } else {
      console.warn("⚠️ Cannot send text, AI session not ready");
    }

    res.writeHead(200);
    res.end();
    return true;
  };
}

export function triggerResponse() {
  if (!realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) return;
  realtimeWs.send(JSON.stringify({ type: "response.create" }));
}

export function sendText(text: string) {
  if (!realtimeWs || realtimeWs.readyState !== WebSocket.OPEN || !sessionReady) return;
  const createItem = {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text,
        },
      ],
    },
  };

  realtimeWs.send(JSON.stringify(createItem));
}

export function createRealtimeConnection(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      reject(new Error("OPENAI_API_KEY not set in environment variables"));
      return;
    }

    const url = "wss://api.openai.com/v1/realtime?model=gpt-realtime";
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    ws.on("open", () => {
      console.log("✓ Connected to Realtime API");
    });

    ws.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString());

        switch (event.type) {
          case "session.created":
            console.log("✓ Session created");
            configureSession(ws);
            break;

          case "session.updated":
            console.log("✓ Session configured");
            sessionReady = true;
            resolve(ws);
            break;

          case "response.done":
            console.log("✓ Response complete");
            break;

          case "response.output_audio.delta":
            const audioChunk = Buffer.from(event.delta, "base64");
            realtimeOutputAudio$.next(audioChunk);
            break;

          case "error":
            console.error("❌ Realtime API error:", event.error);
            break;
        }
      } catch (error: any) {
        console.error("❌ Error parsing Realtime message:", error.message);
      }
    });

    ws.on("error", (error) => {
      console.error("❌ Realtime WebSocket error:", error.message);
      reject(error);
    });

    ws.on("close", () => {
      console.log("🔌 Realtime connection closed");
      sessionReady = false;
    });
  });
}
function configureSession(ws: WebSocket) {
  const sessionConfig = {
    type: "session.update",
    session: {
      type: "realtime",
      model: "gpt-realtime",
      output_modalities: ["audio"],
      instructions: `
You are an English speaking friend. Your response is always short.
      `,
      audio: {
        input: {
          format: {
            type: "audio/pcm",
            rate: 24000,
          },
          turn_detection: null,
        },
      },
    },
  };

  ws.send(JSON.stringify(sessionConfig));
}

const openai = new OpenAI();
openai.realtime;
