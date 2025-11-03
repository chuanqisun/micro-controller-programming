# Project pinout

- Pinout:
- D0 - I2S BCLK
- D2 - I2S LRC
- D10 - I2S DIN (to speaker)
- D6 - Encoder A
- D7 - Encoder B

# Sound Example

```cpp
#include "AudioTools.h"

/**
 * Pinout:
 * D0 - I2S BCLK
 * D2 - I2S LRC
 * D10 - I2S DIN (to speaker)
 */

#define I2S_BCLK D0
#define I2S_LRC  D2
#define I2S_DIN  D10

const int freqs[] = {220, 440, 660, 880};
const int amps[] = {4000, 8000, 16000, 32000};
int freqIndex = 0;
int ampIndex = 0;
unsigned long lastChange = 0;

const int sampleRate = 22000; // sample rate in Hz

AudioInfo info(sampleRate, 1, 16);
SineWaveGenerator<int16_t> sineWave(32000); // sine wave with max amplitude of 4000
GeneratedSoundStream<int16_t> sound(sineWave); // stream generated from sine wave
I2SStream out;
StreamCopy copier(out, sound); // copies sound into i2s

void setup() {
  Serial.begin(115200);
  Serial.println("I2S Sine Wave Playback");

  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Warning);

  // start I2S with custom pinout
  Serial.println("Starting I2S...");
  auto config = out.defaultConfig(TX_MODE);
  config.copyFrom(info);
  config.pin_bck = I2S_BCLK;
  config.pin_ws = I2S_LRC;
  config.pin_data = I2S_DIN;
  out.begin(config);

  // Setup sine wave
  sineWave.begin(info, freqs[0]);
  Serial.println("Started sine wave playback");
}

void loop() {
  if (millis() - lastChange >= 2000) {
    lastChange = millis();
    freqIndex = (freqIndex + 1) % 4;
    if (freqIndex == 0) {
      ampIndex = (ampIndex + 1) % 4;
    }
    sineWave.setFrequency(freqs[freqIndex]);
    sineWave.setAmplitude(amps[ampIndex]);
  }
  copier.copy();
}
```

# Encoder Example

```cpp
#include <RotaryEncoder.h> // You may need to install this library

// Define the pins connected to the encoder
#define PIN_ENCODER_A 2
#define PIN_ENCODER_B 3
#define PIN_ENCODER_SWITCH 4 // If your encoder has a push button

RotaryEncoder encoder(PIN_ENCODER_A, PIN_ENCODER_B);

void checkPosition() {
  encoder.tick(); // Call tick() to check the state
}

void setup() {
  Serial.begin(115200);
  Serial.println("Rotary Encoder Example");

  // Attach interrupts for encoder pins
  attachInterrupt(digitalPinToInterrupt(PIN_ENCODER_A), checkPosition, CHANGE);
  attachInterrupt(digitalPinToInterrupt(PIN_ENCODER_B), checkPosition, CHANGE);

  // Setup encoder switch if present
  pinMode(PIN_ENCODER_SWITCH, INPUT_PULLUP); // Use INPUT_PULLUP if switch connects to ground
}

void loop() {
  // Read encoder position
  int newPosition = encoder.getPosition();
  static int lastPosition = 0;

  if (newPosition != lastPosition) {
    Serial.print("Encoder Position: ");
    Serial.println(newPosition);
    lastPosition = newPosition;
  }

  // Read encoder switch state
  static bool lastButtonState = HIGH; // Assuming INPUT_PULLUP
  bool currentButtonState = digitalRead(PIN_ENCODER_SWITCH);

  if (currentButtonState == LOW && lastButtonState == HIGH) {
    Serial.println("Button Pressed!");
  }
  lastButtonState = currentButtonState;

  delay(10); // Debounce or prevent overwhelming serial
}
```
