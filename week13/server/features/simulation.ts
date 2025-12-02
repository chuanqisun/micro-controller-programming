import { WebSocket } from "ws";

import type { Handler } from "./http";
import { updateState } from "./state";
import { withTimeout } from "./timeout";
import type { UDPHandler } from "./udp";

let realtimeWs: WebSocket | null = null;
let sessionReady = false;

export function handleConnectSession(): Handler {
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

export function handleDisconnectSession(): Handler {
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

export function handleAudio(): UDPHandler {
  return (msg) => {
    if (!sessionReady || !realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) return;

    console.log(`packet received: ${msg.data.length} bytes`);

    const base64Audio = Buffer.from(msg.data).toString("base64");
    realtimeWs.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio: base64Audio,
      }),
    );
  };
}

export function interrupt() {
  // Not implemented for raw WebSocket - would need to send cancel event
}

export function triggerResponse() {
  if (!realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) return;

  realtimeWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
  realtimeWs.send(JSON.stringify({ type: "response.create" }));
  realtimeWs.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
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

          case "input_audio_buffer.committed":
            console.log("✓ Audio buffer committed");
            break;

          case "response.output_text.delta":
            // process.stdout.write(event.delta);
            break;

          case "response.output_text.done":
            console.log(`\n📝 Response text: "${event.text}"`);
            break;

          case "response.done":
            console.log("✓ Response complete");
            break;

          case "conversation.item.input_audio_transcription.completed":
            console.log(`Transcribed: ${event.transcript}`);
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
      output_modalities: ["text"],
      instructions: `
## Unclear audio
- Only respond in English
- Only respond to clear audio or text.
- If the user's audio is not clear (e.g., ambiguous input/background noise/silent/unintelligible) or if you did not fully hear or understand the user, ask for clarification using {preferred_language} phrases.

Sample clarification phrases (parameterize with {preferred_language}):

- “Sorry, I didn’t catch that—could you say it again?”
- “There’s some background noise. Please repeat the last part.”
- “I only heard part of that. What did you say after ___?”
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
