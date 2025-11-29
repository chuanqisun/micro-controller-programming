import { WebSocket } from "ws";
import { convertWavToPCM16 } from "./audio.mjs";

let realtimeWs = null;
let sessionReady = false;
let isProcessing = false;

// Callbacks for state management
let onSessionReady = null;
let onResponseComplete = null;
let onAudioStream = null;

export function initializeRealtimeAPI(callbacks) {
  if (callbacks.onSessionReady) onSessionReady = callbacks.onSessionReady;
  if (callbacks.onResponseComplete) onResponseComplete = callbacks.onResponseComplete;
  if (callbacks.onAudioStream) onAudioStream = callbacks.onAudioStream;
}

export function connectToRealtimeAPI() {
  const url = "wss://api.openai.com/v1/realtime?model=gpt-realtime";
  const headers = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "OpenAI-Beta": "realtime=v1",
  };

  console.log("🔌 Connecting to OpenAI Realtime API...");
  realtimeWs = new WebSocket(url, { headers });

  realtimeWs.on("open", handleRealtimeOpen);
  realtimeWs.on("message", handleRealtimeMessage);
  realtimeWs.on("error", handleRealtimeError);
  realtimeWs.on("close", handleRealtimeClose);
}

function handleRealtimeOpen() {
  console.log("✓ Connected to Realtime API");
}

function handleRealtimeMessage(data) {
  try {
    const event = JSON.parse(data.toString());

    switch (event.type) {
      case "session.created":
        console.log("✓ Session created");
        configureSession();
        break;

      case "session.updated":
        console.log("✓ Session configured");
        sessionReady = true;
        if (onSessionReady) onSessionReady();
        break;

      case "input_audio_buffer.committed":
        console.log("✓ Audio buffer committed");
        break;

      case "input_audio_buffer.cleared":
        console.log("✓ Audio buffer cleared");
        break;

      case "response.created":
        console.log("🤖 Generating response...");
        break;

      case "response.output_text.delta":
        process.stdout.write(event.delta);
        break;

      case "response.output_text.done":
        console.log(`\n📝 Response text: "${event.text}"`);
        break;

      case "response.done":
        console.log("✓ Response complete");
        handleResponseComplete(event);
        break;

      case "error":
        console.error("❌ Realtime API error:", event.error);
        break;
    }
  } catch (error) {
    console.error("❌ Error parsing Realtime message:", error.message);
  }
}

function handleRealtimeError(error) {
  console.error("❌ Realtime WebSocket error:", error.message);
}

function handleRealtimeClose() {
  console.log("🔌 Realtime connection closed. Reconnecting...");
  sessionReady = false;
  setTimeout(connectToRealtimeAPI, 2000);
}

function configureSession() {
  const sessionConfig = {
    type: "session.update",
    session: {
      modalities: ["text"],
      instructions: "Respond to user speech in the voice of a HAM radio operator. One short spoken phrase response only.",
      voice: "ash",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      turn_detection: null,
    },
  };

  realtimeWs.send(JSON.stringify(sessionConfig));
}

export function streamAudioChunkToRealtime(audioChunk) {
  if (!sessionReady || !realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) {
    return;
  }

  const base64Audio = audioChunk.toString("base64");
  const event = {
    type: "input_audio_buffer.append",
    audio: base64Audio,
  };
  realtimeWs.send(JSON.stringify(event));
}

export async function commitAudioAndRequestResponse() {
  console.log(`🔄 Committing audio buffer and requesting response...`);

  try {
    realtimeWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    realtimeWs.send(JSON.stringify({ type: "response.create", response: { modalities: ["text"] } }));
    realtimeWs.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
  } catch (error) {
    console.error("❌ Error requesting response:", error.message);
    isProcessing = false;
  }
}

async function handleResponseComplete(event) {
  const responseText = extractResponseText(event);

  if (responseText) {
    console.log(`💬 Final response: "${responseText}"`);
    await synthesizeAndStreamSpeech(responseText);
  } else {
    console.log("⚠️  No text response received");
  }

  isProcessing = false;
  console.log("✓ Ready for next input");

  if (onResponseComplete) onResponseComplete();
}

async function synthesizeAndStreamSpeech(text) {
  console.log(`🔊 Synthesizing TTS for: "${text}"`);

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: "ash",
        input: text,
        instructions: "Low coarse seasoned veteran from war time, military radio operator voice with no emotion. Speak fast with urgency.",
        response_format: "wav",
      }),
    });

    if (!response.ok) {
      throw new Error(`TTS API error: ${response.status}`);
    }

    const wavBuffer = Buffer.from(await response.arrayBuffer());
    await playAndStreamAudio(wavBuffer);
  } catch (error) {
    console.error("❌ TTS error:", error.message);
  }
}

async function playAndStreamAudio(wavBuffer) {
  const pcmBuffer = await convertWavToPCM16(wavBuffer);
  if (onAudioStream) {
    await onAudioStream(wavBuffer, pcmBuffer);
  }
}

function extractResponseText(event) {
  const response = event.response;
  let responseText = "";

  if (response && response.output) {
    for (const item of response.output) {
      if (item.type === "message" && item.content) {
        for (const content of item.content) {
          if (content.type === "text") {
            responseText = content.text;
            break;
          }
        }
      }
      if (responseText) break;
    }
  }

  return responseText;
}

export function closeRealtimeConnection() {
  if (realtimeWs) {
    realtimeWs.close();
  }
}

export function isSessionReady() {
  return sessionReady;
}

export function setIsProcessing(value) {
  isProcessing = value;
}

export function getIsProcessing() {
  return isProcessing;
}

export function validateEnvironment() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("⚠️  OPENAI_API_KEY not set. Cannot connect to Realtime API.");
    process.exit(1);
  }
}
