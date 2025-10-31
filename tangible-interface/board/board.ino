#include "AudioTools.h"
#include "AudioTools/Communication/UDPStream.h"

// TODO: customize the following for your local WIFI
const char *WIFI_SSID = "";
const char *WIFI_PASSWORD = "";

// TODO : customize the following for you pinout
const int I2S_BCLK = D0;
const int I2S_SPEAKER_DATA = D10;
const int I2S_LRC = D2;

const int SAMPLE_RATE = 22050;
const int CHANNELS = 1;
const int BITS_PER_SAMPLE = 16;
const int UDP_RECEIVE_PORT = 8888;

AudioInfo audioInfo(SAMPLE_RATE, CHANNELS, BITS_PER_SAMPLE);

I2SStream i2sSpeaker;
UDPStream udpReceive(WIFI_SSID, WIFI_PASSWORD);
StreamCopy receiveCopier(i2sSpeaker, udpReceive, 1024);

void setup() {
  Serial.begin(115200);
  delay(1000);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Warning);

  Serial.println("\nConnecting to WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

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

  Serial.println("Starting I2S speaker...");
  auto speakerConfig = i2sSpeaker.defaultConfig(TX_MODE);
  speakerConfig.copyFrom(audioInfo);
  speakerConfig.pin_bck = I2S_BCLK;
  speakerConfig.pin_data = I2S_SPEAKER_DATA;
  speakerConfig.pin_ws = I2S_LRC;
  speakerConfig.i2s_format = I2S_STD_FORMAT;

  if (!i2sSpeaker.begin(speakerConfig)) {
    Serial.println("Failed to initialize I2S speaker");
    return;
  }

  Serial.println("I2S speaker initialized successfully");

  Serial.println("Starting UDP receive...");
  udpReceive.begin(UDP_RECEIVE_PORT);

  Serial.println("Audio player ready!");
  Serial.print("Listening on port: ");
  Serial.println(UDP_RECEIVE_PORT);
}

void loop() {
  receiveCopier.copy();
}