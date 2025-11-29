import * as dgram from "dgram";
import {
  BITS_PER_SAMPLE,
  CHANNELS,
  SAMPLE_RATE,
  SILENCE_CHECK_INTERVAL_MS,
  SILENCE_TIMEOUT_MS,
  STATS_INTERVAL_MS,
  TARGET_IP,
  UDP_RECEIVE_PORT,
  UDP_SEND_PORT,
} from "./config.mjs";
import { playAudioThroughSpeakers, streamAudioToUDP } from "./features/audio.mjs";
import { getNetworkAddresses } from "./features/ip-discovery.mjs";
import {
  closeRealtimeConnection,
  commitAudioAndRequestResponse,
  connectToRealtimeAPI,
  getIsProcessing,
  initializeRealtimeAPI,
  isSessionReady,
  setIsProcessing,
  streamAudioChunkToRealtime,
  validateEnvironment,
} from "./features/openai-realtime.mjs";

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
let packetsReceived = 0;
let bytesReceived = 0;
let lastStatsTime = Date.now();

startServer();

function startServer() {
  validateEnvironment();
  initializeRealtimeCallbacks();
  connectToRealtimeAPI();
  setupUDPReceiver();
  process.on("SIGINT", handleGracefulShutdown);
}

function initializeRealtimeCallbacks() {
  initializeRealtimeAPI({
    onSessionReady: () => {
      // Session is ready to receive audio
    },
    onResponseComplete: () => {
      // Response processing complete
    },
    onAudioStream: async (wavBuffer, pcmBuffer) => {
      await Promise.all([playAudioThroughSpeakers(wavBuffer), streamAudioToUDP(pcmBuffer, udpSender)]);
    },
  });
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

  if (isSessionReady()) {
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

    if (audioBuffer.length > 0 && !getIsProcessing() && isSessionReady()) {
      setIsProcessing(true);
      audioBuffer = [];
      await commitAudioAndRequestResponse();
    }
  }
}

function handleGracefulShutdown() {
  console.log("\n\nShutting down...");
  if (silenceCheckInterval) {
    clearInterval(silenceCheckInterval);
  }
  closeRealtimeConnection();
  udpReceiver.close(() => {
    udpSender.close(() => {
      console.log("Server closed");
      process.exit(0);
    });
  });
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
