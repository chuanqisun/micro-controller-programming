const http = require("http");
const fs = require("fs");
const { spawn } = require("child_process");
const path = require("path");

// Audio configuration (must match Arduino settings)
const SAMPLE_RATE = 8000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

// Server configuration
const PORT = 3000;
const WAV_FILE = "./sound/audio.wav";
const RAW_FILE = "./sound/audio.raw";

// Convert WAV to raw PCM using ffmpeg
function convertWavToRaw(callback) {
  console.log("Converting WAV to raw PCM...");

  const ffmpeg = spawn("ffmpeg", [
    "-y", // overwrite output file
    "-i",
    WAV_FILE,
    "-f",
    "s16le", // signed 16-bit little-endian
    "-acodec",
    "pcm_s16le", // PCM codec
    "-ar",
    SAMPLE_RATE.toString(), // sample rate
    "-ac",
    CHANNELS.toString(), // channels
    RAW_FILE,
  ]);

  ffmpeg.stderr.on("data", (data) => {
    // ffmpeg outputs progress to stderr
  });

  ffmpeg.on("close", (code) => {
    if (code === 0) {
      const stats = fs.statSync(RAW_FILE);
      console.log(`✓ Converted to RAW format (${stats.size} bytes)`);
      callback(null);
    } else {
      callback(new Error(`ffmpeg exited with code ${code}`));
    }
  });

  ffmpeg.on("error", (err) => {
    callback(err);
  });
}

// Create HTTP server
function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url === "/audio.raw" || req.url === "/") {
      const filePath = RAW_FILE;

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("RAW file not found");
        return;
      }

      const stat = fs.statSync(filePath);
      const fileSize = stat.size;

      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Length": fileSize,
        "Accept-Ranges": "bytes",
      });

      const readStream = fs.createReadStream(filePath);
      readStream.pipe(res);

      console.log(`[${new Date().toISOString()}] Streaming audio to client`);
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
    console.log("Arduino Audio Server");
    console.log("==============================================");
    console.log(`Server running on port ${PORT}`);
    console.log("\nRAW Audio URL:");
    console.log(`  Local:   http://localhost:${PORT}/audio.raw`);
    addresses.forEach((addr) => {
      console.log(`  Network: http://${addr}:${PORT}/audio.raw`);
    });
    console.log("\nUpdate your Arduino sketch with one of these URLs");
    console.log("==============================================\n");
  });
}

// Main
console.log("Arduino Audio Server");
console.log("======================\n");

// Check if WAV file exists
if (!fs.existsSync(WAV_FILE)) {
  console.error(`Error: WAV file not found at ${WAV_FILE}`);
  console.log("Please place your audio.wav file in the sound/ directory");
  process.exit(1);
}

// Create sound directory if it doesn't exist
const soundDir = path.dirname(RAW_FILE);
if (!fs.existsSync(soundDir)) {
  fs.mkdirSync(soundDir, { recursive: true });
}

// Convert and start server
convertWavToRaw((err) => {
  if (err) {
    console.error("Error converting audio:", err.message);
    console.log("\nMake sure ffmpeg is installed: sudo apt install ffmpeg");
    process.exit(1);
  }
  startServer();
});
