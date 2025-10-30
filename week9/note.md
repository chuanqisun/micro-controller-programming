## Playing sine wave

```cpp
#include "AudioTools.h"

/**
 * Pinout:
 * D0 - I2S BCLK
 * D1 - I2S DOUT (from microphone)
 * D2 - I2S LRC
 * D8 - Push-to-talk button 1
 * D9 - Push-to-talk button 2
 * D10 - I2S DIN (to speaker)
 */

#define I2S_BCLK D0
#define I2S_DOUT D1
#define I2S_LRC  D2
#define I2S_DIN  D10
#define BTN_PTT1 D8
#define BTN_PTT2 D9

const int frequency = 440;    // frequency of sine wave in Hz
const int sampleRate = 44100; // sample rate in Hz

AudioInfo info(sampleRate, 2, 16);
SineWaveGenerator<int16_t> sineWave(4000); // sine wave with max amplitude of 4000
GeneratedSoundStream<int16_t> sound(sineWave); // stream generated from sine wave
I2SStream out;
StreamCopy copier(out, sound); // copies sound into i2s

void setup() {
  Serial.begin(115200);
  Serial.println("I2S Sine Wave Playback");

  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Info);

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
  Serial.println("Started sine wave playback");
}

void loop() {
  copier.copy();
}
```

- 44.1 kHz, pulsing sound artifact
- 44 kHz, same artifact
- 40 kHz, reduced artifact
- 32 kHz, no artifact
- 22kHz sample rate, no artifact

Key observations:

- Opening serial port positively correlates with noise artifacts
- Higher sampling frequency positively correlates with noise artifacts
- Confounding: higher sampling frequency means higher data rate

Follow up experiments:

- Hypothesis 1: The microphone on the device is causing interference. Since it shares BCLK and LRC lines.
- Experiment: unplugging the microphone should reduce/remove noise
- Result: no effect
- Hypothesis 2: Serial Port and its data transmission is causing interference
- Experiment: switching from a data passing usb c cable to a power only cable reduces artifacts
- Result: noise reduced but not eliminated
