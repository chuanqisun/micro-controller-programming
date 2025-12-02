import { GoogleGenAI, Modality, type Session } from "@google/genai";
import { Subject } from "rxjs";
import { StreamingAudioPlayer } from "./audio";
import type { Handler } from "./http";
import { updateState } from "./state";
import type { UDPHandler } from "./udp";

const MODEL = "gemini-2.5-flash-native-audio-preview-09-2025";

let session: Session | null = null;
let sessionReady = false;
const audioPlayer = new StreamingAudioPlayer({ format: "s16le", sampleRate: 24000, channels: 1 });

const responseSubject = new Subject<string>();
export const geminiResponse$ = responseSubject.asObservable();

const transcriptSubject = new Subject<string>();
export const geminiTranscript$ = transcriptSubject.asObservable();

export function handleConnectGemini(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/gemini/connect") return false;

    updateState((state) => ({ ...state, aiConnection: "busy" }));
    try {
      await connectGeminiLive();
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

export function handleDisconnectGemini(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/gemini/disconnect") return false;

    updateState((state) => ({ ...state, aiConnection: "busy" }));
    disconnectGeminiLive();
    updateState((state) => ({ ...state, aiConnection: "disconnected" }));

    res.writeHead(200);
    res.end();
    return true;
  };
}

export function handleGeminiAudio(): UDPHandler {
  return (msg) => {
    if (!sessionReady || !session) return;
    if (msg.data.length === 0) return;

    streamAudioToGemini(Buffer.from(msg.data));
  };
}

async function connectGeminiLive(): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set in environment variables");
  }

  const ai = new GoogleGenAI({ apiKey });

  const config = {
    responseModalities: [Modality.AUDIO],
    systemInstruction: "You are a helpful assistant. Keep your responses short and conversational.",
    inputAudioTranscription: {},
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

export function streamAudioToGemini(pcmData: Buffer): void {
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

  // Signal end of audio stream to trigger response
  session.sendRealtimeInput({ audioStreamEnd: true });
  console.log("📤 Sent audio stream end signal");
}

export function disconnectGeminiLive(): void {
  if (session) {
    session.close();
    session = null;
    sessionReady = false;
    console.log("✓ Gemini Live session closed");
  }
}

export function isGeminiSessionReady(): boolean {
  return sessionReady;
}
