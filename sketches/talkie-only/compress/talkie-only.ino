
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

// Debounce settings
const int DEBOUNCE_THRESHOLD = 5;
int buttonCounter = 0;
bool buttonState = HIGH;
bool lastButtonState = HIGH;

AudioInfo info(24000, 1, 16);  // 24kHz, mono, 16-bit
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
