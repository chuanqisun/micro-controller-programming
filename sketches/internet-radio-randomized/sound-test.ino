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

const int sampleRate = 8000;  // sample rate in Hz

i2s_data_bit_width_t bps = I2S_DATA_BIT_WIDTH_16BIT;
i2s_mode_t mode = I2S_MODE_STD;
i2s_slot_mode_t slot = I2S_SLOT_MODE_STEREO;


I2SClass i2sInstance;

const char *urls[] = {
  "http://stream.srg-ssr.ch/m/rsj/mp3_128",
  "http://stream.srg-ssr.ch/m/drs3/mp3_128",
  "http://stream.srg-ssr.ch/m/rr/mp3_128",
  "http://streaming.swisstxt.ch/m/drsvirus/mp3_128"
};
const char *wifi = "MLDEV";
const char *password = "{{replace with real password}}";


URLStream urlStream(wifi, password);
AudioSourceURL source(urlStream, urls, "audio/mp3");
I2SStream i2s;
MP3DecoderHelix decoder;
AudioPlayer player(source, i2s, decoder);

void setup() {
  Serial.begin(115200);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Info);

  // Setup square wave I2S first
  i2sInstance.setPins(I2S_BCLK, I2S_LRC, I2S_DIN);

  // start I2S at the sample rate with 16-bits per sample
  if (!i2sInstance.begin(mode, sampleRate, bps, slot)) {
    Serial.println("Failed to initialize I2S for square wave!");
    while (1);  // do nothing
  }
  // Stop the ESP_I2S
  i2sInstance.end();

  // Start AudioTools I2S for internet radio
  auto cfg = i2s.defaultConfig(TX_MODE);
  i2s.begin(cfg);
  
  // Setup player
  player.begin();


  // randomly call player.next(); 0 to k times, where k is the number of available streams - 1
  int numStreams = sizeof(urls) / sizeof(urls[0]);
  if (numStreams > 0) {
    // Seed RNG with an analog read (or millis() as fallback)
    unsigned long seed = 0;
  #ifdef ARDUINO_ARCH_ESP8266
    seed = analogRead(A0);
  #else
    seed = millis();
  #endif
    randomSeed(seed);

    // Choose 0..(numStreams-1) times to advance
    int times = random(0, numStreams);
    for (int i = 0; i < times; ++i) {
      player.next();
    }
  }
    
}



void loop() {
    // Internet radio streaming
    player.copy();
}