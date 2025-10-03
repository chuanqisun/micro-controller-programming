#include <ESP_I2S.h>
#include <AudioTools.h>

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

I2SClass i2s;

// Sine wave components
AudioInfo info(44100, 2, 16);
SineWaveGenerator<int16_t> sineWave(3200);                // subclass of SoundGenerator with max amplitude of 32000
GeneratedSoundStream<int16_t> sound(sineWave);             // Stream generated from sine wave
I2SStream out; 
StreamCopy copier(out, sound);                             // copies sound into i2s

// Timing variables
unsigned long startTime;
bool useSquareWave = true;
const unsigned long squareWaveDuration = 10000; // 10 seconds in milliseconds

void setup() {
  Serial.begin(115200);
  Serial.println("I2S simple tone");

  // Record start time
  startTime = millis();

  i2s.setPins(I2S_BCLK, I2S_LRC, I2S_DIN);

  // start I2S at the sample rate with 16-bits per sample
  if (!i2s.begin(mode, sampleRate, bps, slot)) {
    Serial.println("Failed to initialize I2S!");
    while (1);  // do nothing
  }

  // Setup AudioTools logger for sine wave
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Info);

  // Initialize sine wave components (but don't start yet)
  auto config = out.defaultConfig(TX_MODE);
  config.copyFrom(info); 
  
  Serial.println("Square wave will play for 10 seconds, then sine wave...");
}

void loop() {
  unsigned long currentTime = millis();
  
  // Check if we should switch from square wave to sine wave
  if (useSquareWave && (currentTime - startTime >= squareWaveDuration)) {
    Serial.println("Switching to sine wave...");
    
    // Stop the ESP_I2S
    i2s.end();
    
    // Start AudioTools I2S for sine wave
    auto config = out.defaultConfig(TX_MODE);
    config.copyFrom(info); 
    out.begin(config);
    
    // Setup sine wave
    sineWave.begin(info, N_B4);
    
    useSquareWave = false;
    Serial.println("Sine wave started...");
    return;
  }
  
  if (useSquareWave) {
    // Original square wave code
    if (count % halfWavelength == 0) {
      // invert the sample every half wavelength count multiple to generate square wave
      sample = -1 * sample;
    }

    // Left channel, the low 8 bits then high 8 bits
    i2s.write(sample);
    i2s.write(sample >> 8);

    // Right channel, the low 8 bits then high 8 bits
    i2s.write(sample);
    i2s.write(sample >> 8);

    // increment the counter for the next sample
    count++;
  } else {
    // Sine wave code
    copier.copy();
  }
}