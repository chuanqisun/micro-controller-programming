import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import { Subject } from "rxjs";
import { StreamingAudioPlayer } from "./audio";
import { DebugAudioBuffer } from "./debug-audio";
import type { Handler } from "./http";
import { recordAudioActivity, resetSpeechState, startSilenceDetection, stopSilenceDetection } from "./silence-detection";
import { updateState } from "./state";
import type { UDPHandler } from "./udp";

const MODEL = "gpt-realtime-mini";

let session: RealtimeSession | null = null;
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
      await connectOpenAIAgent();
      startSilenceDetection();
      updateState((state) => ({ ...state, aiConnection: "connected" }));
    } catch (error) {
      console.error("Failed to connect to OpenAI Agent:", error);
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

    if (session && sessionReady) {
      session.sendMessage(payloadText);
      console.log(`📤 Sent text to AI: ${payloadText}`);
    } else {
      console.warn("⚠️ Cannot send text, AI session not ready");
    }

    res.writeHead(200);
    res.end();
    return true;
  };
}

export function handleUserAudio(): UDPHandler {
  return (msg) => {
    if (!sessionReady || !session) return;
    if (msg.data.length === 0) return;

    streamAudioToAI(msg.data);
    recordAudioActivity();
    debugBuffer.push(Buffer.from(msg.data));
  };
}

async function connectOpenAIAgent(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set in environment variables");
  }

  const agent = new RealtimeAgent({
    name: "Dungeon Master",
    instructions: "You are a dedicated Dungeons & Dragons game master",
  });

  session = new RealtimeSession(agent, {
    transport: "websocket",
    model: MODEL,
    config: {
      audio: {
        input: {
          format: {
            type: "audio/pcm",
            rate: 24000,
          },
        },
        output: {
          format: {
            type: "audio/pcm",
            rate: 24000,
          },
        },
      },
      // inputAudioFormat: "pcm16",
      // outputAudioFormat: "pcm16",
    },
  });

  // Set up event listeners before connecting
  setupSessionEventListeners();

  console.log("🔌 Connecting to OpenAI Agent API...");

  await session.connect({ apiKey });

  // bug: https://github.com/openai/openai-agents-js/issues/132
  await session.transport.updateSessionConfig({
    turn_detection: null,
  } as any);

  sessionReady = true;
  console.log("✓ Connected to OpenAI Agent API");
}

function setupSessionEventListeners(): void {
  if (!session) return;

  // Handle audio output from the agent
  session.on("audio", (event) => {
    // event.data is typed as ArrayBuffer but comes as base64 string at runtime
    const audioBuffer = Buffer.from(event.data as unknown as string, "base64");
    audioPlayer.push(audioBuffer);
    aiAudioPart$.next(audioBuffer);
  });

  // Handle audio interruption
  session.on("audio_interrupted", () => {
    console.log("⚡ Agent response interrupted");
    audioPlayer.stop();
  });

  // Handle history updates (for transcripts and text responses)
  session.on("history_updated", (history) => {
    // Get the last item in history
    const lastItem = history[history.length - 1];
    if (!lastItem) return;

    // Handle assistant messages
    if (lastItem.type === "message" && lastItem.role === "assistant") {
      // Check for text content
      for (const content of lastItem.content || []) {
        if (content.type === "text" && content.text) {
          responseSubject.next(content.text);
        }
        // Handle audio transcript
        if (content.type === "audio" && content.transcript) {
          transcriptSubject.next(content.transcript);
        }
      }
    }

    // Handle user input transcription
    if (lastItem.type === "message" && lastItem.role === "user") {
      for (const content of lastItem.content || []) {
        if (content.type === "input_audio" && content.transcript) {
          transcriptSubject.next(content.transcript);
        }
      }
    }
  });

  // Handle history_added for real-time updates
  session.on("history_added", (item) => {
    if (item.type === "message" && item.role === "assistant") {
      for (const content of (item as any).content || []) {
        if (content.type === "text" && content.text) {
          responseSubject.next(content.text);
        }
        if (content.type === "audio" && content.transcript) {
          transcriptSubject.next(content.transcript);
        }
      }
    }
  });

  // Access transport layer for additional events
  session.transport.on("*", (event: any) => {
    // Handle specific realtime events if needed
    if (event.type === "conversation.item.input_audio_transcription.completed") {
      if (event.transcript) {
        console.log(`🎙️ Input transcribed: "${event.transcript}"`);
        transcriptSubject.next(event.transcript);
      }
    }

    if (event.type === "response.audio_transcript.delta") {
      if (event.delta) {
        transcriptSubject.next(event.delta);
      }
    }

    if (event.type === "response.text.delta") {
      if (event.delta) {
        responseSubject.next(event.delta);
      }
    }

    if (event.type === "response.done") {
      console.log("✓ Response complete");
    }
  });
}

export function streamAudioToAI(pcmData: Buffer): void {
  if (!session || !sessionReady) {
    return;
  }

  // Convert Buffer to ArrayBuffer for sendAudio
  const arrayBuffer = pcmData.buffer.slice(pcmData.byteOffset, pcmData.byteOffset + pcmData.byteLength);
  session.sendAudio(arrayBuffer as ArrayBuffer);
}

function sendAudioStreamEnd(): void {
  if (!session || !sessionReady) {
    return;
  }

  // Save debug buffer as WAV file
  debugBuffer.saveAsWav();

  // For the Agents SDK with manual VAD, we need to send events through the transport layer
  // to commit the audio buffer and trigger a response
  session.transport.sendEvent({
    type: "input_audio_buffer.commit",
  });
  session.transport.sendEvent({
    type: "response.create",
  });

  console.log("📤 Committed audio buffer and requested response");
}

export function disconnectAI(): void {
  if (session) {
    session.close();
    session = null;
    sessionReady = false;
    audioPlayer.stop();
    console.log("✓ AI session closed");
  }
}

export function isAISessionReady(): boolean {
  return sessionReady;
}

export function handleSpeechStart(): void {
  if (!session || !sessionReady) {
    return;
  }

  // Interrupt any ongoing response
  session.interrupt();
  audioPlayer.stop();

  // Clear the input audio buffer for new input
  session.transport.sendEvent({
    type: "input_audio_buffer.clear",
  });

  console.log("🎤 Started manual voice activity");
}

export function handleSpeechStop(): void {
  // Commit buffer and trigger response
  sendAudioStreamEnd();
  console.log("🔇 Stopped manual voice activity");
}
