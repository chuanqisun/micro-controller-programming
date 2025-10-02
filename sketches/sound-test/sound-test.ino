/**
 * @file url_raw-I2S_external_dac.ino
 * @author Phil Schatzmann
 * @brief Streams raw audio from URL to I2S output
 */

#include "WiFi.h"
#include "AudioTools.h"
#include "AudioTools/Communication/AudioHttp.h"

URLStream music;    // Music Stream
I2SStream i2s;      // I2S as Stream
StreamCopy copier(i2s, music, 1024); // copy music to i2s

// Arduino Setup
void setup(void) {
  Serial.begin(115200);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Info);

  // connect to WIFI
  WiFi.begin("MLDEV", "{{replace with your wifi password}}");
  while (WiFi.status() != WL_CONNECTED){
    Serial.print(".");
    delay(500); 
  }
 
  // open music stream
  // music.begin("https://pschatzmann.github.io/Resources/audio/audio-8000.raw");
  music.begin("http://192.168.41.71:3000/audio.raw"); // replace this with your computer's url


  // start I2S with external DAC
  Serial.println("\nstarting I2S...");
  auto cfg = i2s.defaultConfig(TX_MODE);
  cfg.sample_rate = 8000;
  cfg.bits_per_sample = 16;
  cfg.channels = 1;
  i2s.begin(cfg);
}

// Arduino loop - copy stream to I2S output
void loop() {
  int len = copier.copy();
  if (len){
      Serial.print(".");
  } else {
      // No data available right now, just wait a bit and continue
      // Don't stop the stream - it's a live continuous stream
      delay(10);
  }
}