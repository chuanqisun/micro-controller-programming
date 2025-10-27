const dgram = require("dgram");
const { spawn } = require("child_process");
const OpenAI = require("openai");

const SAMPLE_RATE = 22000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const UDP_PORT = 8888;
const SILENCE_TIMEOUT_MS = 1000;
const STATS_INTERVAL_MS = 5000;
const SILENCE_CHECK_INTERVAL_MS = 100;

const STATE = {
  SILENT: "silent",
  SPEAKING: "speaking",
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const server = dgram.createSocket("udp4");

let currentState = STATE.SILENT;
let audioBuffer = [];
let lastPacketTime = null;
let silenceCheckInterval = null;
let isTranscribing = false;
let packetsReceived = 0;
let bytesReceived = 0;
let lastStatsTime = Date.now();

startServer();

function startServer() {
  server.bind(UDP_PORT);
  server.on("listening", handleServerListening);
  server.on("message", handleIncomingAudioPacket);
  server.on("error", handleServerError);
  process.on("SIGINT", handleGracefulShutdown);
}

function handleServerListening() {
  const address = server.address();
  logServerStartup(address);
  silenceCheckInterval = setInterval(detectSilenceAndTranscribe, SILENCE_CHECK_INTERVAL_MS);
}

function handleIncomingAudioPacket(msg, rinfo) {
  beginSpeakingStateIfNeeded();
  lastPacketTime = Date.now();
  audioBuffer.push(Buffer.from(msg));
  updateStatistics(msg.length);
  logStatisticsIfIntervalElapsed();
}

function handleServerError(err) {
  console.error(`Server error:\n${err.stack}`);
  server.close();
}

function handleGracefulShutdown() {
  console.log("\n\nShutting down...");
  if (silenceCheckInterval) {
    clearInterval(silenceCheckInterval);
  }
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
}

function beginSpeakingStateIfNeeded() {
  if (currentState !== STATE.SPEAKING) {
    console.log("🎤 Speaking...");
    currentState = STATE.SPEAKING;
    audioBuffer = [];
  }
}

function detectSilenceAndTranscribe() {
  if (currentState === STATE.SPEAKING && lastPacketTime) {
    const timeSinceLastPacket = Date.now() - lastPacketTime;
    if (timeSinceLastPacket > SILENCE_TIMEOUT_MS) {
      transitionToSilentAndProcessAudio();
    }
  }
}

async function transitionToSilentAndProcessAudio() {
  if (currentState !== STATE.SILENT) {
    console.log("📤 Sent");
    currentState = STATE.SILENT;

    if (audioBuffer.length > 0 && !isTranscribing) {
      const audioData = Buffer.concat(audioBuffer);
      audioBuffer = [];
      await transcribeAndRespond(audioData);
    }
  }
}

async function transcribeAndRespond(audioData) {
  if (!process.env.OPENAI_API_KEY) {
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
    const transcribedText = await transcribeAudioToText(audioData);
    console.log(`\n📝 Transcription: "${transcribedText}"\n`);

    const responseText = await generateConversationalResponse(transcribedText);
    if (responseText) {
      await speakTextAloud(responseText);
    }
  } catch (error) {
    console.error("❌ Transcription error:", error.message);
  } finally {
    isTranscribing = false;
  }
}

async function transcribeAudioToText(audioData) {
  const wavData = createWavFileFromPCM(audioData);
  const formData = buildMultipartFormData(wavData);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": `multipart/form-data; boundary=${formData.boundary}`,
    },
    body: formData.stream,
    duplex: "half",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const result = await response.json();
  return result.text;
}

async function generateConversationalResponse(transcribedText) {
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

    const responseText = response.output.find((item) => item.type === "message").content?.find((item) => item.type === "output_text")?.text;
    return responseText;
  } catch (error) {
    console.error("❌ Response generation error:", error.message);
    return null;
  }
}

async function speakTextAloud(text) {
  console.log(`🔊 Playing TTS for: "${text}"`);

  try {
    const audioResponse = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "ash",
      input: text,
      instructions: "Low coarse seasoned veteran from war time, military ratio operator voice with no emotion. Speak fast with urgency.",
      response_format: "wav",
    });

    const buffer = Buffer.from(await audioResponse.arrayBuffer());
    await playAudioBufferThroughSpeakers(buffer);
  } catch (error) {
    console.error("❌ TTS error:", error.message);
  }
}

async function playAudioBufferThroughSpeakers(buffer) {
  const ffplay = spawn("ffplay", ["-nodisp", "-autoexit", "-loglevel", "quiet", "-i", "pipe:0"]);

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

  ffplay.stdin.write(buffer);
  ffplay.stdin.end();
}

function updateStatistics(messageLength) {
  packetsReceived++;
  bytesReceived += messageLength;
}

function logStatisticsIfIntervalElapsed() {
  const now = Date.now();
  if (now - lastStatsTime > STATS_INTERVAL_MS) {
    const elapsed = (now - lastStatsTime) / 1000;
    const packetsPerSec = (packetsReceived / elapsed).toFixed(1);
    const kbytesPerSec = (bytesReceived / elapsed / 1024).toFixed(2);
    const bufferSize = (audioBuffer.reduce((sum, buf) => sum + buf.length, 0) / 1024).toFixed(2);

    console.log(`📊 Stats: ${packetsPerSec} packets/s, ${kbytesPerSec} KB/s, buffer: ${bufferSize} KB`);

    packetsReceived = 0;
    bytesReceived = 0;
    lastStatsTime = now;
  }
}

function logServerStartup(address) {
  const networkAddresses = getNetworkAddresses();

  console.log("\n==============================================");
  console.log("ESP32 Audio UDP Receiver with Transcription");
  console.log("==============================================");
  console.log(`UDP Server listening on port ${address.port}`);
  console.log(`Sample Rate: ${SAMPLE_RATE} Hz`);
  console.log(`Channels: ${CHANNELS} (mono)`);
  console.log(`Bits per sample: ${BITS_PER_SAMPLE}`);
  console.log(`Silence timeout: ${SILENCE_TIMEOUT_MS}ms`);
  console.log(`OpenAI API Key: ${process.env.OPENAI_API_KEY ? "✓ Set" : "✗ Not set"}`);
  console.log("\nListening on:");
  console.log(`  Local:   ${address.address}:${address.port}`);
  networkAddresses.forEach((addr) => {
    console.log(`  Network: ${addr}:${address.port}`);
  });
  console.log("\nWaiting for ESP32 to send audio...");
  console.log("==============================================\n");
}

function getNetworkAddresses() {
  const interfaces = require("os").networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  return addresses;
}

function buildMultipartFormData(wavData) {
  const boundary = "----WebKitFormBoundary" + Math.random().toString(36).slice(2);
  const CRLF = "\r\n";

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

  const { Readable } = require("stream");
  const stream = Readable.from(
    (async function* () {
      yield Buffer.from(preamble, "utf-8");
      yield wavData;
      yield Buffer.from(epilogue, "utf-8");
    })()
  );

  return { boundary, stream };
}

function createWavFileFromPCM(pcmData) {
  const dataSize = pcmData.length;
  const fileSize = 44 + dataSize;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize - 8, 4);
  header.write("WAVE", 8);

  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE((SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8, 28);
  header.writeUInt16LE((CHANNELS * BITS_PER_SAMPLE) / 8, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);

  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}
