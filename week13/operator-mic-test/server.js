const dgram = require("dgram");
const { spawn } = require("child_process");

const SAMPLE_RATE = 22000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

const UDP_PORT = 8888;

const server = dgram.createSocket("udp4");

// FFmpeg process to play audio
let ffmpegPlayer = null;

// Statistics
let packetsReceived = 0;
let bytesReceived = 0;
let lastStatsTime = Date.now();

function startAudioPlayer() {
  console.log("Starting audio player...");

  // Use ffmpeg to play raw PCM audio
  ffmpegPlayer = spawn("ffmpeg", [
    "-f",
    "s16le", // signed 16-bit little-endian
    "-ar",
    SAMPLE_RATE.toString(), // sample rate
    "-ac",
    CHANNELS.toString(), // channels
    "-i",
    "pipe:0", // input from stdin
    "-f",
    "alsa", // Use ALSA for Linux audio output
    "default", // Default audio output device
  ]);

  ffmpegPlayer.stderr.on("data", (data) => {
    // ffmpeg outputs info to stderr, only log errors
    const message = data.toString();
    if (message.includes("error") || message.includes("Error")) {
      console.error("FFmpeg error:", message);
    }
  });

  ffmpegPlayer.on("error", (err) => {
    console.error("FFmpeg process error:", err);
  });

  ffmpegPlayer.on("close", (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
  });

  console.log("✓ Audio player started");
}

// Handle incoming UDP packets
server.on("message", (msg, rinfo) => {
  if (!ffmpegPlayer) {
    startAudioPlayer();
  }

  // Write audio data to ffmpeg stdin
  if (ffmpegPlayer && !ffmpegPlayer.killed) {
    ffmpegPlayer.stdin.write(msg);
  }

  // Update statistics
  packetsReceived++;
  bytesReceived += msg.length;

  // Log statistics every 5 seconds
  const now = Date.now();
  if (now - lastStatsTime > 5000) {
    const elapsed = (now - lastStatsTime) / 1000;
    const packetsPerSec = (packetsReceived / elapsed).toFixed(1);
    const kbytesPerSec = (bytesReceived / elapsed / 1024).toFixed(2);

    console.log(`Stats: ${packetsPerSec} packets/s, ${kbytesPerSec} KB/s from ${rinfo.address}:${rinfo.port}`);

    packetsReceived = 0;
    bytesReceived = 0;
    lastStatsTime = now;
  }
});

server.on("error", (err) => {
  console.error(`Server error:\n${err.stack}`);
  server.close();
});

server.on("listening", () => {
  const address = server.address();
  const interfaces = require("os").networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  console.log("\n==============================================");
  console.log("ESP32 Audio UDP Receiver");
  console.log("==============================================");
  console.log(`UDP Server listening on port ${address.port}`);
  console.log(`Sample Rate: ${SAMPLE_RATE} Hz`);
  console.log(`Channels: ${CHANNELS} (mono)`);
  console.log(`Bits per sample: ${BITS_PER_SAMPLE}`);
  console.log("\nListening on:");
  console.log(`  Local:   ${address.address}:${address.port}`);
  addresses.forEach((addr) => {
    console.log(`  Network: ${addr}:${address.port}`);
  });
  console.log("\nWaiting for ESP32 to send audio...");
  console.log("==============================================\n");
});

// Start UDP server
server.bind(UDP_PORT);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\nShutting down...");

  if (ffmpegPlayer && !ffmpegPlayer.killed) {
    ffmpegPlayer.stdin.end();
    ffmpegPlayer.kill("SIGTERM");
  }

  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
