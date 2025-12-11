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

// Debounce
const unsigned long DEBOUNCE_MS = 20;
bool lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;
bool micActive = false;

// Audio config
const int frequency = 440;
const int sampleRate = 24000;
AudioInfo info(sampleRate, 1, 16);

// Single I2S stream that we'll reconfigure as RX or TX
I2SStream i2sStream;

// UDP streaming for mic
UDPStream udp(ssid, password);
IPAddress udpAddress(192, 168, 41, 135);
const int udpPort = 8888;

// Sine wave generator for speaker output
SineWaveGenerator<int16_t> sineWave(4000);
GeneratedSoundStream<int16_t> sound(sineWave);

// StreamCopy objects (will be configured after I2S starts)
StreamCopy *micToUdpCopier = nullptr;
StreamCopy *soundToSpeakerCopier = nullptr;

// Helper: begin I2S for microphone (RX)
bool startMic() {
  auto cfg = i2sStream.defaultConfig(RX_MODE);
  cfg.copyFrom(info);
  cfg.pin_bck = I2S_BCLK;
  cfg.pin_data = I2S_DOUT;
  cfg.pin_ws = I2S_LRC;
  cfg.i2s_format = I2S_STD_FORMAT;

  if (!i2sStream.begin(cfg)) {
    Serial.println("Failed to start I2S in RX (mic) mode");
    return false;
  }
  
  // Create copier for mic -> UDP
  if (micToUdpCopier) delete micToUdpCopier;
  micToUdpCopier = new StreamCopy(udp, i2sStream);
  
  Serial.println("I2S started in mic (RX) mode");
  return true;
}

// Helper: begin I2S for speaker (TX)
bool startSpeaker() {
  auto cfg = i2sStream.defaultConfig(TX_MODE);
  cfg.copyFrom(info);
  cfg.pin_bck = I2S_BCLK;
  cfg.pin_ws = I2S_LRC;
  cfg.pin_data = I2S_DIN;
  cfg.i2s_format = I2S_STD_FORMAT;

  if (!i2sStream.begin(cfg)) {
    Serial.println("Failed to start I2S in TX (speaker) mode");
    return false;
  }
  
  // Create copier for sine wave -> speaker
  if (soundToSpeakerCopier) delete soundToSpeakerCopier;
  soundToSpeakerCopier = new StreamCopy(i2sStream, sound);
  
  Serial.println("I2S started in speaker (TX) mode");
  return true;
}

void stopI2S() {
  i2sStream.end();
  delay(10);  // give hardware time to settle
}

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

  // Setup UDP streaming
  udp.begin(udpAddress, udpPort);
  Serial.print("UDP target: ");
  Serial.print(udpAddress);
  Serial.print(":");
  Serial.println(udpPort);

  // Setup sine wave generator
  sineWave.begin(info, frequency);
  Serial.println("Sine wave generator started");

  // Start in speaker mode by default (button not pressed)
  micActive = false;
  if (!startSpeaker()) {
    Serial.println("Speaker start failed - check board/config");
  }

  Serial.println("Audio system ready!");
}

void loop() {
  // Basic button debouncing (polling)
  bool raw = (digitalRead(BTN_PTT1) == LOW || digitalRead(BTN_PTT2) == LOW) ? LOW : HIGH;
  
  if (raw != lastButtonState) {
    lastDebounceTime = millis();
  }
  
  if ((millis() - lastDebounceTime) > DEBOUNCE_MS) {
    // Stable reading
    bool pressed = (raw == LOW);
    
    if (pressed && !micActive) {
      // Button just pressed -> switch to mic
      Serial.println("Button pressed: switching to MIC");
      stopI2S();
      if (startMic()) {
        micActive = true;
      } else {
        // on error, try to recover by restarting speaker
        startSpeaker();
        micActive = false;
      }
    } else if (!pressed && micActive) {
      // Button released -> switch to speaker
      Serial.println("Button released: switching to SPEAKER");
      stopI2S();
      if (startSpeaker()) {
        micActive = false;
      } else {
        // on error, attempt to fall back into mic mode
        if (!startMic()) {
          Serial.println("Error: cannot start mic or speaker");
        }
      }
    }
  }
  lastButtonState = raw;

  // Service active stream
  if (micActive && micToUdpCopier) {
    micToUdpCopier->copy();
  } else if (!micActive && soundToSpeakerCopier) {
    soundToSpeakerCopier->copy();
  }

  delay(1);  // tiny yield
}
