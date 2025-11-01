# Group assignment

## Speaker Spec

- 8 ohm, 0.5 watt

## Process

- Sun prepared a speaker playing sine tone at different frequencies and amplitudes
- Ben explained in-series measure of the DC power using V_msr
- Ceci performed the measurements and Sun recorded the data

| Amplitude | I (amp) | V (v) | Power (w) |
| --------- | ------- | ----- | --------- |
| 4000      | 0.020   | 0.195 | 0.0039    |
| 8000      | 0.045   | 0.380 | 0.0171    |
| 16000     | 0.095   | 0.770 | 0.07315   |
| 32000     | 0.185   | 1.555 | 0.2877    |

## Observation

- Both voltage and current are proportional to amplitude
- Hence, power is proportional to the square of amplitude

## Appendix

Test code

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
