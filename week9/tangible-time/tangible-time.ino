#include <RotaryEncoder.h>
#include "AudioTools.h"

/**
 * Pinout:
 * D0 - I2S BCLK
 * D2 - I2S LRC
 * D10 - I2S DIN (to speaker)
 * D6 - Encoder A
 * D7 - Encoder B
 */

#define I2S_BCLK D0
#define I2S_LRC  D2
#define I2S_DIN  D10

#define PIN_ENCODER_A D6
#define PIN_ENCODER_B D7

const int sampleRate = 22000; // sample rate in Hz
const int frequency = 440;    // 440 Hz note
const int amplitude = 16000;  // amplitude

bool soundOn = false;

AudioInfo info(sampleRate, 1, 16);
SineWaveGenerator<int16_t> sineWave(amplitude);
GeneratedSoundStream<int16_t> sound(sineWave);
I2SStream out;
StreamCopy copier(out, sound);

RotaryEncoder encoder(PIN_ENCODER_A, PIN_ENCODER_B);

void checkPosition() {
  encoder.tick(); // Call tick() to check the state
}

void setup() {
  Serial.begin(115200);
  Serial.println("Rotary Encoder Sound Toggle");

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
  sineWave.begin(info, frequency);
  Serial.println("Sine wave initialized");

  // Attach interrupts for encoder pins
  attachInterrupt(digitalPinToInterrupt(PIN_ENCODER_A), checkPosition, CHANGE);
  attachInterrupt(digitalPinToInterrupt(PIN_ENCODER_B), checkPosition, CHANGE);
  Serial.println("Encoder initialized - turn to toggle sound on/off");
}

void loop() {
  // Read encoder position
  int newPosition = encoder.getPosition();
  static int lastPosition = 0;

  if (newPosition != lastPosition) {
    // Toggle sound on/off when encoder changes
    soundOn = !soundOn;
    
    if (soundOn) {
      sineWave.setAmplitude(amplitude);
      Serial.println("Sound ON");
    } else {
      sineWave.setAmplitude(0);
      Serial.println("Sound OFF");
    }
    
    lastPosition = newPosition;
  }

  // Copy audio data to I2S
  copier.copy();
}
