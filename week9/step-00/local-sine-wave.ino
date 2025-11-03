#include "AudioTools.h"

#define I2S_BCLK D0
#define I2S_DOUT D1
#define I2S_LRC  D2
#define I2S_DIN  D10

const int frequency = 440; 
const int sampleRate = 44100;

AudioInfo info(sampleRate, 2, 16);
SineWaveGenerator<int16_t> sineWave(4000); // sine wave with max amplitude of 4000
GeneratedSoundStream<int16_t> sound(sineWave); // stream generated from sine wave
I2SStream out;
StreamCopy copier(out, sound); // copies sound into i2s

void setup() {
  Serial.begin(115200);

  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Info);

  Serial.println("Starting I2S...");
  auto config = out.defaultConfig(TX_MODE);
  config.copyFrom(info);
  config.pin_bck = I2S_BCLK;
  config.pin_ws = I2S_LRC;
  config.pin_data = I2S_DIN;
  out.begin(config);

  sineWave.begin(info, frequency);
  Serial.println("Started sine wave playback");
}

void loop() {
  copier.copy();
}