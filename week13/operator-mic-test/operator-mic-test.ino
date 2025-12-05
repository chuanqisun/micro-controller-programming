#include "AudioTools.h"
#include "AudioTools/Communication/UDPStream.h"


// WiFi credentials
const char *ssid = "MLDEV";
const char *password = "";

AudioInfo info(24000, 1, 16);  // freq, channels, bits per sample
I2SStream i2sStream;           // Access I2S as stream
ConverterFillLeftAndRight<int16_t> filler(LeftIsEmpty); // fill both channels
UDPStream udp(ssid, password);
IPAddress udpAddress(192, 168, 41, 79);  // Broadcast address
const int udpPort = 8888;
StreamCopy copier(udp, i2sStream);  // copies I2S microphone input into UDP

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

  Serial.println("Started streaming...");
  Serial.print("Sending to: ");
  Serial.print(udpAddress);
  Serial.print(":");
  Serial.println(udpPort);
}

void loop() {
  copier.copy();
}