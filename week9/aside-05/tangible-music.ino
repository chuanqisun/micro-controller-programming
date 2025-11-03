#include "RotaryEncoder.h"
#include "AudioTools.h"

// Define the pins connected to the encoder
#define PIN_ENCODER_A D6
#define PIN_ENCODER_B D7

// I2S pins for sound
#define I2S_BCLK D0
#define I2S_LRC  D2
#define I2S_DIN  D10

const unsigned long DEBOUNCE_TIME = 100;

float getFreq(char note) {
  switch (note) {
    case 'g': return 392.00 / 2;
    case 'C': return 261.63;
    case 'D': return 293.66;
    case 'E': return 329.63;
    case 'F': return 349.23;
    case 'G': return 392.00;
    default: return 0;
  }
}

// ode to joy
const char odeToJoy[62] = {
  'E','E','F','G','G','F','E','D','C','C','D','E','E','D','D',
  'E','E','F','G','G','F','E','D','C','C','D','E','D','C','C',
  'D','D','E','C','D','E','F','E','C','D','E','F','E','D','C','D','g',
  'E','E','F','G','G','F','E','D','C','C','D','E','D','C','C'
};

// little lamb
const char littleLamb[26] = {
  'E','D','C','D','E','E','E','D','D','D','E','G','G','E','D','C','D','E','E','E','C','D','D','E','D','C'
};

RotaryEncoder encoder(PIN_ENCODER_A, PIN_ENCODER_B);

const int sampleRate = 22000;
AudioInfo info(sampleRate, 1, 16);
SineWaveGenerator<int16_t> sineWave(32000);
GeneratedSoundStream<int16_t> sound(sineWave);
I2SStream out;
StreamCopy copier(out, sound);
bool playing = false;

int currentNote = 0;
int lastDirection = 0;

int counter = 0;
unsigned long lastChangeTime = 0;
bool isChanging = false;

void checkPosition() {
  encoder.tick(); // Call tick() to check the state
}

void setup() {
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
  static int lastPosition = 0;

  if (newPosition != lastPosition) {
    int dir = (newPosition > lastPosition) ? 1 : -1;
    lastPosition = newPosition;
    lastChangeTime = millis();
    
    Serial.print("Encoder Position: ");
    Serial.println(newPosition);
    
    // Check for direction change only after debounce period (when not currently changing)
    if (!isChanging && dir != lastDirection && lastDirection != 0) {
      currentNote = 0;
      lastDirection = dir;
      Serial.print("Direction changed to: ");
      Serial.println(dir);
    }
    
    // Set initial direction if not set
    if (lastDirection == 0) {
      lastDirection = dir;
      Serial.print("Initial direction: ");
      Serial.println(dir);
    }
    
    // Set up the note to play (only when starting a new playing session)
    if (!isChanging) {
      char note;
      if (lastDirection == 1) {
        note = odeToJoy[currentNote % 62];
      } else if (lastDirection == -1) {
        note = littleLamb[currentNote % 26];
      }
      
      float freq = getFreq(note);
      sineWave.setFrequency(freq);
      
      Serial.print("Playing note ");
      Serial.print(currentNote);
      Serial.print(": ");
      Serial.println(note);
      
      Serial.println("Encoder movement started - playing");
      isChanging = true;
      playing = true;
    }
  }

  // Stop playing when encoder hasn't moved for DEBOUNCE_TIME
  if (isChanging && (millis() - lastChangeTime > DEBOUNCE_TIME)) {
    Serial.println("Encoder stopped - silence");
    isChanging = false;
    playing = false;
    currentNote++; // Advance to next note after playing stops
  }

  if (playing) {
    copier.copy();
  }
}
