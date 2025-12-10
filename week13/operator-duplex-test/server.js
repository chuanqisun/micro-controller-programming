const dgram = require("dgram");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const SAMPLE_RATE = 24000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const UDP_RECEIVE_PORT = 8888;
const UDP_SEND_PORT = 8889;
const TARGET_IP = "192.168.41.27";
const PACKET_SIZE = 1024;
const SILENCE_TIMEOUT_MS = 1000;
const STATS_INTERVAL_MS = 5000;
const SILENCE_CHECK_INTERVAL_MS = 100;

const STATE = {
  SILENT: "silent",
  SPEAKING: "speaking",
};

const udpReceiver = dgram.createSocket("udp4");
const udpSender = dgram.createSocket("udp4");

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
  validateEnvironment();
  connectToRealtimeAPI();
  setupUDPReceiver();
  process.on("SIGINT", handleGracefulShutdown);
}

function setupUDPReceiver() {
  udpReceiver.bind(UDP_RECEIVE_PORT);
  udpReceiver.on("listening", handleReceiverListening);
  udpReceiver.on("message", handleIncomingAudioPacket);
  udpReceiver.on("error", handleReceiverError);
}

function handleReceiverListening() {
  const address = udpReceiver.address();
  logServerStartup(address);
  silenceCheckInterval = setInterval(detectSilence, SILENCE_CHECK_INTERVAL_MS);
}

function handleIncomingAudioPacket(msg, rinfo) {
  beginSpeakingStateIfNeeded();
  lastPacketTime = Date.now();
  audioBuffer.push(Buffer.from(msg));

  if (sessionReady && realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
    streamAudioChunkToRealtime(msg);
  }

  updateStatistics(msg.length);
  logStatisticsIfIntervalElapsed();
}

function handleReceiverError(err) {
  console.error(`Receiver error:\n${err.stack}`);
  udpReceiver.close();
}

function detectSilence() {
  if (currentState === STATE.SPEAKING && lastPacketTime) {
    const timeSinceLastPacket = Date.now() - lastPacketTime;
    if (timeSinceLastPacket > SILENCE_TIMEOUT_MS) {
      transitionToSilentAndProcessAudio();
    }
  }
}

function beginSpeakingStateIfNeeded() {
  if (currentState !== STATE.SPEAKING) {
    console.log("🎤 Speaking...");
    currentState = STATE.SPEAKING;
    audioBuffer = [];
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

function connectToRealtimeAPI() {
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
      instructions:
        "Respond to user speech in the voice of a HAM radio operator. One short spoken phrase response only.",
      voice: "ash",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      turn_detection: null,
    },
  };

  realtimeWs.send(JSON.stringify(sessionConfig));
}

function streamAudioChunkToRealtime(audioChunk) {
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
        instructions:
          "Low coarse seasoned veteran from war time, military radio operator voice with no emotion. Speak fast with urgency.",
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
  await Promise.all([playAudioThroughSpeakers(wavBuffer), streamAudioToUDP(pcmBuffer)]);
}

async function convertWavToPCM16(wavBuffer) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i",
      "pipe:0",
      "-f",
      "s16le",
      "-ar",
      SAMPLE_RATE.toString(),
      "-ac",
      CHANNELS.toString(),
      "-loglevel",
      "quiet",
      "pipe:1",
    ]);

    const chunks = [];

    ffmpeg.stdout.on("data", (chunk) => {
      chunks.push(chunk);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", reject);

    ffmpeg.stdin.write(wavBuffer);
    ffmpeg.stdin.end();
  });
}

async function playAudioThroughSpeakers(wavBuffer) {
  return new Promise((resolve, reject) => {
    const ffplay = spawn("ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", "-i", "pipe:0"]);

    ffplay.on("error", reject);

    ffplay.on("close", (code) => {
      if (code === 0) {
        console.log("✓ Speaker playback completed");
        resolve();
      } else {
        reject(new Error(`ffplay exited with code ${code}`));
      }
    });

    ffplay.stdin.write(wavBuffer);
    ffplay.stdin.end();
  });
}

async function streamAudioToUDP(pcmBuffer) {
  console.log("📡 Streaming audio to ESP32...");

  const totalPackets = Math.ceil(pcmBuffer.length / PACKET_SIZE);

  for (let i = 0; i < totalPackets; i++) {
    const start = i * PACKET_SIZE;
    const end = Math.min(start + PACKET_SIZE, pcmBuffer.length);
    const packet = pcmBuffer.slice(start, end);

    await sendAudioPacketToESP32(packet);

    const delayMs = (PACKET_SIZE / 2 / SAMPLE_RATE) * 1000;
    await sleep(delayMs);
  }

  console.log("✓ UDP streaming completed");
}

function sendAudioPacketToESP32(buffer) {
  return new Promise((resolve, reject) => {
    udpSender.send(buffer, UDP_SEND_PORT, TARGET_IP, (err) => {
      if (err) {
        console.error("❌ Error sending UDP packet:", err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function handleGracefulShutdown() {
  console.log("\n\nShutting down...");
  if (silenceCheckInterval) {
    clearInterval(silenceCheckInterval);
  }
  if (realtimeWs) {
    realtimeWs.close();
  }
  udpReceiver.close(() => {
    udpSender.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });
}

function validateEnvironment() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("⚠️  OPENAI_API_KEY not set. Cannot connect to Realtime API.");
    process.exit(1);
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
  console.log("ESP32 Bidirectional Voice with Realtime API");
  console.log("==============================================");
  console.log(`UDP Server receiving on port ${address.port}`);
  console.log(`UDP Server sending to: ${TARGET_IP}:${UDP_SEND_PORT}`);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
