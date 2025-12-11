import { Subject } from "rxjs";
import { WebSocket } from "ws";
import { StreamingAudioPlayer } from "./audio";
import { DebugAudioBuffer } from "./debug-audio";
import type { Handler } from "./http";
import { recordAudioActivity, resetSpeechState, startSilenceDetection, stopSilenceDetection } from "./silence-detection";
import { updateState } from "./state";
import type { UDPHandler } from "./udp";

const MODEL = "gpt-realtime";

let realtimeWs: WebSocket | null = null;
let sessionReady = false;
const audioPlayer = new StreamingAudioPlayer({ format: "s16le", sampleRate: 24000, channels: 1 });
const debugBuffer = new DebugAudioBuffer();

const responseSubject = new Subject<string>();
export const aiResponse$ = responseSubject.asObservable();

const transcriptSubject = new Subject<string>();
export const aiTranscript$ = transcriptSubject.asObservable();

export const aiAudioPart$ = new Subject<Buffer>();

export function handleConnectAI(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/connect") return false;

    updateState((state) => ({ ...state, aiConnection: "busy" }));
    try {
      await connectOpenAIRealtime();
      startSilenceDetection();
      updateState((state) => ({ ...state, aiConnection: "connected" }));
    } catch (error) {
      console.error("Failed to connect to OpenAI:", error);
      updateState((state) => ({ ...state, aiConnection: "disconnected" }));
    }

    res.writeHead(200);
    res.end();
    return true;
  };
}

export function handleDisconnectAI(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/disconnect") return false;

    updateState((state) => ({ ...state, aiConnection: "busy" }));
    stopSilenceDetection();
    disconnectAI();
    resetSpeechState();
    updateState((state) => ({ ...state, aiConnection: "disconnected" }));

    res.writeHead(200);
    res.end();
    return true;
  };
}

/**
 * POST /api/ai/send-text
 *
 * payload: { text: string }
 */
export function handleAISendText(): Handler {
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

    if (realtimeWs && sessionReady && realtimeWs.readyState === WebSocket.OPEN) {
      // Create a conversation item with user text
      realtimeWs.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [
              {
                type: "input_text",
                text: payloadText,
              },
            ],
          },
        })
      );
      // Trigger response
      realtimeWs.send(JSON.stringify({ type: "response.create" }));
      console.log(`📤 Sent text to AI: ${payloadText}`);
    } else {
      console.warn("⚠️ Cannot send text, AI session not ready");
    }

    res.writeHead(200);
    res.end();
    return true;
  };
}

export function handleAIAudio(): UDPHandler {
  return (msg) => {
    if (!sessionReady || !realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) return;
    if (msg.data.length === 0) return;

    streamAudioToAI(msg.data);
    recordAudioActivity();
    debugBuffer.push(Buffer.from(msg.data));
  };
}

async function connectOpenAIRealtime(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set in environment variables");
  }

  return new Promise((resolve, reject) => {
    const url = `wss://api.openai.com/v1/realtime?model=${MODEL}`;
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    ws.on("open", () => {
      console.log("✓ Connected to OpenAI Realtime API");
    });

    ws.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString());
        handleOpenAIMessage(event, ws, resolve);
      } catch (error: any) {
        console.error("❌ Error parsing OpenAI message:", error.message);
      }
    });

    ws.on("error", (error) => {
      console.error("❌ OpenAI WebSocket error:", error.message);
      reject(error);
    });

    ws.on("close", () => {
      console.log("🔌 OpenAI Realtime connection closed");
      sessionReady = false;
      realtimeWs = null;
    });

    realtimeWs = ws;
  });
}

function handleOpenAIMessage(event: any, ws: WebSocket, resolveConnection: (value: void) => void) {
  switch (event.type) {
    case "session.created":
      console.log("✓ OpenAI session created");
      configureSession(ws);
      break;

    case "session.updated":
      console.log("✓ OpenAI session configured");
      sessionReady = true;
      resolveConnection();
      break;

    case "input_audio_buffer.committed":
      console.log("✓ Audio buffer committed");
      break;

    case "input_audio_buffer.speech_started":
      console.log("🎤 Speech started");
      break;

    case "input_audio_buffer.speech_stopped":
      console.log("🔇 Speech stopped");
      break;

    case "response.output_text.delta":
      // Stream text delta
      if (event.delta) {
        responseSubject.next(event.delta);
      }
      break;

    case "response.output_text.done":
      console.log(`\n📝 Response text: "${event.text}"`);
      break;

    case "response.output_audio.delta":
      // Handle audio output - decode base64 and play
      if (event.delta) {
        const audioBuffer = Buffer.from(event.delta, "base64");
        audioPlayer.push(audioBuffer);
        aiAudioPart$.next(audioBuffer);
      }
      break;

    case "response.output_audio.done":
      console.log("✓ Audio output complete");
      break;

    case "response.output_audio_transcript.delta":
      // Stream transcript delta
      if (event.delta) {
        transcriptSubject.next(event.delta);
      }
      break;

    case "response.output_audio_transcript.done":
      console.log(`📜 Transcript: "${event.transcript}"`);
      break;

    case "conversation.item.input_audio_transcription.completed":
      console.log(`🎙️ Input transcribed: "${event.transcript}"`);
      transcriptSubject.next(event.transcript);
      break;

    case "response.created":
      console.log("✓ Response created");
      break;

    case "response.done":
      console.log("✓ Response complete");
      break;

    case "error":
      console.error("❌ OpenAI Realtime API error:", event.error);
      break;

    default:
      // Log unhandled events for debugging
      // console.log(`📩 Event: ${event.type}`);
      break;
  }
}

function configureSession(ws: WebSocket) {
  const sessionConfig = {
    type: "session.update",
    session: {
      type: "realtime",
      model: MODEL,
      output_modalities: ["audio", "text"],
      instructions: "You are a dedicated Dungeons & Dragons game master",
      audio: {
        input: {
          format: {
            type: "audio/pcm",
            rate: 24000,
          },
          // Disable VAD - we handle it manually
          turn_detection: null,
        },
        output: {
          format: {
            type: "audio/pcm",
          },
          voice: "alloy",
        },
      },
    },
  };

  ws.send(JSON.stringify(sessionConfig));
}

export function streamAudioToAI(pcmData: Buffer): void {
  if (!realtimeWs || !sessionReady || realtimeWs.readyState !== WebSocket.OPEN) {
    return;
  }

  const base64Audio = pcmData.toString("base64");
  realtimeWs.send(
    JSON.stringify({
      type: "input_audio_buffer.append",
      audio: base64Audio,
    })
  );
}

export function sendAudioStreamEnd(): void {
  if (!realtimeWs || !sessionReady || realtimeWs.readyState !== WebSocket.OPEN) {
    return;
  }

  // Save debug buffer as WAV file
  debugBuffer.saveAsWav();

  // Commit the audio buffer and create response (since VAD is disabled)
  realtimeWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
  realtimeWs.send(JSON.stringify({ type: "response.create" }));
  realtimeWs.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
  console.log("📤 Committed audio buffer and requested response");
}

export function disconnectAI(): void {
  if (realtimeWs) {
    realtimeWs.close();
    realtimeWs = null;
    sessionReady = false;
    audioPlayer.stop();
    console.log("✓ AI session closed");
  }
}

export function isAISessionReady(): boolean {
  return sessionReady;
}

export function startManualVoiceActivity(): void {
  // For OpenAI with VAD disabled, we just need to clear the buffer before new input
  if (!realtimeWs || !sessionReady || realtimeWs.readyState !== WebSocket.OPEN) {
    return;
  }
  realtimeWs.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
  console.log("🎤 Started manual voice activity");
}

export function stopManualVoiceActivity(): void {
  // For OpenAI with VAD disabled, commit buffer and trigger response
  sendAudioStreamEnd();
  console.log("🔇 Stopped manual voice activity");
}

export function interrupt(): void {
  if (!realtimeWs || !sessionReady || realtimeWs.readyState !== WebSocket.OPEN) {
    return;
  }
  // Cancel any in-progress response
  realtimeWs.send(JSON.stringify({ type: "response.cancel" }));
  audioPlayer.stop();
  console.log("⚡ Interrupted response");
}
