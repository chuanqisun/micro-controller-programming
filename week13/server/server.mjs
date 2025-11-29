import * as dgram from "dgram";
import { SILENCE_CHECK_INTERVAL_MS, SILENCE_TIMEOUT_MS, UDP_RECEIVE_PORT } from "./config.mjs";
import { playAudioThroughSpeakers, streamAudioToUDP } from "./features/audio.mjs";
import {
  initializeDiagnostics,
  logAudioSent,
  logReceiverError,
  logServerClosed,
  logServerStartup,
  logShutdown,
  logSpeakingStarted,
  logStatisticsIfIntervalElapsed,
  updateStatistics,
} from "./features/diagnostics.mjs";
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

startServer();

function startServer() {
  validateEnvironment();
  initializeDiagnostics();
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

/**
 * Handles incoming UDP audio packets from the ESP32
 * @param {Buffer} msg - The audio data buffer received from UDP
 * @param {Object} rinfo - Remote address information
 * @param {string} rinfo.address - IP address of the sender
 * @param {number} rinfo.port - Port number of the sender
 * @param {string} rinfo.family - Address family ('IPv4' or 'IPv6')
 * @param {number} rinfo.size - Size of the received message
 */
function handleIncomingAudioPacket(msg, rinfo) {
  const senderIp = rinfo.address;
  beginSpeakingStateIfNeeded();
  lastPacketTime = Date.now();
  audioBuffer.push(Buffer.from(msg));

  if (isSessionReady()) {
    streamAudioChunkToRealtime(msg);
  }

  updateStatistics(msg.length);
  logStatisticsIfIntervalElapsed(audioBuffer);
}

function handleReceiverError(err) {
  logReceiverError(err);
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
    logSpeakingStarted();
    currentState = STATE.SPEAKING;
    audioBuffer = [];
  }
}

async function transitionToSilentAndProcessAudio() {
  if (currentState !== STATE.SILENT) {
    logAudioSent();
    currentState = STATE.SILENT;

    if (audioBuffer.length > 0 && !getIsProcessing() && isSessionReady()) {
      setIsProcessing(true);
      audioBuffer = [];
      await commitAudioAndRequestResponse();
    }
  }
}

function handleGracefulShutdown() {
  logShutdown();
  if (silenceCheckInterval) {
    clearInterval(silenceCheckInterval);
  }
  closeRealtimeConnection();
  udpReceiver.close(() => {
    udpSender.close(() => {
      logServerClosed();
      process.exit(0);
    });
  });
}
