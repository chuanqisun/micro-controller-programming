import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import dgram from "dgram";
import "dotenv/config";
import os from "os";

const UDP_PORT = 8888;
const PACKET_SIZE = 1024; // bytes per UDP packet
const TARGET_IP = "192.168.41.27"; // Target device IP

// Audio parameters for the microcontroller
const SAMPLE_RATE = 22050;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const SAMPLES_PER_PACKET = PACKET_SIZE / BYTES_PER_SAMPLE;
const MS_PER_PACKET = (SAMPLES_PER_PACKET / SAMPLE_RATE) * 1000;

const udpClient = dgram.createSocket("udp4");
udpClient.bind(() => {
  udpClient.setBroadcast(true);
});

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

// Get local IP address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  udpClient.close(() => {
    console.log("\n👋 Server shutting down...");
    process.exit(0);
  });
});

console.log("\n==============================================");
console.log("PCM UDP Streaming Server (11Labs)");
console.log("==============================================");
console.log(`Local IP: ${getLocalIpAddress()}`);
console.log(`UDP Port: ${UDP_PORT}`);
console.log(`Target IP: ${TARGET_IP}`);
console.log(`Packet size: ${PACKET_SIZE} bytes`);
console.log(`Sample rate: ${SAMPLE_RATE} Hz`);
console.log(`Samples per packet: ${SAMPLES_PER_PACKET}`);
console.log(`Delay per packet: ${MS_PER_PACKET.toFixed(2)} ms`);
console.log("==============================================\n");

console.log("Generating audio with 11labs...");

/** audio: ReadableStream<Uint8Array<ArrayBufferLike>> */
const audio = await elevenlabs.textToSoundEffects.convert({
  outputFormat: "pcm_22050", // Match the microcontroller's sample rate
  text: "A flock of ducks quacking",
});

console.log("Audio generated! Starting UDP stream...\n");

let audioBuffer = Buffer.alloc(0);

// First, read all audio data into memory
const reader = audio.getReader();
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    audioBuffer = Buffer.concat([audioBuffer, Buffer.from(value)]);
  }
  console.log(`✅ Audio loaded: ${audioBuffer.length} bytes (${(audioBuffer.length / SAMPLE_RATE / BYTES_PER_SAMPLE).toFixed(2)}s)\n`);
} catch (error) {
  console.error("❌ Error loading audio:", error.message);
  process.exit(1);
}

let loopCount = 0;

async function streamAudio() {
  loopCount++;
  console.log(`🔄 Starting loop #${loopCount}...`);

  let packetIndex = 0;
  let buffer = Buffer.from(audioBuffer); // Create a copy for this loop

  try {
    while (buffer.length >= PACKET_SIZE) {
      const packet = buffer.subarray(0, PACKET_SIZE);
      buffer = buffer.subarray(PACKET_SIZE);

      // Schedule the packet send with proper timing to match playback speed
      setTimeout(() => {
        udpClient.send(packet, UDP_PORT, TARGET_IP, (err) => {
          if (err) {
            console.error(`❌ Error sending packet ${packetIndex}:`, err.message);
          }
        });
      }, packetIndex * MS_PER_PACKET);

      packetIndex++;

      // Log progress every 100 packets
      if (packetIndex % 100 === 0) {
        const seconds = (packetIndex * MS_PER_PACKET) / 1000;
        console.log(`📦 Loop #${loopCount}: Sent ${packetIndex} packets (${seconds.toFixed(1)}s of audio)`);
      }
    }

    // Schedule the next loop after all packets have been sent
    const totalDuration = packetIndex * MS_PER_PACKET;
    setTimeout(() => {
      streamAudio(); // Start next loop
    }, totalDuration);
  } catch (error) {
    console.error("❌ Error streaming audio:", error.message);
  }
}

streamAudio();
