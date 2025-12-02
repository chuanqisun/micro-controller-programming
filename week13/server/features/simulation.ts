import { WebSocket } from "ws";
import { StreamingAudioPlayer } from "./audio";
import type { Handler } from "./http";
import {
  recordAudioActivity,
  resetSpeechState,
  setIsProcessing,
  startSilenceDetection,
  stopSilenceDetection,
} from "./silence-detection";
import { updateState } from "./state";
import { withTimeout } from "./timeout";
import type { UDPHandler } from "./udp";

let realtimeWs: WebSocket | null = null;
let sessionReady = false;
const audioPlayer = new StreamingAudioPlayer();

export function handleConnectSession(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/connect") return false;

    updateState((state) => ({ ...state, aiConnection: "busy" }));
    try {
      realtimeWs?.close();
      realtimeWs = await withTimeout(createRealtimeConnection(), 5000);
      startSilenceDetection();
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
      stopSilenceDetection();
      realtimeWs?.close();
      realtimeWs = null;
      sessionReady = false;
      resetSpeechState();
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

    // skip empty msg
    if (msg.data.length === 0) return;

    // Track speech state for silence detection
    recordAudioActivity();

    // Accumulate audio in local buffer for playback
    audioPlayer.push(Buffer.from(msg.data));

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

export async function triggerResponse() {
  if (!realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) return;

  setIsProcessing(true);
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
            setIsProcessing(false);
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
