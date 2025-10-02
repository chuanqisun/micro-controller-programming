const net = require("net");

// Audio configuration (must match Arduino settings)
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;

// Sine wave configuration
const FREQUENCY = 440; // Hz (A4 note)
const AMPLITUDE = 0.3; // 0.0 to 1.0 (30% volume to avoid clipping)

// Arduino connection details
const ARDUINO_IP = "192.168.41.53";
const ARDUINO_PORT = 8000;

// Generate sine wave samples
function generateSineWave(numSamples) {
  const buffer = Buffer.alloc(numSamples * BYTES_PER_SAMPLE);
  const maxValue = Math.pow(2, BITS_PER_SAMPLE - 1) - 1;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const sample = Math.sin(2 * Math.PI * FREQUENCY * t) * AMPLITUDE;
    const intSample = Math.round(sample * maxValue);

    // Write as 16-bit signed integer (little-endian)
    buffer.writeInt16LE(intSample, i * BYTES_PER_SAMPLE);
  }

  return buffer;
}

// Connect to Arduino and stream audio
function streamToArduino() {
  const client = new net.Socket();

  console.log(`Connecting to Arduino at ${ARDUINO_IP}:${ARDUINO_PORT}...`);

  client.connect(ARDUINO_PORT, ARDUINO_IP, () => {
    console.log("Connected to Arduino!");
    console.log(`Streaming ${FREQUENCY}Hz sine wave at ${SAMPLE_RATE}Hz sample rate`);

    // Generate chunks of audio data
    const chunkSize = 512; // Match Arduino buffer size
    let sampleOffset = 0;

    // Stream continuously
    const streamInterval = setInterval(() => {
      if (client.destroyed) {
        clearInterval(streamInterval);
        return;
      }

      const buffer = generateSineWave(chunkSize);

      // Write to socket
      const canContinue = client.write(buffer);

      if (!canContinue) {
        // Wait for drain event if buffer is full
        client.once("drain", () => {
          console.log("Buffer drained, continuing...");
        });
      }

      sampleOffset += chunkSize;
    }, (chunkSize / SAMPLE_RATE) * 1000); // Send at real-time rate

    // Handle disconnection
    client.on("close", () => {
      console.log("Connection closed");
      clearInterval(streamInterval);
    });
  });

  client.on("error", (err) => {
    console.error("Connection error:", err.message);
    setTimeout(() => {
      console.log("Retrying connection...");
      streamToArduino();
    }, 5000);
  });

  client.on("close", () => {
    console.log("Disconnected from Arduino");
  });
}

// Start streaming
console.log("Arduino Audio Streamer");
console.log("======================");
streamToArduino();
