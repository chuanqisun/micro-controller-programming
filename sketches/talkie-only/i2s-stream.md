# I2S Stream Reference

# IMPORTANT: Pinout for this project

Make sure to use this custom I2S microphone pinout
D0 = BCLK
D1 = DOUT
D2 = LRC

## I2S Stream Class

```cpp
namespace audio_tools {

class I2SStream : public AudioStream {
 public:
  I2SStream() = default;
  ~I2SStream() { end(); }

#ifdef ARDUINO
  I2SStream(int mute_pin) {
    TRACED();
    this->mute_pin = mute_pin;
    if (mute_pin > 0) {
      pinMode(mute_pin, OUTPUT);
      mute(true);
    }
  }
#endif

  I2SConfig defaultConfig(RxTxMode mode = TX_MODE) {
    return i2s.defaultConfig(mode);
  }

  bool begin() {
    TRACEI();
    I2SConfig cfg = i2s.config();
    if (!cfg){
      LOGE("unsuported AudioInfo: sample_rate: %d / channels: %d / bits_per_sample: %d", (int) cfg.sample_rate, (int)cfg.channels, (int)cfg.bits_per_sample);
      return false;
    }
    cfg.copyFrom(audioInfo());
    if (cfg.rx_tx_mode == UNDEFINED_MODE){
      cfg.rx_tx_mode = RXTX_MODE;
    }
    is_active = i2s.begin(cfg);
    mute(false);
    return is_active;
  }

  bool begin(I2SConfig cfg) {
    TRACED();
    if (!cfg){
      LOGE("unsuported AudioInfo: sample_rate: %d / channels: %d / bits_per_sample: %d", (int) cfg.sample_rate, (int)cfg.channels, (int)cfg.bits_per_sample);
      return false;
    }
    AudioStream::setAudioInfo(cfg);
    is_active = i2s.begin(cfg);
    // unmute
    mute(false);
    return is_active;
  }

  void end() {
    if (is_active) {
      TRACEI();
      is_active = false;
      mute(true);
      i2s.end();
    }
  }

  virtual void setAudioInfo(AudioInfo info) {
    TRACEI();
    assert(info.sample_rate != 0);
    assert(info.channels != 0);
    assert(info.bits_per_sample != 0);
    AudioStream::setAudioInfo(info);
    if (is_active) {
      if (!i2s.setAudioInfo(info)) {
        I2SConfig current_cfg = i2s.config();
        if (!info.equals(current_cfg)) {
          LOGI("restarting i2s");
          info.logInfo("I2SStream");
          i2s.end();
          current_cfg.copyFrom(info);
          i2s.begin(current_cfg);
        } else {
          LOGI("no change");
        }
      }
    }
  }

  virtual size_t write(const uint8_t *data, size_t len) {
    LOGD("I2SStream::write: %d", len);
    if (data == nullptr || len == 0 || !is_active)  return 0;
    return i2s.writeBytes(data, len);
  }

  virtual size_t readBytes(uint8_t *data, size_t len) override {
    return i2s.readBytes(data, len);
  }

  virtual int available() override { return i2s.available(); }

  virtual int availableForWrite() override { return i2s.availableForWrite(); }

  void flush() override {}

  I2SDriver *driver() { return &i2s; }

  operator bool() override { return is_active; }

  bool isActive()  { return is_active;}

 protected:
  I2SDriver i2s;
  int mute_pin = -1;
  bool is_active = false;

  void mute(bool is_mute) {
#ifdef ARDUINO
    if (mute_pin > 0) {
      digitalWrite(mute_pin, is_mute ? SOFT_MUTE_VALUE : !SOFT_MUTE_VALUE);
    }
#endif
  }
};

}  // namespace audio_tools

```

## I2S Default Configuration Class

```cpp
namespace audio_tools {


class I2SConfigESP32 : public AudioInfo {
  public:

    I2SConfigESP32() {
      channels = DEFAULT_CHANNELS;
      sample_rate = DEFAULT_SAMPLE_RATE;
      bits_per_sample = DEFAULT_BITS_PER_SAMPLE;
    }

    I2SConfigESP32(const I2SConfigESP32 &cfg) = default;

    I2SConfigESP32(RxTxMode mode) {
        channels = DEFAULT_CHANNELS;
        sample_rate = DEFAULT_SAMPLE_RATE;
        bits_per_sample = DEFAULT_BITS_PER_SAMPLE;
        rx_tx_mode = mode;
        switch(mode){
          case RX_MODE:
            pin_data = PIN_I2S_DATA_IN;
            auto_clear = false;
            break;
          case TX_MODE:
            pin_data = PIN_I2S_DATA_OUT;
            auto_clear = I2S_AUTO_CLEAR;
            break;
          default:
            auto_clear = I2S_AUTO_CLEAR;
            pin_data = PIN_I2S_DATA_OUT;
            pin_data_rx = PIN_I2S_DATA_IN;
            break;
        }
    }

    RxTxMode rx_tx_mode = RXTX_MODE;
    I2SFormat i2s_format = I2S_STD_FORMAT;
    I2SSignalType signal_type = Digital;  // e.g. the ESP32 supports analog input or output or PDM picrophones
    bool is_master = true;
    int port_no = 0;  // processor dependent port
    int pin_ws = PIN_I2S_WS;
    int pin_bck = PIN_I2S_BCK;
    int pin_data = -1; // rx or tx pin dependent on mode: tx pin for RXTX_MODE
    int pin_data_rx = -1; // rx pin for RXTX_MODE
    int pin_mck = PIN_I2S_MCK;
    int buffer_count = I2S_BUFFER_COUNT;
    int buffer_size = I2S_BUFFER_SIZE;
    bool auto_clear = I2S_AUTO_CLEAR;
    bool use_apll = I2S_USE_APLL;
    uint32_t fixed_mclk = 0;
    int channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT;

    void logInfo(const char* source="") {
      AudioInfo::logInfo(source);
      LOGI("rx/tx mode: %s", RxTxModeNames[rx_tx_mode]);
      LOGI("port_no: %d", port_no);
      LOGI("is_master: %s", is_master ? "Master":"Slave");
      LOGI("sample rate: %d", sample_rate);
      LOGI("bits per sample: %d", bits_per_sample);
      LOGI("number of channels: %d", channels);
      LOGI("signal_type: %s", i2s_signal_types[signal_type]);
      if (signal_type==Digital){
        LOGI("i2s_format: %s", i2s_formats[i2s_format]);
      }
      LOGI("auto_clear: %s",auto_clear? "true" : "false");
      if (use_apll) {
        LOGI("use_apll: %s", use_apll ? "true" : "false");
      }
      if (fixed_mclk){
       LOGI("fixed_mclk: %d", (int) fixed_mclk);
      }
      LOGI("buffer_count:%d",buffer_count);
      LOGI("buffer_size:%d",buffer_size);

      if (pin_mck!=-1)
        LOGI("pin_mck: %d", pin_mck);
      if (pin_bck!=-1)
        LOGI("pin_bck: %d", pin_bck);
      if (pin_ws!=-1)
        LOGI("pin_ws: %d", pin_ws);
      if (pin_data!=-1)
        LOGI("pin_data: %d", pin_data);
      if (pin_data_rx!=-1 && rx_tx_mode==RXTX_MODE){
        LOGI("pin_data_rx: %d", pin_data_rx);
      }
    }

};

using I2SConfig = I2SConfigESP32;
}
```

## I2S Networking Example

This sketch reads sound data from I2S. The result is provided as WAV stream which can be listened to in a Web Browser

```cpp
//AudioEncodedServer server(new WAVEncoder(),"ssid","password");
AudioWAVServer server("ssid","password"); // the same a above

I2SStream i2sStream;    // Access I2S as stream
ConverterFillLeftAndRight<int16_t> filler(LeftIsEmpty); // fill both channels - or change to RightIsEmpty

void setup(){
  Serial.begin(115200);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Info);

  // start i2s input with default configuration
  Serial.println("starting I2S...");
  auto config = i2sStream.defaultConfig(RX_MODE);
  config.i2s_format = I2S_STD_FORMAT; // if quality is bad change to I2S_LSB_FORMAT https://github.com/pschatzmann/arduino-audio-tools/issues/23
  config.sample_rate = 22050;
  config.channels = 2;
  config.bits_per_sample = 16;
  i2sStream.begin(config);
  Serial.println("I2S started");

  // start data sink
  server.begin(i2sStream, config, &filler);
}

// Arduino loop
void loop() {
  // Handle new connections
  server.copy();
}
```

## I2S PDM Streaming Example

```cpp
#include "AudioTools.h"

AudioInfo info(44100, 1, 16);
I2SStream i2sStream; // Access I2S as stream
CsvOutput<int16_t> csvOutput(Serial);
StreamCopy copier(csvOutput, i2sStream); // copy i2sStream to csvOutput

// Arduino Setup
void setup(void) {
    Serial.begin(115200);
    AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Info);

    auto cfg = i2sStream.defaultConfig(RX_MODE);
    cfg.copyFrom(info);
    cfg.signal_type = PDM;
    //cfg.use_apll = false;
    //cfg.auto_clear = false;
    cfg.pin_bck = -1; // not used depending on ESP32 core version
    i2sStream.begin(cfg);

    // make sure that we have the correct channels set up
    csvOutput.begin(info);

}

// Arduino loop - copy data
void loop() {
    copier.copy();
}
```

## I2S WiFi Sine Wave Streaming Example

```cpp
/**
 * @file streams-generator-server_wav.ino
 *
 *  This sketch generates a test sine wave. The result is provided as WAV stream which can be listened to in a Web Browser
 *
 * @author Phil Schatzmann
 * @copyright GPLv3
 *
 */

#include "AudioTools.h"
#include "AudioTools/Communication/AudioHttp.h"

// WIFI
const char *ssid = "MLDEV";
const char *password = "REPLACE_WITH_REAL_PASSWORD";

AudioWAVServer server(ssid, password);

// Sound Generation
const int sample_rate = 10000;
const int channels = 1;

SineWaveGenerator<int16_t> sineWave;            // Subclass of SoundGenerator with max amplitude of 32000
GeneratedSoundStream<int16_t> in(sineWave);     // Stream generated from sine wave


void setup() {
  Serial.begin(115200);
  AudioLogger::instance().begin(Serial,AudioLogger::Info);

  // start server
  server.begin(in, sample_rate, channels);

  // start generation of sound
  sineWave.begin(channels, sample_rate, N_B4);
  in.begin();

  Serial.print("Will sleep");
  // sleep for 5 seconds first
  delay(5000);

  Serial.print("Server URL: http://");
  Serial.print(WiFi.localIP());
}


// copy the data
void loop() {
  server.copy();
}
```
