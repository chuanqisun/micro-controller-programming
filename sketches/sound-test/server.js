const http = require("http");
const { spawn } = require("child_process");

// Audio configuration (must match Arduino settings)
const SAMPLE_RATE = 8000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

// Server configuration
const PORT = 3000;

// Store active clients
const clients = new Set();

// Start microphone capture using ffmpeg
function startMicrophoneCapture() {
  console.log("Starting microphone capture...");

  // Use ffmpeg to capture microphone and convert to raw PCM
  const ffmpeg = spawn("ffmpeg", [
    "-f",
    "alsa", // Use ALSA for Linux audio input
    "-i",
    "default", // Default microphone
    "-f",
    "s16le", // signed 16-bit little-endian
    "-acodec",
    "pcm_s16le", // PCM codec
    "-ar",
    SAMPLE_RATE.toString(), // sample rate
    "-ac",
    CHANNELS.toString(), // channels
    "-", // output to stdout
  ]);

  // Broadcast microphone data to all connected clients
  ffmpeg.stdout.on("data", (chunk) => {
    clients.forEach((client) => {
      if (!client.destroyed) {
        client.write(chunk);
      }
    });
  });

  ffmpeg.stderr.on("data", (data) => {
    // ffmpeg outputs info to stderr, only log errors
    const message = data.toString();
    if (message.includes("error") || message.includes("Error")) {
      console.error("FFmpeg error:", message);
    }
  });

  ffmpeg.on("error", (err) => {
    console.error("FFmpeg process error:", err);
  });

  ffmpeg.on("close", (code) => {
    console.log(`FFmpeg process exited with code ${code}`);
  });

  console.log("✓ Microphone capture started");
  return ffmpeg;
}

// Create HTTP server
function startServer(micProcess) {
  const server = http.createServer((req, res) => {
    if (req.url === "/audio.raw" || req.url === "/") {
      console.log(`[${new Date().toISOString()}] Client connected`);

      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
      });

      // Add client to the set
      clients.add(res);

      // Remove client when connection closes
      req.on("close", () => {
        clients.delete(res);
        console.log(`[${new Date().toISOString()}] Client disconnected`);
      });
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
    }
  });

  server.listen(PORT, () => {
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
    console.log("Arduino Audio Server (Live Microphone)");
    console.log("==============================================");
    console.log(`Server running on port ${PORT}`);
    console.log(`Sample Rate: ${SAMPLE_RATE} Hz`);
    console.log(`Channels: ${CHANNELS} (mono)`);
    console.log(`Bits per sample: ${BITS_PER_SAMPLE}`);
    console.log("\nLive Audio Stream URL:");
    console.log(`  Local:   http://localhost:${PORT}/audio.raw`);
    addresses.forEach((addr) => {
      console.log(`  Network: http://${addr}:${PORT}/audio.raw`);
    });
    console.log("\nStreaming microphone audio in real-time...");
    console.log("==============================================\n");
  });

  return server;
}

// Main
console.log("Arduino Audio Server (Live Microphone)");
console.log("========================================\n");

// Start microphone capture
const micProcess = startMicrophoneCapture();

// Start HTTP server
const server = startServer(micProcess);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\nShutting down...");
  micProcess.kill("SIGTERM");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
