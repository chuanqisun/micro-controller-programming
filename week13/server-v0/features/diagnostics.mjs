import { BITS_PER_SAMPLE, CHANNELS, SAMPLE_RATE, SILENCE_TIMEOUT_MS, STATS_INTERVAL_MS } from "../config.mjs";
import { getNetworkAddresses } from "./ip-discovery.mjs";

let packetsReceived = 0;
let bytesReceived = 0;
let lastStatsTime = Date.now();

export function initializeDiagnostics() {
  packetsReceived = 0;
  bytesReceived = 0;
  lastStatsTime = Date.now();
}

export function updateStatistics(messageLength) {
  packetsReceived++;
  bytesReceived += messageLength;
}

export function logStatisticsIfIntervalElapsed(audioBuffer) {
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

export function logServerStartup(address) {
  const networkAddresses = getNetworkAddresses();

  console.log("\n==============================================");
  console.log("ESP32 Bidirectional Voice with Realtime API");
  console.log("==============================================");
  console.log(`UDP Server receiving on port ${address.port}`);
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

export function logSpeakingStarted() {
  console.log("🎤 Speaking...");
}

export function logAudioSent() {
  console.log("📤 Sent");
}

export function logShutdown() {
  console.log("\n\nShutting down...");
}

export function logServerClosed() {
  console.log("Server closed");
}

export function logReceiverError(err) {
  console.error(`Receiver error:\n${err.stack}`);
}
