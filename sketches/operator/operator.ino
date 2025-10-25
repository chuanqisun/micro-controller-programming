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