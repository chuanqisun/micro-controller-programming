import { GoogleGenAI, Modality, type LiveConnectConfig, type Session } from "@google/genai";
import { Subject } from "rxjs";
import { StreamingAudioPlayer } from "./audio";
import { DebugAudioBuffer } from "./debug-audio";
import type { Handler } from "./http";
import { recordAudioActivity, resetSpeechState, startSilenceDetection, stopSilenceDetection } from "./silence-detection";
import { updateState } from "./state";
import type { UDPHandler } from "./udp";

const MODEL = "gemini-2.5-flash-native-audio-preview-09-2025";

let session: Session | null = null;
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
      await connectGeminiLive();
      startSilenceDetection();
      updateState((state) => ({ ...state, aiConnection: "connected" }));
    } catch (error) {
      console.error("Failed to connect to Gemini:", error);
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
 * */

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
      session.sendClientContent({
        turns: payloadText,
        turnComplete: true,
      });
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
    if (!sessionReady || !session) return;
    if (msg.data.length === 0) return;

    streamAudioToAI(msg.data);
    recordAudioActivity();
    debugBuffer.push(Buffer.from(msg.data));
  };
}

async function connectGeminiLive(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set in environment variables");
  }

  const ai = new GoogleGenAI({ apiKey });

  const config: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: "You are a dedicated Dungeons & Dragons game master",
    thinkingConfig: { thinkingBudget: 0 },
    realtimeInputConfig: {
      automaticActivityDetection: {
        disabled: true,
      },
    },
  };

  console.log("🔌 Connecting to Gemini Live API...");

  session = await ai.live.connect({
    model: MODEL,
    config,
    callbacks: {
      onopen: () => {
        console.log("✓ Connected to Gemini Live API");
        sessionReady = true;
      },
      onmessage: (message: any) => {
        handleGeminiMessage(message);
      },
      onerror: (error: any) => {
        console.error("❌ Gemini Live API error:", error.message);
      },
      onclose: (event: any) => {
        console.log("🔌 Gemini Live connection closed:", event?.reason);
        sessionReady = false;
        session = null;
      },
    },
  });
}

function handleGeminiMessage(message: any) {
  // Handle audio response - play it back (message.data is the primary audio source)
  if (message.data) {
    const audioBuffer = Buffer.from(message.data, "base64");
    audioPlayer.push(audioBuffer);
    aiAudioPart$.next(audioBuffer);
    return; // Don't process further if we got direct audio data
  }

  // Handle text response
  if (message.serverContent?.modelTurn?.parts) {
    for (const part of message.serverContent.modelTurn.parts) {
      if (part.text) {
        responseSubject.next(part.text);
      }
    }
  }

  // Handle input transcription
  if (message.serverContent?.inputTranscription?.text) {
    transcriptSubject.next(message.serverContent.inputTranscription.text);
  }

  // Handle turn complete
  if (message.serverContent?.turnComplete) {
    console.log("✓ Gemini turn complete");
  }

  // Handle interruption
  if (message.serverContent?.interrupted) {
    console.log("⚡ Gemini response interrupted");
    audioPlayer.stop();
  }
}

export function streamAudioToAI(pcmData: Buffer): void {
  if (!session || !sessionReady) {
    return;
  }

  // Convert Buffer to base64
  const base64Audio = pcmData.toString("base64");

  // Send audio with 24kHz sample rate (matching our input)
  session.sendRealtimeInput({
    audio: {
      data: base64Audio,
      mimeType: "audio/pcm;rate=24000",
    },
  });
}

export function sendAudioStreamEnd(): void {
  if (!session || !sessionReady) {
    return;
  }

  // Save debug buffer as WAV file (this also sends audio stream end via debug-audio.ts)
  debugBuffer.saveAsWav();
  session.sendRealtimeInput({ audioStreamEnd: true });
  console.log("📤 Sent audio stream end signal");
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

export function startManualVoiceActivity() {
  session?.sendRealtimeInput({
    activityStart: {},
  });
}

export function stopManualVoiceActivity() {
  session?.sendRealtimeInput({
    activityEnd: {},
  });
}

export function interrupt(): void {
  // In Gemini, sending activityStart interrupts the current response
  session?.sendRealtimeInput({
    activityStart: {},
  });
  audioPlayer.stop();
  console.log("⚡ Interrupted response");
}
