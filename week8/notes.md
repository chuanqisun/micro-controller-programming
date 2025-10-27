## Basic Clock test

```cpp
// Read digital inputs D3, D4, D5 and I2S microphone on D0 (BCLK), D1 (DOUT), D2 (LRC)
// Uses Arduino Audio Tools library for I2S microphone input

#include "AudioTools.h"

// Digital input pins
const int inputPins[] = { D3, D4, D5 };
const char* inputNames[] = { "D3", "D4", "D5" };
const int numInputs = 3;

// I2S configuration
I2SStream i2s;
StreamCopy copier(i2s, Serial); // Stream audio data to Serial

void setup() {
  Serial.begin(115200);
  delay(50);

  // Configure digital input pins
  for (int i = 0; i < numInputs; ++i) {
    pinMode(inputPins[i], INPUT_PULLUP);
    digitalWrite(inputPins[i], HIGH); // HIGH HIGH HIGH means unplugged
  }

  // Configure I2S input for microphone
  // D0 = BCLK, D1 = DOUT (DIN for mic), D2 = LRC (WS)
  auto config = i2s.defaultConfig(RX_MODE);
  config.pin_bck = D0;   // Bit Clock (BCLK)
  config.pin_data = D1;  // Data Out (DOUT from mic perspective, DIN for us)
  config.pin_ws = D2;    // Word Select / Left-Right Clock (LRC)
  config.sample_rate = 16000;  // 16kHz sample rate
  config.bits_per_sample = 16;
  config.channels = 1;         // Mono microphone
  config.i2s_format = I2S_STD_FORMAT;

  i2s.begin(config);

  Serial.println("Input monitor with I2S microphone started");
  Serial.println("I2S Config: D0=BCLK, D1=DOUT, D2=LRC, 16kHz, 16-bit, Mono");
}

void loop() {
  // Read and report digital inputs
  for (int i = 0; i < numInputs; ++i) {
    int v = digitalRead(inputPins[i]);
    Serial.print(inputNames[i]);
    Serial.print(": ");
    if (v == HIGH) {
      Serial.println("HIGH");
    } else {
      Serial.println("LOW");
    }
  }
  Serial.println(); // blank line between samples

  // Process I2S audio stream
  // This will continuously read from the I2S microphone
  copier.copy();

  delay(50);
}
```

## Visualize PDM

```cpp
// Simple I2S microphone CSV output
// Custom pinout: D0 = BCLK, D1 = DOUT, D2 = LRC

#include "AudioTools.h"

AudioInfo info(16000, 1, 16);  // 16kHz, mono, 16-bit
I2SStream i2sStream;
CsvOutput<int16_t> csvOutput(Serial);
StreamCopy copier(csvOutput, i2sStream);

void setup() {
  Serial.begin(115200);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Info);

  // Configure I2S for custom pinout
  auto cfg = i2sStream.defaultConfig(RX_MODE);
  cfg.copyFrom(info);
  cfg.pin_bck = D0;   // BCLK
  cfg.pin_data = D1;  // DOUT
  cfg.pin_ws = D2;    // LRC
  cfg.i2s_format = I2S_STD_FORMAT;

  i2sStream.begin(cfg);
  csvOutput.begin(info);
}

void loop() {
  copier.copy();
}
```

## Streaming sine wave over WIFI

```cpp
/**
 * @file streams-generator-server_wav.ino
 *
 *  This sketch generates a test sine wave. The result is provided as WAV stream which can be listened to in a Web Browser
 *
 * @author Phil Schatzmann
 * @copyright GPLv3
 *
 */

#include "AudioTools.h"
#include "AudioTools/Communication/AudioHttp.h"

// WIFI
const char *ssid = "REPLACE_WITH_SSID";
const char *password = "REPLACE_WITH_REAL_PASSWORD";

AudioWAVServer server(ssid, password);

// Sound Generation
const int sample_rate = 10000;
const int channels = 1;

SineWaveGenerator<int16_t> sineWave;            // Subclass of SoundGenerator with max amplitude of 32000
GeneratedSoundStream<int16_t> in(sineWave);     // Stream generated from sine wave


void setup() {
  Serial.begin(115200);
  AudioLogger::instance().begin(Serial,AudioLogger::Info);

  // start server
  server.begin(in, sample_rate, channels);

  // start generation of sound
  sineWave.begin(channels, sample_rate, N_B4);
  in.begin();

  Serial.print("Will sleep");
  // sleep for 5 seconds first
  delay(5000);

  Serial.print("Server URL: http://");
  Serial.print(WiFi.localIP());
}


// copy the data
void loop() {
  server.copy();
}
```

## Streaming Microphone over WIFI

Observation:

- The latency is inconsistent, from 1 second to 5 seconds
- The sound quality is also inconsistent, sometimes good, sometimes poor

```cpp
/**
 * I2S Microphone to WiFi WAV Stream
 *
 * Streams audio from I2S microphone over HTTP as WAV
 * Custom pinout: D0 = BCLK, D1 = DOUT, D2 = LRC
 */

#include "AudioTools.h"
#include "AudioTools/Communication/AudioHttp.h"

// WiFi credentials
const char *ssid = "REPLACE_WITH_SSID";
const char *password = "REPLACE_WITH_PASSWORD";

// I2S and Audio
AudioInfo info(32000, 1, 16);  // 32kHz, mono, 16-bit
I2SStream i2sStream;           // Access I2S as stream
ConverterFillLeftAndRight<int16_t> filler(LeftIsEmpty); // fill both channels
AudioWAVServer server(ssid, password);

void setup() {
  Serial.begin(115200);
  delay(100);
  AudioLogger::instance().begin(Serial, AudioLogger::Info);

  // Connect to WiFi
  Serial.println("\nConnecting to WiFi...");
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nFailed to connect to WiFi");
    return;
  }

  Serial.println("\nWiFi connected!");
  Serial.print("Device IP: ");
  Serial.println(WiFi.localIP());

  // Configure I2S with custom pinout
  Serial.println("Starting I2S...");
  auto cfg = i2sStream.defaultConfig(RX_MODE);
  cfg.copyFrom(info);
  cfg.pin_bck = D0;   // BCLK
  cfg.pin_data = D1;  // DOUT
  cfg.pin_ws = D2;    // LRC
  cfg.i2s_format = I2S_STD_FORMAT;

  if (!i2sStream.begin(cfg)) {
    Serial.println("Failed to initialize I2S");
    return;
  }
  Serial.println("I2S initialized successfully");

  // Start WAV server
  Serial.println("Starting WAV server...");
  server.begin(i2sStream, info, &filler);
  Serial.print("Server URL: http://");
  Serial.print(WiFi.localIP());
}

void loop() {
  server.copy();
}
```

## Testing MP3 encoder

```cpp
/**
 * I2S Microphone to WiFi MP3 Stream
 *
 * Streams audio from I2S microphone over HTTP as MP3
 * Custom pinout: D0 = BCLK, D1 = DOUT, D2 = LRC
 */

#include "AudioTools.h"
#include "AudioTools/AudioCodecs/CodecMP3LAME.h"
#include "AudioTools/Communication/AudioHttp.h"

// WiFi credentials
const char *ssid = "REPLACE_WITH_SSID";
const char *password = "REPLACE_WITH_REAL_PASSWORD";

// I2S and Audio
AudioInfo info(16000, 1, 16);  // 16kHz, mono, 16-bit
I2SStream i2sStream;           // Access I2S as stream
MP3EncoderLAME mp3;
AudioEncoderServer server(&mp3, ssid, password);

void setup() {
  Serial.begin(115200);
  delay(100);
  AudioLogger::instance().begin(Serial, AudioLogger::Info);

  // Connect to WiFi
  Serial.println("\nConnecting to WiFi...");
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nFailed to connect to WiFi");
    return;
  }

  Serial.println("\nWiFi connected!");
  Serial.print("Device IP: ");
  Serial.println(WiFi.localIP());

  // Configure I2S with custom pinout
  Serial.println("Starting I2S...");
  auto cfg = i2sStream.defaultConfig(RX_MODE);
  cfg.copyFrom(info);
  cfg.pin_bck = D0;   // BCLK
  cfg.pin_data = D1;  // DOUT
  cfg.pin_ws = D2;    // LRC
  cfg.i2s_format = I2S_STD_FORMAT;

  if (!i2sStream.begin(cfg)) {
    Serial.println("Failed to initialize I2S");
    return;
  }
  Serial.println("I2S initialized successfully");

  // Start MP3 server
  Serial.println("Starting MP3 server...");
  server.begin(i2sStream, info);
  Serial.print("Server URL: http://");
  Serial.print(WiFi.localIP());
}

void loop() {
  server.doLoop();
}
```

Memory allocation error:

```txt
[Error] lame.c : 2792 - calloc(1,85840) -> 0x0
available MALLOC_CAP_8BIT: 114676 / MALLOC_CAP_32BIT: 114676  / MALLOC_CAP_SPIRAM: 0
```

I learned that mp3 encoding is quite memory intensive. Since I need to reserve memory for audio playback, I should probably avoid encoding mp3 using the main processor on ESP32

## Sine wave over UDP

Server

```cpp

#include "AudioTools.h"
#include "AudioTools/Communication/UDPStream.h"


// WiFi credentials
const char *ssid = "REPLACE_WITH_SSID";
const char *password = "REPLACE_WITH_REAL_PASSWORD";

AudioInfo info(22000, 1, 16);
SineWaveGenerator<int16_t> sineWave(32000);  // subclass of SoundGenerator with max amplitude of 32000
GeneratedSoundStream<int16_t> sound(sineWave);  // Stream generated from sine wave
UDPStream udp(ssid, password);
Throttle throttle(udp);
IPAddress udpAddress(192, 168, 41, 106);  // Broadcast address
const int udpPort = 8888;
StreamCopy copier(throttle, sound);  // copies sound into UDP

void setup() {
  Serial.begin(115200);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Info);

  // Setup sine wave
  sineWave.begin(info, N_B4);

  // Define udp address and port
  udp.begin(udpAddress, udpPort);

  // Define Throttle
  auto cfg = throttle.defaultConfig();
  cfg.copyFrom(info);
  //cfg.correction_ms = 0;
  throttle.begin(cfg);

  Serial.println("started...");
  Serial.print("Device IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Sending to: ");
  Serial.print(udpAddress);
  Serial.print(":");
  Serial.println(udpPort);
}

void loop() {
  copier.copy();
}
```

Client

```js
const dgram = require("dgram");
const { spawn } = require("child_process");

// Audio configuration (must match Arduino settings)
const SAMPLE_RATE = 22000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

// UDP configuration
const UDP_PORT = 8888;

// Create UDP socket
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
```

## UDP low latency streaming

Server

```cpp

/**
 * @file talkie-only.ino
 * @brief Sending audio over UDP using I2S microphone
 * Following the UDP example pattern from AudioTools
 */

#include "AudioTools.h"
#include "AudioTools/Communication/UDPStream.h"


// WiFi credentials
const char *ssid = "REPLACE_WITH_SSID";
const char *password = "REPLACE_WITH_REAL_PASSWORD";

AudioInfo info(22000, 1, 16);  // 32kHz, mono, 16-bit
I2SStream i2sStream;           // Access I2S as stream
ConverterFillLeftAndRight<int16_t> filler(LeftIsEmpty); // fill both channels
UDPStream udp(ssid, password);
Throttle throttle(udp);
IPAddress udpAddress(192, 168, 41, 106);  // Broadcast address
const int udpPort = 8888;
StreamCopy copier(throttle, i2sStream);  // copies I2S microphone input into UDP

void setup() {
  Serial.begin(115200);
  delay(100);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Info);

  // Connect to WiFi
  Serial.println("\nConnecting to WiFi...");
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nFailed to connect to WiFi");
    return;
  }

  Serial.println("\nWiFi connected!");
  Serial.print("Device IP: ");
  Serial.println(WiFi.localIP());

  // Configure I2S with custom pinout
  Serial.println("Starting I2S...");
  auto i2sCfg = i2sStream.defaultConfig(RX_MODE);
  i2sCfg.copyFrom(info);
  i2sCfg.pin_bck = D0;   // BCLK
  i2sCfg.pin_data = D1;  // DOUT
  i2sCfg.pin_ws = D2;    // LRC
  i2sCfg.i2s_format = I2S_STD_FORMAT;

  if (!i2sStream.begin(i2sCfg)) {
    Serial.println("Failed to initialize I2S");
    return;
  }
  Serial.println("I2S initialized successfully");

  // Define udp address and port
  udp.begin(udpAddress, udpPort);

  // Define Throttle
  auto throttleCfg = throttle.defaultConfig();
  throttleCfg.copyFrom(info);
  //throttleCfg.correction_ms = 0;
  throttle.begin(throttleCfg);

  Serial.println("Started streaming...");
  Serial.print("Sending to: ");
  Serial.print(udpAddress);
  Serial.print(":");
  Serial.println(udpPort);
}

void loop() {
  copier.copy();
}

```

Client

```js
const dgram = require("dgram");
const { spawn } = require("child_process");

// Audio configuration (must match Arduino settings)
const SAMPLE_RATE = 22000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

// UDP configuration
const UDP_PORT = 8888;

// Create UDP socket
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
```

## UDP packets streaming into Open AI transcription

In this version, ffmpeg playback is for debugging only.
I verified that open ai is able to respond with the transcribed text.

The key design is to use a multi-part form data so as to stream audio chunks as soon as they are available.

We don't have a way to delimit the audio stream. I used an arbitrary 5 seconds interval to send chunks.

```js
const dgram = require("dgram");
const { spawn } = require("child_process");

// Audio configuration (must match Arduino settings)
const SAMPLE_RATE = 22000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

// UDP configuration
const UDP_PORT = 8888;

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TRANSCRIPTION_INTERVAL = 5000; // Send chunks every 5 seconds

// Create UDP socket
const server = dgram.createSocket("udp4");

// FFmpeg process to play audio
let ffmpegPlayer = null;

// Transcription state
let audioBuffer = [];
let lastTranscriptionTime = Date.now();
let isTranscribing = false;

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

async function transcribeAudio(audioData) {
  if (!OPENAI_API_KEY) {
    console.error("⚠️  OPENAI_API_KEY not set. Skipping transcription.");
    return;
  }

  if (audioData.length === 0) {
    console.log("⚠️  No audio data to transcribe");
    return;
  }

  console.log(`🎤 Transcribing ${(audioData.length / 1024).toFixed(2)} KB of audio...`);

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
  } catch (error) {
    console.error("❌ Transcription error:", error.message);
  }
}

async function processTranscriptionQueue() {
  if (isTranscribing || audioBuffer.length === 0) {
    return;
  }

  const now = Date.now();
  if (now - lastTranscriptionTime < TRANSCRIPTION_INTERVAL) {
    return;
  }

  isTranscribing = true;
  lastTranscriptionTime = now;

  // Get accumulated audio data
  const audioData = Buffer.concat(audioBuffer);
  audioBuffer = [];

  // Transcribe in background
  transcribeAudio(audioData).finally(() => {
    isTranscribing = false;
  });
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

  // Add to transcription buffer
  audioBuffer.push(Buffer.from(msg));

  // Update statistics
  packetsReceived++;
  bytesReceived += msg.length;

  // Check if it's time to transcribe
  processTranscriptionQueue();

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
  console.log(`Transcription interval: ${TRANSCRIPTION_INTERVAL / 1000}s`);
  console.log(`OpenAI API Key: ${OPENAI_API_KEY ? "✓ Set" : "✗ Not set"}`);
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
```

## Streaming transcription with user controlled "end of speech" delimiter

- I will use the one of the buttons on my Operator Board to signal the beginning and ending of speech.
- When button is pressed: start recording audio.
- When button is released: stop recording and send the audio for transcription.

client: adding hold-to-speak button

```cpp

/**
 * @file talkie-only.ino
 * @brief Sending audio over UDP using I2S microphone
 * Following the UDP example pattern from AudioTools
 */

#include "AudioTools.h"
#include "AudioTools/Communication/UDPStream.h"


// WiFi credentials
const char *ssid = "REPLACE_WITH_SSID";
const char *password = "REPLACE_WITH_REAL_PASSWORD";

// Debounce settings
const int DEBOUNCE_THRESHOLD = 5;
int buttonCounter = 0;
bool buttonState = HIGH;
bool lastButtonState = HIGH;

AudioInfo info(22000, 1, 16);  // 22kHz, mono, 16-bit
I2SStream i2sStream;           // Access I2S as stream
ConverterFillLeftAndRight<int16_t> filler(LeftIsEmpty); // fill both channels
UDPStream udp(ssid, password);
Throttle throttle(udp);
IPAddress udpAddress(192, 168, 41, 106);  // Broadcast address
const int udpPort = 8888;
StreamCopy copier(throttle, i2sStream);  // copies I2S microphone input into UDP

void setup() {
  Serial.begin(115200);
  delay(100);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Warning);

  // Configure D8 and D9 as input with pull-up resistors
  pinMode(D8, INPUT_PULLUP);
  pinMode(D9, INPUT_PULLUP);

  // Connect to WiFi
  Serial.println("\nConnecting to WiFi...");
  WiFi.begin(ssid, password);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nFailed to connect to WiFi");
    return;
  }

  Serial.println("\nWiFi connected!");
  Serial.print("Device IP: ");
  Serial.println(WiFi.localIP());

  // Configure I2S with custom pinout
  Serial.println("Starting I2S...");
  auto i2sCfg = i2sStream.defaultConfig(RX_MODE);
  i2sCfg.copyFrom(info);
  i2sCfg.pin_bck = D0;   // BCLK
  i2sCfg.pin_data = D1;  // DOUT
  i2sCfg.pin_ws = D2;    // LRC
  i2sCfg.i2s_format = I2S_STD_FORMAT;

  if (!i2sStream.begin(i2sCfg)) {
    Serial.println("Failed to initialize I2S");
    return;
  }
  Serial.println("I2S initialized successfully");

  // Define udp address and port
  udp.begin(udpAddress, udpPort);

  // Define Throttle
  auto throttleCfg = throttle.defaultConfig();
  throttleCfg.copyFrom(info);
  //throttleCfg.correction_ms = 0;
  throttle.begin(throttleCfg);

  Serial.println("Started streaming...");
  Serial.print("Sending to: ");
  Serial.print(udpAddress);
  Serial.print(":");
  Serial.println(udpPort);
}

void loop() {
  // Read combined button state (LOW if either button is pressed)
  int buttonReading = (digitalRead(D8) == LOW || digitalRead(D9) == LOW) ? LOW : HIGH;

  // Debounce combined button
  if (buttonReading == LOW) {
    buttonCounter++;
    if (buttonCounter >= DEBOUNCE_THRESHOLD) {
      buttonState = LOW;
      buttonCounter = DEBOUNCE_THRESHOLD; // Cap the counter
    }
  } else {
    buttonCounter--;
    if (buttonCounter <= -DEBOUNCE_THRESHOLD) {
      buttonState = HIGH;
      buttonCounter = -DEBOUNCE_THRESHOLD; // Cap the counter
    }
  }

  // Log state changes
  if (buttonState != lastButtonState) {
    if (buttonState == LOW) {
      Serial.println("Speaking...");
    } else {
      Serial.println("Sent");
    }
    lastButtonState = buttonState;
  }

  // Transmit audio only if button is pressed
  if (buttonState == LOW) {
    copier.copy();
  }
}
```

server: add state machine.

- start with silent state
- On receiving audio packets, transition to speaking state, stream audio to OpenAI
- On silence, transition to silent state and wrap up streaming

```js
const dgram = require("dgram");
const { spawn } = require("child_process");

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

// FFmpeg process to play audio
let ffmpegPlayer = null;

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
  } catch (error) {
    console.error("❌ Transcription error:", error.message);
  } finally {
    isTranscribing = false;
  }
}

// Handle incoming UDP packets
server.on("message", (msg, rinfo) => {
  if (!ffmpegPlayer) {
    startAudioPlayer();
  }

  // Transition to speaking state on first packet
  transitionToSpeaking();

  // Update last packet time
  lastPacketTime = Date.now();

  // Write audio data to ffmpeg stdin
  if (ffmpegPlayer && !ffmpegPlayer.killed) {
    ffmpegPlayer.stdin.write(msg);
  }

  // Add to transcription buffer
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

  if (ffmpegPlayer && !ffmpegPlayer.killed) {
    ffmpegPlayer.stdin.end();
    ffmpegPlayer.kill("SIGTERM");
  }

  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
```

## AI simulated response

- High latency but working demo for the full input pipeline!

```js
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
```
