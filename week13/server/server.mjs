import * as dgram from "dgram";
import { LAPTOP_UDP_RX_PORT, SILENCE_CHECK_INTERVAL_MS, SILENCE_TIMEOUT_MS } from "./config.mjs";
import { playAudioThroughSpeakers } from "./features/audio.mjs";
import { initializeDiagnostics, logReceiverError, logServerClosed, logServerStartup, logShutdown } from "./features/diagnostics.mjs";
import { closeHttpServer, createHttpServer } from "./features/http-server.mjs";
import {
  closeRealtimeConnection,
  configureSilenceDetection,
  connectToRealtimeAPI,
  handleIncomingAudioPacket,
  setAudioStreamCallbacks,
  startSilenceDetection,
  stopSilenceDetection,
  validateEnvironment,
} from "./features/openai-realtime.mjs";

const udpReceiver = dgram.createSocket("udp4");
const udpSender = dgram.createSocket("udp4");

startServer();

function startServer() {
  validateEnvironment();
  initializeDiagnostics();
  setAudioStreamCallbacks(
    playAudioThroughSpeakers,
    () => {}
    // (pcmBuffer) => streamAudioToUDP(pcmBuffer, udpSender, getLastSenderIp())
  );
  configureSilenceDetection(SILENCE_TIMEOUT_MS, SILENCE_CHECK_INTERVAL_MS);
  connectToRealtimeAPI();
  setupUDPReceiver();
  createHttpServer();
  process.on("SIGINT", handleGracefulShutdown);
}

function setupUDPReceiver() {
  udpReceiver.bind(LAPTOP_UDP_RX_PORT);
  udpReceiver.on("listening", handleReceiverListening);
  udpReceiver.on("message", handleIncomingAudioPacket);
  udpReceiver.on("error", handleReceiverError);
}

function handleReceiverListening() {
  const address = udpReceiver.address();
  logServerStartup(address);
  startSilenceDetection();
}

function handleReceiverError(err) {
  logReceiverError(err);
  udpReceiver.close();
}

function handleGracefulShutdown() {
  logShutdown();
  stopSilenceDetection();
  closeRealtimeConnection();
  closeHttpServer().then(() => {
    udpReceiver.close(() => {
      udpSender.close(() => {
        logServerClosed();
        process.exit(0);
      });
    });
  });
}
