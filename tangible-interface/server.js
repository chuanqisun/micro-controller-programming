const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const dgram = require("dgram");

const app = express();
const PORT = 8000;
const UDP_PORT = 8888;
const PACKET_SIZE = 1024; // bytes per UDP packet

const udpClient = dgram.createSocket("udp4");

// Handle POST request to /upload
app.post("/upload", express.raw({ type: "*/*", limit: "10mb" }), (req, res) => {
  const boundary = req.headers["content-type"]?.match(/boundary=(.+)$/)?.[1];

  if (!boundary) {
    return res.status(400).json({ error: "No boundary in multipart data" });
  }

  // Extract JPEG data from multipart body
  const body = req.body.toString("binary");
  const parts = body.split("--" + boundary);

  let jpegBuffer = null;
  for (const part of parts) {
    if (part.includes("Content-Type: image/jpeg")) {
      const startMarker = "\r\n\r\n";
      const start = part.indexOf(startMarker) + startMarker.length;
      const end = part.lastIndexOf("\r\n");
      if (start > startMarker.length && end > start) {
        jpegBuffer = Buffer.from(part.substring(start, end), "binary");
        break;
      }
    }
  }

  if (!jpegBuffer) {
    return res.status(400).json({ error: "No image data found" });
  }

  const filePath = path.join(__dirname, "..", "image.jpeg");
  fs.writeFileSync(filePath, jpegBuffer);

  console.log("File uploaded successfully: image.jpeg");

  // Get client IP from request
  const clientIP = req.ip.replace(/^::ffff:/, ""); // Remove IPv6 prefix if present

  // Stream MP3 file via UDP
  streamMP3ToClient(clientIP);

  // Log client IP and response
  console.log(`Streaming MP3 to client IP: ${clientIP}:${UDP_PORT}`);

  res.json({
    ok: true,
    message: "File uploaded successfully",
    filename: "image.jpeg",
  });
});

// Stream MP3 file to client via UDP
function streamMP3ToClient(targetIP) {
  const mp3Path = path.join(__dirname, "example.mp3");

  if (!fs.existsSync(mp3Path)) {
    console.error("❌ example.mp3 not found!");
    return;
  }

  const mp3Data = fs.readFileSync(mp3Path);
  const totalPackets = Math.ceil(mp3Data.length / PACKET_SIZE);

  console.log("\n==============================================");
  console.log("Starting MP3 UDP Stream");
  console.log("==============================================");
  console.log(`Target: ${targetIP}:${UDP_PORT}`);
  console.log(`File size: ${mp3Data.length} bytes`);
  console.log(`Packet size: ${PACKET_SIZE} bytes`);
  console.log(`Total packets: ${totalPackets}`);
  console.log("==============================================\n");

  let packetIndex = 0;

  const intervalId = setInterval(() => {
    if (packetIndex >= totalPackets) {
      clearInterval(intervalId);
      console.log("✅ MP3 streaming completed");
      return;
    }

    const start = packetIndex * PACKET_SIZE;
    const end = Math.min(start + PACKET_SIZE, mp3Data.length);
    const packet = mp3Data.slice(start, end);

    udpClient.send(packet, UDP_PORT, targetIP, (err) => {
      if (err) {
        console.error(`❌ Error sending packet ${packetIndex}:`, err.message);
      }
    });

    packetIndex++;

    // Log progress every 100 packets
    if (packetIndex % 100 === 0) {
      const progress = ((packetIndex / totalPackets) * 100).toFixed(1);
      console.log(`📦 Progress: ${progress}% (${packetIndex}/${totalPackets} packets)`);
    }
  }, 10); // Send a packet every 10ms
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

// Start server
app.listen(PORT, () => {
  const ipAddress = getLocalIpAddress();
  console.log("\n==============================================");
  console.log("Image Upload Server with UDP Audio Streaming");
  console.log("==============================================");
  console.log(`HTTP Server: http://${ipAddress}:${PORT}`);
  console.log(`Upload endpoint: http://${ipAddress}:${PORT}/upload`);
  console.log(`UDP Port: ${UDP_PORT}`);
  console.log(`Packet size: ${PACKET_SIZE} bytes`);
  console.log("==============================================\n");
});
