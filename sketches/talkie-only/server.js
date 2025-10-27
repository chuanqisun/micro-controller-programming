const dgram = require("dgram");
const { spawn } = require("child_process");
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Audio configuration (must match Arduino settings)
const SAMPLE_RATE = 22000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

// UDP configuration
const UDP_PORT = 8888;

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SILENCE_TIMEOUT = 1000; // If no data for 1 second, consider it silent

// Create UDP socket
const server = dgram.createSocket("udp4");

// State machine
const STATE = {
  SILENT: "silent",
  SPEAKING: "speaking",
};
let currentState = STATE.SILENT;
let audioBuffer = [];
let lastPacketTime = null;
let silenceCheckInterval = null;
let isTranscribing = false;

// Statistics
let packetsReceived = 0;
let bytesReceived = 0;
let lastStatsTime = Date.now();

async function createWavFromPCM(pcmData) {
  // Create WAV header
  const dataSize = pcmData.length;
  const fileSize = 44 + dataSize;

  const header = Buffer.alloc(44);

  // RIFF header
  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize - 8, 4);
  header.write("WAVE", 8);

  // fmt chunk
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // audio format (1 = PCM)
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE((SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8, 28); // byte rate
  header.writeUInt16LE((CHANNELS * BITS_PER_SAMPLE) / 8, 32); // block align
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);

  // data chunk
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

async function generateResponse(transcribedText) {
  console.log(`🤖 Generating response to: "${transcribedText}"`);

  try {
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: transcribedText,
      input: [
        {
          role: "developer",
          content: "Respond to user speech in the voice of a HAM radio operator. One short spoken phrase response only.",
        },
        {
          role: "user",
          content: [{ type: "input_text", text: transcribedText }],
        },
      ],
      reasoning: { effort: "minimal" },
      text: { verbosity: "low" },
    });

    // Extract the text from the response
    const responseText = response.output.find((item) => item.type === "message").content?.find((item) => item.type === "output_text")?.text;
    return responseText;
  } catch (error) {
    console.error("❌ Response generation error:", error.message);
    return null;
  }
}

async function playTranscriptionAudio(text) {
  console.log(`🔊 Playing TTS for: "${text}"`);

  try {
    const response = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "ash",
      input: text,
      instructions: "Low coarse seasoned veteran from war time, military ratio operator voice with no emotion. Speak fast with urgency.",
      response_format: "wav",
    });

    // Convert the response to a buffer
    const buffer = Buffer.from(await response.arrayBuffer());

    // Use ffplay to play the audio (simpler than ffmpeg for playback)
    const ffplay = spawn("ffplay", [
      "-nodisp", // No display window
      "-autoexit", // Exit when done
      "-loglevel",
      "quiet", // Suppress ffplay output
      "-i",
      "pipe:0", // Read from stdin
    ]);

    ffplay.on("error", (err) => {
      console.error("❌ ffplay error:", err.message);
    });

    ffplay.on("close", (code) => {
      if (code === 0) {
        console.log("✓ TTS playback completed");
      } else {
        console.error(`❌ ffplay exited with code ${code}`);
      }
    });

    // Write the audio buffer to ffplay
    ffplay.stdin.write(buffer);
    ffplay.stdin.end();
  } catch (error) {
    console.error("❌ TTS error:", error.message);
  }
}

function transitionToSpeaking() {
  if (currentState !== STATE.SPEAKING) {
    console.log("🎤 Speaking...");
    currentState = STATE.SPEAKING;
    audioBuffer = [];
  }
}

async function transitionToSilent() {
  if (currentState !== STATE.SILENT) {
    console.log("📤 Sent");
    currentState = STATE.SILENT;

    // Transcribe the accumulated audio
    if (audioBuffer.length > 0 && !isTranscribing) {
      const audioData = Buffer.concat(audioBuffer);
      audioBuffer = [];
      await transcribeAudio(audioData);
    }
  }
}

function checkForSilence() {
  if (currentState === STATE.SPEAKING && lastPacketTime) {
    const timeSinceLastPacket = Date.now() - lastPacketTime;
    if (timeSinceLastPacket > SILENCE_TIMEOUT) {
      transitionToSilent();
    }
  }
}

async function transcribeAudio(audioData) {
  if (!OPENAI_API_KEY) {
    console.error("⚠️  OPENAI_API_KEY not set. Skipping transcription.");
    return;
  }

  if (audioData.length === 0) {
    console.log("⚠️  No audio data to transcribe");
    return;
  }

  isTranscribing = true;
  console.log(`🔄 Transcribing ${(audioData.length / 1024).toFixed(2)} KB of audio...`);

  try {
    // Convert PCM to WAV
    const wavData = await createWavFromPCM(audioData);

    // Build multipart/form-data with boundary (similar to web implementation)
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
    const CRLF = "\r\n";

    // Build the multipart form data manually
    const preamble =
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="model"${CRLF}${CRLF}` +
      `whisper-1${CRLF}` +
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="language"${CRLF}${CRLF}` +
      `en${CRLF}` +
      `--${boundary}${CRLF}` +
      `Content-Disposition: form-data; name="file"; filename="audio.wav"${CRLF}` +
      `Content-Type: audio/wav${CRLF}${CRLF}`;

    const epilogue = `${CRLF}--${boundary}--${CRLF}`;

    // Create a ReadableStream from the data
    const { Readable } = require("stream");
    const bodyStream = Readable.from(
      (async function* () {
        yield Buffer.from(preamble, "utf-8");
        yield wavData;
        yield Buffer.from(epilogue, "utf-8");
      })()
    );

    // Make request using fetch
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: bodyStream,
      duplex: "half",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    console.log(`\n📝 Transcription: "${result.text}"\n`);

    // Generate a response to the transcription
    const responseText = await generateResponse(result.text);

    // Play the response as synthesized audio
    if (responseText) {
      await playTranscriptionAudio(responseText);
    }
  } catch (error) {
    console.error("❌ Transcription error:", error.message);
  } finally {
    isTranscribing = false;
  }
}

// Handle incoming UDP packets
server.on("message", (msg, rinfo) => {
  // Transition to speaking state on first packet
  transitionToSpeaking();

  // Update last packet time
  lastPacketTime = Date.now();

  // Add to transcription buffer (but don't play raw audio)
  audioBuffer.push(Buffer.from(msg));

  // Update statistics
  packetsReceived++;
  bytesReceived += msg.length;

  // Log statistics every 5 seconds
  const now = Date.now();
  if (now - lastStatsTime > 5000) {
    const elapsed = (now - lastStatsTime) / 1000;
    const packetsPerSec = (packetsReceived / elapsed).toFixed(1);
    const kbytesPerSec = (bytesReceived / elapsed / 1024).toFixed(2);
    const bufferSize = (audioBuffer.reduce((sum, buf) => sum + buf.length, 0) / 1024).toFixed(2);

    console.log(`📊 Stats: ${packetsPerSec} packets/s, ${kbytesPerSec} KB/s, buffer: ${bufferSize} KB`);

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
  console.log("ESP32 Audio UDP Receiver with Transcription");
  console.log("==============================================");
  console.log(`UDP Server listening on port ${address.port}`);
  console.log(`Sample Rate: ${SAMPLE_RATE} Hz`);
  console.log(`Channels: ${CHANNELS} (mono)`);
  console.log(`Bits per sample: ${BITS_PER_SAMPLE}`);
  console.log(`Silence timeout: ${SILENCE_TIMEOUT}ms`);
  console.log(`OpenAI API Key: ${OPENAI_API_KEY ? "✓ Set" : "✗ Not set"}`);
  console.log("\nListening on:");
  console.log(`  Local:   ${address.address}:${address.port}`);
  addresses.forEach((addr) => {
    console.log(`  Network: ${addr}:${address.port}`);
  });
  console.log("\nWaiting for ESP32 to send audio...");
  console.log("==============================================\n");

  // Start silence checker
  silenceCheckInterval = setInterval(checkForSilence, 100);
});

// Start UDP server
server.bind(UDP_PORT);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\nShutting down...");

  if (silenceCheckInterval) {
    clearInterval(silenceCheckInterval);
  }

  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
