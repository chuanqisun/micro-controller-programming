import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import dgram from "dgram";
import "dotenv/config";
import fs from "fs";
import { mkdir } from "fs/promises";
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
  text: "A horse slowly walking on a stone path, with occasional bird chirps in the background",
  loop: true,
});

console.log("Audio generated! Starting UDP stream...\n");

const [playbackStream, saveStream] = audio.tee();

let audioBuffer = Buffer.alloc(0);

// First, read all audio data into memory
const reader = playbackStream.getReader();
try {
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    audioBuffer = Buffer.concat([audioBuffer, Buffer.from(value)]);
  }
  console.log(`✅ Audio loaded: ${audioBuffer.length} bytes (${(audioBuffer.length / SAMPLE_RATE / BYTES_PER_SAMPLE).toFixed(2)}s)\n`);

  // If stereo, convert to mono (assume stereo if divisible by 4 and not by 2)
  if (audioBuffer.length % 4 === 0) {
    console.log("Converting stereo to mono...");
    audioBuffer = stereoToMono(audioBuffer);
    console.log(`✅ Converted to mono: ${audioBuffer.length} bytes (${(audioBuffer.length / SAMPLE_RATE / BYTES_PER_SAMPLE).toFixed(2)}s)\n`);
  }
} catch (error) {
  console.error("❌ Error loading audio:", error.message);
  process.exit(1);
}

// Load save buffer from tee'd stream
await mkdir("output", { recursive: true });
await saveAudioToFile(saveStream, `output/sound-${Date.now()}.wav`);

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

// Create WAV buffer from PCM data
function createWavBuffer(pcmBuffer, sampleRate, channels, bitsPerSample) {
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4); // file size - 8
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // audio format PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28); // byte rate
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32); // block align
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Convert 16-bit PCM stereo buffer to mono
function stereoToMono(buffer) {
  if (buffer.length % 4 !== 0) {
    console.warn("Stereo buffer length is not a multiple of 4 (2 channels x 2 bytes)");
  }
  const monoBuffer = Buffer.alloc(Math.floor(buffer.length / 2));
  for (let i = 0, j = 0; i + 3 < buffer.length; i += 4, j += 2) {
    // Read left and right samples
    const left = buffer.readInt16LE(i);
    const right = buffer.readInt16LE(i + 2);
    // Average and write as mono
    const mono = Math.floor((left + right) / 2);
    monoBuffer.writeInt16LE(mono, j);
  }
  return monoBuffer;
}

streamAudio();

// Save audio from stream to WAV file
async function saveAudioToFile(saveStream, filename = `sound-${Date.now()}.wav`) {
  const saveReader = saveStream.getReader();
  let saveBuffer = Buffer.alloc(0);
  try {
    while (true) {
      const { done, value } = await saveReader.read();
      if (done) break;
      saveBuffer = Buffer.concat([saveBuffer, Buffer.from(value)]);
    }
    console.log(`✅ Save buffer loaded: ${saveBuffer.length} bytes\n`);

    // Convert save buffer to mono if stereo
    if (saveBuffer.length % 4 === 0) {
      saveBuffer = stereoToMono(saveBuffer);
    }

    // Create WAV buffer and save to file
    const wavBuffer = createWavBuffer(saveBuffer, SAMPLE_RATE, 1, BITS_PER_SAMPLE);
    fs.writeFileSync(filename, wavBuffer);
    console.log(`✅ Saved ${filename}\n`);
  } catch (error) {
    console.error("❌ Error loading save buffer:", error.message);
  }
}
