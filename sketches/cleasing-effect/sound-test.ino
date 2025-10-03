/**
 * @file player-url-i2s.ino
 * @brief see https://github.com/pschatzmann/arduino-audio-tools/blob/main/examples/examples-player/player-url-i2s/README.md
 * 
 * @author Phil Schatzmann
 * @copyright GPLv3
 */

#include <ESP_I2S.h>
#include "AudioTools.h"
#include "AudioTools/AudioCodecs/CodecMP3Helix.h"
#include "AudioTools/Disk/AudioSourceURL.h"
#include "AudioTools/Communication/AudioHttp.h"

// Square wave generation constants
#define I2S_BCLK D7
#define I2S_LRC  D8
#define I2S_DIN  D9

const int frequency = 440;    // frequency of square wave in Hz
const int amplitude = 200;    // amplitude of square wave
const int sampleRate = 8000;  // sample rate in Hz

i2s_data_bit_width_t bps = I2S_DATA_BIT_WIDTH_16BIT;
i2s_mode_t mode = I2S_MODE_STD;
i2s_slot_mode_t slot = I2S_SLOT_MODE_STEREO;

const unsigned int halfWavelength = sampleRate / frequency / 2;  // half wavelength of square wave

int32_t sample = amplitude;  // current sample value
unsigned int count = 0;

I2SClass squareWaveI2s;

// Timing variables
unsigned long startTime;
bool useSquareWave = true;
const unsigned long squareWaveDuration = 10; // 10 seconds in milliseconds


const char *urls[] = {
  "http://stream.srg-ssr.ch/m/rsj/mp3_128",
};
const char *wifi = "MLDEV";
const char *password = "{{ replace with real password }}";

URLStream urlStream(wifi, password);
AudioSourceURL source(urlStream, urls, "audio/mp3");
I2SStream i2s;
MP3DecoderHelix decoder;
AudioPlayer player(source, i2s, decoder);

// additional controls
const int volumePin = A0;
Debouncer nextButtonDebouncer(2000);
const int nextButtonPin = D5;

void setup() {
  Serial.begin(115200);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Info);

  // Record start time
  startTime = millis();

  Serial.println("Starting with 10 seconds of square wave...");

  // Setup square wave I2S first
  squareWaveI2s.setPins(I2S_BCLK, I2S_LRC, I2S_DIN);

  // start I2S at the sample rate with 16-bits per sample
  if (!squareWaveI2s.begin(mode, sampleRate, bps, slot)) {
    Serial.println("Failed to initialize I2S for square wave!");
    while (1);  // do nothing
  }

  // Note: AudioTools I2S setup will happen later when switching from square wave
}



void loop() {
  unsigned long currentTime = millis();
  
  // Check if we should switch from square wave to internet radio
  if (useSquareWave && (currentTime - startTime >= squareWaveDuration)) {
    Serial.println("Switching to internet radio...");
    
    // Stop the ESP_I2S
    squareWaveI2s.end();
    
    // Start AudioTools I2S for internet radio
    auto cfg = i2s.defaultConfig(TX_MODE);
    i2s.begin(cfg);
    
    // Setup player
    player.begin();
    
    useSquareWave = false;
    Serial.println("Internet radio started...");
    return;
  }
  
  if (useSquareWave) {
    // Square wave generation code
    if (count % halfWavelength == 0) {
      // invert the sample every half wavelength count multiple to generate square wave
      sample = -1 * sample;
    }

    // Left channel, the low 8 bits then high 8 bits
    squareWaveI2s.write(sample);
    squareWaveI2s.write(sample >> 8);

    // Right channel, the low 8 bits then high 8 bits
    squareWaveI2s.write(sample);
    squareWaveI2s.write(sample >> 8);

    // increment the counter for the next sample
    count++;
  } else {
    // Internet radio streaming
    player.copy();
  }
}