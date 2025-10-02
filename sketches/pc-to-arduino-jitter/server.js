const net = require("net");
const fs = require("fs");
const { spawn } = require("child_process");

// Audio configuration (must match Arduino settings)
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

// Arduino connection details
const ARDUINO_IP = "192.168.41.53";
const ARDUINO_PORT = 8000;

// WAV file path
const WAV_FILE = "./sound/audio.wav";

// Convert WAV to raw PCM using ffmpeg
function convertWavToRaw(callback) {
  console.log("Converting WAV to raw PCM...");

  const ffmpeg = spawn("ffmpeg", [
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
    "-", // output to stdout
  ]);

  const chunks = [];

  ffmpeg.stdout.on("data", (chunk) => {
    chunks.push(chunk);
  });

  ffmpeg.stderr.on("data", (data) => {
    // ffmpeg outputs progress to stderr, ignore it
  });

  ffmpeg.on("close", (code) => {
    if (code === 0) {
      const rawAudio = Buffer.concat(chunks);
      console.log(`Converted ${rawAudio.length} bytes of raw audio`);
      callback(null, rawAudio);
    } else {
      callback(new Error(`ffmpeg exited with code ${code}`));
    }
  });

  ffmpeg.on("error", (err) => {
    callback(err);
  });
}

// Stream audio to Arduino
function streamToArduino(audioBuffer) {
  const client = new net.Socket();

  console.log(`Connecting to Arduino at ${ARDUINO_IP}:${ARDUINO_PORT}...`);

  client.connect(ARDUINO_PORT, ARDUINO_IP, () => {
    console.log("Connected to Arduino!");
    console.log(`Streaming audio (${audioBuffer.length} bytes)`);

    const chunkSize = 512;
    let offset = 0;

    const sendChunk = () => {
      if (offset >= audioBuffer.length) {
        console.log("Finished streaming audio");
        client.end();
        return;
      }

      const end = Math.min(offset + chunkSize, audioBuffer.length);
      const chunk = audioBuffer.slice(offset, end);

      const canContinue = client.write(chunk);
      offset = end;

      if (canContinue) {
        // Send next chunk at real-time rate
        setTimeout(sendChunk, (chunkSize / SAMPLE_RATE) * 1000);
      } else {
        // Wait for drain event
        client.once("drain", () => {
          setTimeout(sendChunk, (chunkSize / SAMPLE_RATE) * 1000);
        });
      }
    };

    sendChunk();
  });

  client.on("error", (err) => {
    console.error("Connection error:", err.message);
  });

  client.on("close", () => {
    console.log("Disconnected from Arduino");
  });
}

// Start
console.log("Arduino Audio Streamer");
console.log("======================");

convertWavToRaw((err, audioBuffer) => {
  if (err) {
    console.error("Error converting audio:", err.message);
    console.log("\nMake sure ffmpeg is installed: sudo apt install ffmpeg");
    process.exit(1);
  }
  streamToArduino(audioBuffer);
});
