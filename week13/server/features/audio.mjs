import { spawn } from "child_process";
import dgram from "dgram";
import { CHANNELS, ESP32_UDP_RX_PORT, PACKET_SIZE, SAMPLE_RATE } from "../config.mjs";

// Track active streaming operations
let activeStreamingCancelled = false;
let activePlaybackProcess = null;

export async function convertWavToPCM16(wavBuffer) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", ["-i", "pipe:0", "-f", "s16le", "-ar", SAMPLE_RATE.toString(), "-ac", CHANNELS.toString(), "-loglevel", "quiet", "pipe:1"]);

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

export async function playAudioThroughSpeakers(wavBuffer) {
  return new Promise((resolve, reject) => {
    const ffplay = spawn("ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", "-i", "pipe:0"]);

    // Track this process for cancellation
    activePlaybackProcess = ffplay;

    ffplay.on("error", reject);

    ffplay.on("close", (code) => {
      activePlaybackProcess = null;
      if (code === 0) {
        console.log("✓ Speaker playback completed");
        resolve();
      } else if (code === null || code === 255) {
        // Process was killed (likely by cancellation)
        console.log("⚠️  Speaker playback cancelled");
        resolve();
      } else {
        reject(new Error(`ffplay exited with code ${code}`));
      }
    });

    ffplay.stdin.write(wavBuffer);
    ffplay.stdin.end();
  });
}

export async function streamAudioToUDP(pcmBuffer, socket, targetIp) {
  if (!targetIp) {
    console.warn("⚠️  No target IP provided for UDP streaming");
    return;
  }

  // Reset cancellation flag at start of new stream
  activeStreamingCancelled = false;

  console.log(`📡 Streaming audio to ESP32 at ${targetIp}:${ESP32_UDP_RX_PORT}...`);

  const totalPackets = Math.ceil(pcmBuffer.length / PACKET_SIZE);

  for (let i = 0; i < totalPackets; i++) {
    // Check if streaming was cancelled
    if (activeStreamingCancelled) {
      console.log("⚠️  Streaming cancelled");
      return;
    }

    const start = i * PACKET_SIZE;
    const end = Math.min(start + PACKET_SIZE, pcmBuffer.length);
    const packet = pcmBuffer.slice(start, end);

    await sendAudioPacketToESP32(packet, socket, targetIp);

    const delayMs = (PACKET_SIZE / 2 / SAMPLE_RATE) * 1000;
    await sleep(delayMs);
  }

  console.log("✓ UDP streaming completed");
}

export function cancelStreaming() {
  console.log("🛑 Cancelling active audio streaming...");
  activeStreamingCancelled = true;
}

export function cancelPlayback() {
  if (activePlaybackProcess) {
    console.log("🛑 Cancelling active speaker playback...");
    activePlaybackProcess.kill();
    activePlaybackProcess = null;
  }
}

/**
 * @param {Buffer} buffer
 * @param {dgram.Socket} socket
 * @param {string} targetIp - Target IP address to send the packet to
 * @returns {Promise}
 */
function sendAudioPacketToESP32(buffer, socket, targetIp) {
  return new Promise((resolve, reject) => {
    socket.send(buffer, ESP32_UDP_RX_PORT, targetIp, (err) => {
      if (err) {
        console.error("❌ Error sending UDP packet:", err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
