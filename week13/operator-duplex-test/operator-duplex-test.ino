#include "AudioTools.h"
#include "AudioTools/Communication/UDPStream.h"

// WiFi credentials
const char *ssid = "MLDEV";
const char *password = "";

// Pin definitions
#define I2S_BCLK D0
#define I2S_LRC  D2
#define I2S_DOUT D1   // Microphone data out
#define I2S_DIN  D10  // Speaker data in

// Button pins for push-to-talk
const int BTN_PTT1 = D8;
const int BTN_PTT2 = D9;
const int DEBOUNCE_THRESHOLD = 5;

int debounceCounter = 0;
bool shouldSend = false;
bool isTransmitting = false;
bool lastTransmitState = false;

// Audio config
const int frequency = 440;
const int sampleRate = 24000;
AudioInfo info(sampleRate, 1, 16);

// Microphone input -> UDP streaming
I2SStream micStream;
UDPStream udp(ssid, password);
IPAddress udpAddress(192, 168, 41, 135);
const int udpPort = 8888;
StreamCopy micToUdpCopier(udp, micStream);

// Sine wave -> Speaker output
SineWaveGenerator<int16_t> sineWave(4000);
GeneratedSoundStream<int16_t> sound(sineWave);
I2SStream speakerStream;
StreamCopy soundToSpeakerCopier(speakerStream, sound);

void setup() {
  Serial.begin(115200);
  delay(100);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Warning);

  pinMode(BTN_PTT1, INPUT_PULLUP);
  pinMode(BTN_PTT2, INPUT_PULLUP);

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

  // Setup microphone input (I2S RX)
  Serial.println("Starting I2S microphone...");
  auto micCfg = micStream.defaultConfig(RX_MODE);
  micCfg.copyFrom(info);
  micCfg.pin_bck = I2S_BCLK;
  micCfg.pin_data = I2S_DOUT;
  micCfg.pin_ws = I2S_LRC;
  micCfg.i2s_format = I2S_STD_FORMAT;

  if (!micStream.begin(micCfg)) {
    Serial.println("Failed to initialize I2S microphone");
    return;
  }
  Serial.println("I2S microphone initialized");

  // Setup speaker output (I2S TX)
  Serial.println("Starting I2S speaker...");
  auto speakerCfg = speakerStream.defaultConfig(TX_MODE);
  speakerCfg.copyFrom(info);
  speakerCfg.pin_bck = I2S_BCLK;
  speakerCfg.pin_ws = I2S_LRC;
  speakerCfg.pin_data = I2S_DIN;

  if (!speakerStream.begin(speakerCfg)) {
    Serial.println("Failed to initialize I2S speaker");
    return;
  }
  Serial.println("I2S speaker initialized");

  // Setup UDP streaming
  udp.begin(udpAddress, udpPort);
  Serial.print("Sending mic data to: ");
  Serial.print(udpAddress);
  Serial.print(":");
  Serial.println(udpPort);

  // Setup sine wave generator
  sineWave.begin(info, frequency);
  Serial.println("Sine wave generator started");

  Serial.println("Duplex audio started!");
}

void loop() {
  // Check button state with debouncing
  bool buttonPressed = (digitalRead(BTN_PTT1) == LOW || digitalRead(BTN_PTT2) == LOW);
  
  if (buttonPressed) {
    debounceCounter++;
    if (debounceCounter >= DEBOUNCE_THRESHOLD) {
      isTransmitting = true;
      debounceCounter = DEBOUNCE_THRESHOLD;
    }
  } else {
    debounceCounter--;
    if (debounceCounter <= -DEBOUNCE_THRESHOLD) {
      isTransmitting = false;
      debounceCounter = -DEBOUNCE_THRESHOLD;
    }
  }

  // Log state changes
  if (isTransmitting != lastTransmitState) {
    if (isTransmitting) {
      Serial.println("Transmitting...");
    } else {
      Serial.println("Playing tone...");
    }
    lastTransmitState = isTransmitting;
  }


   if (shouldSend && isTransmitting) {
    micToUdpCopier.copy();
   } else if (!shouldSend && !isTransmitting) {
    soundToSpeakerCopier.copy();
   }

   shouldSend = !shouldSend;
}
