const path = require("path");
const fs = require("fs");
const os = require("os");
const dgram = require("dgram");
const { spawn } = require("child_process");

const UDP_PORT = 8888;
const PACKET_SIZE = 1024; // bytes per UDP packet
const TARGET_IP = "192.168.1.255"; // Broadcast address - change this to target specific IP

const udpClient = dgram.createSocket("udp4");
udpClient.bind(() => {
  udpClient.setBroadcast(true);
});

// Convert MP3 to PCM and stream via UDP indefinitely
function streamMP3Loop() {
  const mp3Path = path.join(__dirname, "example.mp3");

  if (!fs.existsSync(mp3Path)) {
    console.error("❌ example.mp3 not found!");
    process.exit(1);
  }

  console.log("\n==============================================");
  console.log("Starting PCM UDP Stream (from MP3)");
  console.log("==============================================");
  console.log(`Target: ${TARGET_IP}:${UDP_PORT}`);
  console.log(`Source: ${mp3Path}`);
  console.log(`Packet size: ${PACKET_SIZE} bytes`);
  console.log("Converting MP3 to raw PCM...");
  console.log("==============================================\n");

  // Use ffmpeg to convert MP3 to raw PCM
  // Output format: 16-bit signed little-endian PCM, mono, 16kHz
  const ffmpeg = spawn("ffmpeg", [
    "-stream_loop",
    "-1", // Loop indefinitely
    "-i",
    mp3Path, // Input file
    "-f",
    "s16le", // Output format: signed 16-bit little-endian
    "-ar",
    "16000", // Sample rate: 16kHz
    "-ac",
    "1", // Channels: mono
    "-", // Output to stdout
  ]);

  let packetIndex = 0;
  let buffer = Buffer.alloc(0);

  ffmpeg.stdout.on("data", (chunk) => {
    // Accumulate data
    buffer = Buffer.concat([buffer, chunk]);

    // Send packets when we have enough data
    while (buffer.length >= PACKET_SIZE) {
      const packet = buffer.slice(0, PACKET_SIZE);
      buffer = buffer.slice(PACKET_SIZE);

      udpClient.send(packet, UDP_PORT, TARGET_IP, (err) => {
        if (err) {
          console.error(`❌ Error sending packet ${packetIndex}:`, err.message);
        }
      });

      packetIndex++;

      // Log progress every 100 packets
      if (packetIndex % 100 === 0) {
        console.log(`📦 Sent ${packetIndex} packets`);
      }
    }
  });

  ffmpeg.stderr.on("data", (data) => {
    // ffmpeg outputs its logs to stderr, suppress them unless there's an error
  });

  ffmpeg.on("error", (error) => {
    console.error("❌ ffmpeg error:", error.message);
  });

  ffmpeg.on("close", (code) => {
    if (code !== 0) {
      console.error(`❌ ffmpeg exited with code ${code}`);
    }
  });
}

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

// Start streaming
const ipAddress = getLocalIpAddress();
console.log("\n==============================================");
console.log("PCM UDP Streaming Server");
console.log("==============================================");
console.log(`Local IP: ${ipAddress}`);
console.log(`UDP Port: ${UDP_PORT}`);
console.log(`Target IP: ${TARGET_IP}`);
console.log(`Packet size: ${PACKET_SIZE} bytes`);
console.log("==============================================\n");

streamMP3Loop();
