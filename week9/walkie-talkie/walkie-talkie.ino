/**
 * @file walkie-talkie.ino
 * @brief Receives UDP audio stream and plays it through I2S speaker
 */

#include "AudioTools.h"
#include "AudioTools/Communication/UDPStream.h"

/**
 * Pinout:
 * D0 - I2S BCLK
 * D1 - I2S DOUT (from microphone)
 * D2 - I2S LRC
 * D8 - Push-to-talk button 1
 * D9 - Push-to-talk button 2
 * D10 - I2S DIN (to speaker)
 */

#define I2S_BCLK D0
#define I2S_DOUT D1
#define I2S_LRC  D2
#define I2S_DIN  D10
#define BTN_PTT1 D8
#define BTN_PTT2 D9

// WiFi credentials
const char *ssid = "";
const char *password = "";

// Audio configuration (must match server settings)
const int SAMPLE_RATE = 22000;
const int CHANNELS = 1;
const int BITS_PER_SAMPLE = 16;
const int UDP_PORT = 8888;

AudioInfo info(SAMPLE_RATE, CHANNELS, BITS_PER_SAMPLE);
I2SStream i2s;           // I2S output to speaker
UDPStream udp(ssid, password);
StreamCopy copier(i2s, udp, 1024); // copy UDP stream to I2S

void setup() {
  Serial.begin(115200);
  delay(100);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Warning);

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

  // Start I2S with custom pinout for speaker output
  Serial.println("Starting I2S...");
  auto i2sCfg = i2s.defaultConfig(TX_MODE);
  i2sCfg.copyFrom(info);
  i2sCfg.pin_bck = I2S_BCLK;
  i2sCfg.pin_ws = I2S_LRC;
  i2sCfg.pin_data = I2S_DIN;
  i2sCfg.i2s_format = I2S_STD_FORMAT;

  if (!i2s.begin(i2sCfg)) {
    Serial.println("Failed to initialize I2S");
    return;
  }
  Serial.println("I2S initialized successfully");

  // Start UDP receiver
  Serial.println("Starting UDP receiver...");
  udp.begin(UDP_PORT);
  
  Serial.println("Ready to receive audio on port ");
  Serial.println(UDP_PORT);
  Serial.println("Waiting for audio stream...");
}

void loop() {
  int len = copier.copy();
  if (len > 0) {
    // Audio data received and copied to I2S
  } else {
    // No data available, just wait a bit
    delay(1);
  }
}