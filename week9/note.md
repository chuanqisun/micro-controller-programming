# Machine Melody

## Group Assignment

- This week's theme is Output device.
- My final project involves a speaker.
- For the group assignment, we measured the power consumption of the speaker.

- See [group notes](https://fab.cba.mit.edu/classes/MAS.863/CBA/group_assignments/week9/)

## Give AI A Voice

- Previous week, I used a microphone to stream audio input from ESP32 to my laptop where I used OpenAI for speech response generation. However, the generated voice was playing on my laptop.
- This week, I want to stream the voice back to ESP32, completing the loop of voice interaction.

### Playing sine wave

- I started with the Arduino Audio Tools [example code](https://github.com/pschatzmann/arduino-audio-tools/blob/main/examples/examples-stream/streams-generator-i2s/streams-generator-i2s.ino) to play sine wave on the I2S DAC.
- A basic program to play sine wave tone.

```cpp
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
```

- I heard loud clicking sound
- I experimented with sampling rate until sound artifacts were gone

Table of experiments

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
- Experiment: switching from a data passing usb c cable to a power only cable reduces artifacts, and removing all serial communication in code
- Result: noise reduced but not eliminated

Conclusion: over-sampling could cause noise artifacts, and serial communication could exacerbate the issue.

### Stream sine wave from computer to device

- I started with the [sample code](https://github.com/pschatzmann/arduino-audio-tools/blob/main/examples/examples-communication/udp/communication-udp-receive/communication-udp-receive.ino) for receiving audio from UDP
- Added server code to generate the sine wave

Client (other logic omitted for brevity)

```cpp
#include "AudioTools.h"
#include "AudioTools/Communication/UDPStream.h"

// ... pin definitions ...

const char *ssid = "";
const char *password = "";

const int SAMPLE_RATE = 22000;
const int CHANNELS = 1;
const int BITS_PER_SAMPLE = 16;
const int UDP_PORT = 8888;

AudioInfo info(SAMPLE_RATE, CHANNELS, BITS_PER_SAMPLE);
I2SStream i2s;           // I2S output to speaker
UDPStream udp(ssid, password);
StreamCopy copier(i2s, udp, 1024); // copy UDP stream to I2S

void setup() {
  // ... WiFi connection ...

  // Start I2S with custom pinout for speaker output
  auto i2sCfg = i2s.defaultConfig(TX_MODE);
  i2sCfg.copyFrom(info);
  i2sCfg.pin_bck = I2S_BCLK;
  i2sCfg.pin_ws = I2S_LRC;
  i2sCfg.pin_data = I2S_DIN;
  i2sCfg.i2s_format = I2S_STD_FORMAT;
  i2s.begin(i2sCfg);

  // Start UDP receiver
  udp.begin(UDP_PORT);
}

void loop() {
  copier.copy();
}
```

Server (other logic omitted for brevity)

```js
const SAMPLE_RATE = 22000;
const PACKET_SIZE = 1024; // bytes per UDP packet
const FREQUENCY = 440; // Hz (A4 note)

function startSineWaveStream() {
  let phase = 0;
  const samplesPerPacket = PACKET_SIZE / 2; // 2 bytes per sample (16-bit)
  const phaseIncrement = (2 * Math.PI * FREQUENCY) / SAMPLE_RATE;

  setInterval(
    () => {
      const result = generateSineWaveBuffer(phase, samplesPerPacket, phaseIncrement);
      phase = result.phase;
      sendAudioPacket(result.buffer);
    },
    (samplesPerPacket / SAMPLE_RATE) * 1000
  );
}

function generateSineWaveBuffer(phase, samplesPerPacket, phaseIncrement) {
  const buffer = Buffer.alloc(PACKET_SIZE);

  for (let i = 0; i < samplesPerPacket; i++) {
    const sample = Math.sin(phase) * 0.3; // 30% amplitude to avoid clipping
    const pcm16Value = Math.round(sample * 32767);
    buffer.writeInt16LE(pcm16Value, i * 2);
    phase += phaseIncrement;
    if (phase >= 2 * Math.PI) {
      phase -= 2 * Math.PI;
    }
  }

  return { buffer, phase };
}
```

- I noticed clicking sound artifacts again.
- We already eliminated serial communication as a source of noise
- Networking was the suspect.
- I experimented with UDP packet size until the noise was gone.

Table of experiments

- 128 bytes: continous clicking, almost like geiger counter, maybe I can use it for a future project.
- 256 bytes: continous clicking, a little less frequent
- 512 bytes: a few clicks every second
- 1024 bytes: no clicks

Conclusion: UDP buffer size affects noise artifacts. Larger buffer size reduces artifacts.

After thought: I only adjusted UDP buffer size. There are additional parameters I can experiment with:

- I2S buffer size (default to 6)
- I2S buffer count (default to 512)

The default parameters are in [AudioToolsConfig.h](https://github.com/pschatzmann/arduino-audio-tools/blob/c8e8eb74495521ed9402655cbc2e2ec3ce26fbe5/src/AudioToolsConfig.h)

It's interesting that noise occurs when the UDP packet size is smaller or equal to the I2S buffer size. It's something I should investigate further given more time.

### Transcribing audio and stream voice from computer to device

- I updated the client to handle push-to-talk button. This is the same logic from previous week except I added the sound playing logic.

Client (other logic omitted for brevity)

```cpp
I2SStream i2sMic;
I2SStream i2sSpeaker;
UDPStream udpSend(WIFI_SSID, WIFI_PASSWORD);
UDPStream udpReceive(WIFI_SSID, WIFI_PASSWORD);

StreamCopy transmitCopier(throttle, i2sMic);
StreamCopy receiveCopier(i2sSpeaker, udpReceive, 1024);

int debounceCounter = 0;
bool isTransmitting = false;

void loop() {
  bool buttonPressed = (digitalRead(BTN_PTT1) == LOW || digitalRead(BTN_PTT2) == LOW);

  if (buttonPressed) {
    debounceCounter++;
    if (debounceCounter >= DEBOUNCE_THRESHOLD) {
      isTransmitting = true;
    }
  } else {
    debounceCounter--;
    if (debounceCounter <= -DEBOUNCE_THRESHOLD) {
      isTransmitting = false;
    }
  }

  if (isTransmitting) {
    transmitCopier.copy();
  }

  receiveCopier.copy();
}
```

- server code to stream the AI generated response

Server (other logic omitted for brevity):

```js
const STATE = {
  SILENT: "silent",
  SPEAKING: "speaking",
};

let currentState = STATE.SILENT;
let audioBuffer = [];
let lastPacketTime = null;

function detectSilence() {
  if (currentState === STATE.SPEAKING && lastPacketTime) {
    const timeSinceLastPacket = Date.now() - lastPacketTime;
    if (timeSinceLastPacket > SILENCE_TIMEOUT_MS) {
      transitionToSilentAndProcessAudio();
    }
  }
}

function streamAudioChunkToRealtime(audioChunk) {
  const base64Audio = audioChunk.toString("base64");
  const event = {
    type: "input_audio_buffer.append",
    audio: base64Audio,
  };
  realtimeWs.send(JSON.stringify(event));
}

async function commitAudioAndRequestResponse() {
  realtimeWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
  realtimeWs.send(JSON.stringify({ type: "response.create", response: { modalities: ["text"] } }));
  realtimeWs.send(JSON.stringify({ type: "input_audio_buffer.clear" }));
}

// Convert TTS to PCM and stream to ESP32
async function synthesizeAndStreamSpeech(text) {
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice: "ash",
      input: text,
      instructions: "Low coarse seasoned veteran from war time, military radio operator voice with no emotion. Speak fast with urgency.",
      response_format: "wav",
    }),
  });

  const wavBuffer = Buffer.from(await response.arrayBuffer());
  const pcmBuffer = await convertWavToPCM16(wavBuffer);
  await streamAudioToUDP(pcmBuffer);
}

// Send audio packets with timing control
async function streamAudioToUDP(pcmBuffer) {
  const totalPackets = Math.ceil(pcmBuffer.length / PACKET_SIZE);

  for (let i = 0; i < totalPackets; i++) {
    const packet = pcmBuffer.slice(i * PACKET_SIZE, (i + 1) * PACKET_SIZE);
    await sendAudioPacketToESP32(packet);

    // Wait to match playback speed
    const delayMs = (PACKET_SIZE / 2 / SAMPLE_RATE) * 1000;
    await sleep(delayMs);
  }
}
```

## Sonic Fidget Spinner

- [Music Road](https://en.wikipedia.org/wiki/Musical_road) lets drivers play music by driving over specially designed rumble strips. There are many demos like [this one](https://www.youtube.com/watch?v=beGiU1EpGKI) on the internet.
- I want to build a miniature version controlled by rotary encoder, which offers a similar tactile experience. This would be something I can figet with when a zoom call get too boring.

### Rotary Encoder

- I got the feedback that I did too much networking work in the Input Device week, so let's add more input device work here.
- First, I picked up a rotary encoder from my lab's spare parts bin.
- I studied the mechanism by watching a [YouTube tutorial](https://www.youtube.com/watch?v=fgOfSHTYeio).
- I implemented a basic test program using the Rotary Encoder library. My version is simplified from the [full example code](https://github.com/mo-thunderz/RotaryEncoder/blob/main/Arduino/ArduinoRotaryEncoder/ArduinoRotaryEncoder.ino).

```cpp
#include "RotaryEncoder.h"

// Define the pins connected to the encoder
#define PIN_ENCODER_A D6
#define PIN_ENCODER_B D7

RotaryEncoder encoder(PIN_ENCODER_A, PIN_ENCODER_B);

void checkPosition() {
  encoder.tick(); // Call tick() to check the state
}

void setup() {
  Serial.begin(115200);
  Serial.println("Rotary Encoder Example");

  // Attach interrupts for encoder pins
  attachInterrupt(digitalPinToInterrupt(PIN_ENCODER_A), checkPosition, CHANGE);
  attachInterrupt(digitalPinToInterrupt(PIN_ENCODER_B), checkPosition, CHANGE);
}

void loop() {
  // Read encoder position
  int newPosition = encoder.getPosition();
  static int lastPosition = 0;

  if (newPosition != lastPosition) {
    Serial.print("Encoder Position: ");
    Serial.println(newPosition);
    lastPosition = newPosition;
  }

  delay(10); // Debounce or prevent overwhelming serial
}
```

### Trigger Mechanism

- I considered a few designs, table:

- Note per click
  - Pro: simple, precise
  - Con: no control over note duration
- Consecutive clicks to start and stop a note
  - Pro: more control over note duration
  - Con: more complex, especially timing logic

I went with the second approach. With debouncing logic, I can track when a group of consecutive clicks start and stop.

```cpp
// ... setup and encoder initialization ...

int counter = 0;
unsigned long lastChangeTime = 0;
bool isChanging = false;
bool groupStarted = false;

void loop() {
  int newPosition = encoder.getPosition();
  static int lastPosition = 0;

  // Detect position change
  if (newPosition != lastPosition) {
    lastPosition = newPosition;
    lastChangeTime = millis();
    isChanging = true;
    if (!groupStarted) {
      Serial.println("Position change group started");
      groupStarted = true;
    }
  }

  // Detect end of group (100ms timeout)
  if (isChanging && (millis() - lastChangeTime > 100)) {
    counter++;
    Serial.print("Position change group ended, Counter: ");
    Serial.println(counter);
    isChanging = false;
    groupStarted = false;
  }
}
```

### Audio Synthesis

- I started with playing the same tone for each note
- I merged the previous code

```cpp
#include "AudioTools.h"

// ... I2S pin definitions ...

const int sampleRate = 22000;
AudioInfo info(sampleRate, 1, 16);
SineWaveGenerator<int16_t> sineWave(16000);
GeneratedSoundStream<int16_t> sound(sineWave);
I2SStream out;
StreamCopy copier(out, sound);
bool playing = false;

void setup() {
  // ... encoder setup ...

  // Setup I2S for audio output
  auto config = out.defaultConfig(TX_MODE);
  config.copyFrom(info);
  config.pin_bck = I2S_BCLK;
  config.pin_ws = I2S_LRC;
  config.pin_data = I2S_DIN;
  out.begin(config);
  sineWave.begin(info, 440);  // 440 Hz (A4 note)
}

void loop() {
  // ... encoder position detection ...

  if (newPosition != lastPosition) {
    // ... debouncing logic ...
    if (!groupStarted) {
      playing = true;  // Start playing when group starts
      groupStarted = true;
    }
  }

  if (isChanging && (millis() - lastChangeTime > 100)) {
    playing = false;  // Stop playing when group ends
    // ... rest of debouncing ...
  }

  // Only copy audio when playing
  if (playing) {
    copier.copy();
  }
}
```

### Soundtrack

- I mapped out Ode To Joy melody to the musical notes and their frequencies
- Added a counter to track the current note index

```cpp
// Note-to-frequency mapping
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

// Ode to Joy melody
const char song[62] = {
  'E','E','F','G','G','F','E','D','C','C','D','E','E','D','D',
  'E','E','F','G','G','F','E','D','C','C','D','E','D','C','C',
  'D','D','E','C','D','E','F','E','C','D','E','F','E','D','C','D','g',
  'E','E','F','G','G','F','E','D','C','C','D','E','D','C','C'
};

int currentNote = 0;

void loop() {
  // ... encoder position detection ...

  if (newPosition != lastPosition) {
    // ... debouncing logic ...
    if (!groupStarted) {
      playing = true;
      // Play next note in sequence
      char note = song[currentNote % 63];
      float freq = getFreq(note);
      sineWave.setFrequency(freq);
      currentNote++;
      groupStarted = true;
    }
  }

  // ... rest of loop ...
}
```

### A Very Mary B-side

- What if rotating backwards would play the B-side?
- I want to add an equally joyful melody on the B-side: Mary Had A Little Lamb
- I noticed that the encoder would occasionally bounce with an unexpected direction change, and immediately flip back to the original direction
- I had to add additional debouncing logic to ignore the sudden flip of directions
- I also implemented reset. If user switching direction, we alwasy reset the counter

```cpp
// Two melodies for bidirectional playback
const char odeToJoy[62] = {
  'E','E','F','G','G','F','E','D','C','C','D','E','E','D','D',
  'E','E','F','G','G','F','E','D','C','C','D','E','D','C','C',
  'D','D','E','C','D','E','F','E','C','D','E','F','E','D','C','D','g',
  'E','E','F','G','G','F','E','D','C','C','D','E','D','C','C'
};

const char littleLamb[26] = {
  'E','D','C','D','E','E','E','D','D','D','E','G','G','E','D','C','D','E','E','E','C','D','D','E','D','C'
};

int currentNote = 0;
int lastDirection = 0;  // Track rotation direction: 1 = forward, -1 = backward

void loop() {
  static int lastPosition = 0;
  int newPosition = encoder.getPosition();

  if (newPosition != lastPosition) {
    // Determine rotation direction
    int dir = (newPosition > lastPosition) ? 1 : -1;
    lastPosition = newPosition;
    lastChangeTime = millis();

    // Detect direction change (only when not currently changing to avoid bounce)
    if (!isChanging && dir != lastDirection && lastDirection != 0) {
      currentNote = 0;  // Reset counter on direction change
      lastDirection = dir;
      Serial.println("Direction changed, resetting counter");
    }

    // Set initial direction
    if (lastDirection == 0) {
      lastDirection = dir;
    }

    // Play appropriate melody based on direction
    if (!isChanging) {
      char note;
      if (lastDirection == 1) {
        note = odeToJoy[currentNote % 62];
      } else if (lastDirection == -1) {
        note = littleLamb[currentNote % 26];
      }

      float freq = getFreq(note);
      sineWave.setFrequency(freq);

      isChanging = true;
      playing = true;
    }
  }

  // Stop playing after debounce timeout
  if (isChanging && (millis() - lastChangeTime > DEBOUNCE_TIME)) {
    isChanging = false;
    playing = false;
    currentNote++;  // Advance to next note
  }

  if (playing) {
    copier.copy();
  }
}
```

## After Thought

My development board for XIAO ESP32 was an unsung hero for this week. I was able to explore both ideas without fabrication new PCB.

I was especially glad that I mapped out all the pins to the female sockets. This would be a good example of upfront investment that pays off later.

## Appendix

- [Walkie Talkie Code](...)
- [Sonic Fidget Spinner Code](...)
