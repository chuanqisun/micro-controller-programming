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
const char *ssid = "";
const char *password = "";

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
const char *ssid = "REPLACE";
const char *password = "REPLACE";

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
const char *ssid = "";
const char *password = "";

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
