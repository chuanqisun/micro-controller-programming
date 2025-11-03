#include <RotaryEncoder.h>
#include "AudioTools.h"

// Define the pins connected to the encoder
#define PIN_ENCODER_A D6
#define PIN_ENCODER_B D7

// I2S pins for sound
#define I2S_BCLK D0
#define I2S_LRC  D2
#define I2S_DIN  D10

RotaryEncoder encoder(PIN_ENCODER_A, PIN_ENCODER_B);

const int sampleRate = 22000;
AudioInfo info(sampleRate, 1, 16);
SineWaveGenerator<int16_t> sineWave(16000);
GeneratedSoundStream<int16_t> sound(sineWave);
I2SStream out;
StreamCopy copier(out, sound);
bool playing = false;

int counter = 0;
unsigned long lastChangeTime = 0;
bool isChanging = false;
bool groupStarted = false;

void checkPosition() {
  encoder.tick(); // Call tick() to check the state
}

void setup() {
  Serial.begin(115200);
  Serial.println("Rotary Encoder Example");

  // Attach interrupts for encoder pins
  attachInterrupt(digitalPinToInterrupt(PIN_ENCODER_A), checkPosition, CHANGE);
  attachInterrupt(digitalPinToInterrupt(PIN_ENCODER_B), checkPosition, CHANGE);

  // Setup I2S
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Warning);
  auto config = out.defaultConfig(TX_MODE);
  config.copyFrom(info);
  config.pin_bck = I2S_BCLK;
  config.pin_ws = I2S_LRC;
  config.pin_data = I2S_DIN;
  out.begin(config);
  sineWave.begin(info, 440);
  Serial.println("I2S setup done");
}

void loop() {
  // Read encoder position
  int newPosition = encoder.getPosition();
  static int lastPosition = 0;

  if (newPosition != lastPosition) {
    lastPosition = newPosition;
    lastChangeTime = millis();
    isChanging = true;
    if (!groupStarted) {
      Serial.println("Position change group started");
      playing = true;
      groupStarted = true;
    }
  }

  if (isChanging && (millis() - lastChangeTime > 100)) {
    counter++;
    Serial.print("Position change group ended, Counter: ");
    Serial.println(counter);
    playing = false;
    isChanging = false;
    groupStarted = false;
  }

  if (playing) {
    copier.copy();
  }
}
