const dgram = require("dgram");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const UDP_PORT = 8888;
const SILENCE_TIMEOUT_MS = 1000;
const STATS_INTERVAL_MS = 5000;
const SILENCE_CHECK_INTERVAL_MS = 100;

const STATE = {
  SILENT: "silent",
  SPEAKING: "speaking",
};

const server = dgram.createSocket("udp4");

let currentState = STATE.SILENT;
let audioBuffer = [];
let lastPacketTime = null;
let silenceCheckInterval = null;
let isProcessing = false;
let packetsReceived = 0;
let bytesReceived = 0;
let lastStatsTime = Date.now();
let realtimeWs = null;
let sessionReady = false;

startServer();

function startServer() {
  connectToRealtimeAPI();
  server.bind(UDP_PORT);
  server.on("listening", handleServerListening);
  server.on("message", handleIncomingAudioPacket);
  server.on("error", handleServerError);
  process.on("SIGINT", handleGracefulShutdown);
}

function handleServerListening() {
  const address = server.address();
  logServerStartup(address);
  silenceCheckInterval = setInterval(detectSilence, SILENCE_CHECK_INTERVAL_MS);
}

function handleIncomingAudioPacket(msg, rinfo) {
  beginSpeakingStateIfNeeded();
  lastPacketTime = Date.now();
  audioBuffer.push(Buffer.from(msg));

  // Stream audio to Realtime API immediately if session is ready
  if (sessionReady && realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
    streamAudioChunk(msg);
  }

  updateStatistics(msg.length);
  logStatisticsIfIntervalElapsed();
}

function handleServerError(err) {
  console.error(`Server error:\n${err.stack}`);
  server.close();
}

function handleGracefulShutdown() {
  console.log("\n\nShutting down...");
  if (silenceCheckInterval) {
    clearInterval(silenceCheckInterval);
  }
  if (realtimeWs) {
    realtimeWs.close();
  }
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
}

function connectToRealtimeAPI() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("⚠️  OPENAI_API_KEY not set. Cannot connect to Realtime API.");
    process.exit(1);
  }

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
        // Text being generated in chunks (optional logging)
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
      modalities: ["text"], // Only text output, no audio
      instructions: "Respond to user speech in the voice of a HAM radio operator. One short spoken phrase response only.",
      voice: "ash",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      turn_detection: null, // Disable VAD - we handle silence detection manually
    },
  };

  realtimeWs.send(JSON.stringify(sessionConfig));
}

function beginSpeakingStateIfNeeded() {
  if (currentState !== STATE.SPEAKING) {
    console.log("🎤 Speaking...");
    currentState = STATE.SPEAKING;
    audioBuffer = [];
  }
}

function detectSilence() {
  if (currentState === STATE.SPEAKING && lastPacketTime) {
    const timeSinceLastPacket = Date.now() - lastPacketTime;
    if (timeSinceLastPacket > SILENCE_TIMEOUT_MS) {
      transitionToSilentAndProcessAudio();
    }
  }
}

async function transitionToSilentAndProcessAudio() {
  if (currentState !== STATE.SILENT) {
    console.log("📤 Sent");
    currentState = STATE.SILENT;

    if (audioBuffer.length > 0 && !isProcessing && sessionReady) {
      isProcessing = true;
      audioBuffer = [];
      await commitAudioAndRequestResponse();
    }
  }
}

function streamAudioChunk(audioChunk) {
  // Convert PCM16 buffer to base64 and send to Realtime API
  const base64Audio = audioChunk.toString("base64");
  const event = {
    type: "input_audio_buffer.append",
    audio: base64Audio,
  };
  realtimeWs.send(JSON.stringify(event));
}

async function commitAudioAndRequestResponse() {
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

function handleResponseComplete(event) {
  // Extract text from response
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

  if (responseText) {
    console.log(`💬 Final response: "${responseText}"`);
    speakTextAloud(responseText);
  } else {
    console.log("⚠️  No text response received");
  }

  isProcessing = false;
}

async function speakTextAloud(text) {
  console.log(`🔊 Playing TTS for: "${text}"`);

  try {
    // Use OpenAI REST API for TTS since Realtime API is text-only mode
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

    const buffer = Buffer.from(await response.arrayBuffer());
    await playAudioBufferThroughSpeakers(buffer);
  } catch (error) {
    console.error("❌ TTS error:", error.message);
  }
}

async function playAudioBufferThroughSpeakers(buffer) {
  const ffplay = spawn("ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", "-i", "pipe:0"]);

  ffplay.on("error", (err) => {
    console.error("❌ ffplay error:", err.message);
  });

  ffplay.on("close", (code) => {
    if (code === 0) {
      console.log("✓ TTS playback completed");
    } else {
      console.error(`❌ ffplay exited with code ${code}`);
    }
  });

  ffplay.stdin.write(buffer);
  ffplay.stdin.end();
}

function updateStatistics(messageLength) {
  packetsReceived++;
  bytesReceived += messageLength;
}

function logStatisticsIfIntervalElapsed() {
  const now = Date.now();
  if (now - lastStatsTime > STATS_INTERVAL_MS) {
    const elapsed = (now - lastStatsTime) / 1000;
    const packetsPerSec = (packetsReceived / elapsed).toFixed(1);
    const kbytesPerSec = (bytesReceived / elapsed / 1024).toFixed(2);
    const bufferSize = (audioBuffer.reduce((sum, buf) => sum + buf.length, 0) / 1024).toFixed(2);

    console.log(`📊 Stats: ${packetsPerSec} packets/s, ${kbytesPerSec} KB/s, buffer: ${bufferSize} KB`);

    packetsReceived = 0;
    bytesReceived = 0;
    lastStatsTime = now;
  }
}

function logServerStartup(address) {
  const networkAddresses = getNetworkAddresses();

  console.log("\n==============================================");
  console.log("ESP32 Audio UDP Receiver with Realtime API");
  console.log("==============================================");
  console.log(`UDP Server listening on port ${address.port}`);
  console.log(`Sample Rate: ${SAMPLE_RATE} Hz`);
  console.log(`Channels: ${CHANNELS} (mono)`);
  console.log(`Bits per sample: ${BITS_PER_SAMPLE}`);
  console.log(`Silence timeout: ${SILENCE_TIMEOUT_MS}ms`);
  console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? "✓ Set" : "✗ Not set"}`);
  console.log(`Model: gpt-realtime (text mode, no VAD)`);
  console.log("\nListening on:");
  console.log(`  Local:   ${address.address}:${address.port}`);
  networkAddresses.forEach((addr) => {
    console.log(`  Network: ${addr}:${address.port}`);
  });
  console.log("\nWaiting for ESP32 to send audio...");
  console.log("==============================================\n");
}

function getNetworkAddresses() {
  const interfaces = require("os").networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  return addresses;
}
