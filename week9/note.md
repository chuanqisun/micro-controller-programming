# Machine Melody

## Group Assignment

- This week's theme is Output device.
- My final project involves a speaker.
- For the group assignment, we measured the power consumption of the speaker.

- See [linked notes](...)

## Give AI A Voice

- Previous week, I used a microphone to stream audio input from ESP32 to my laptop where I used OpenAI for speech response generation. However, the generated voice was playing on my laptop.
- This week, I want to stream the voice back to ESP32, completing the loop of voice interaction.

### Playing sine wave

- I started with the Arduino Audio Tools [example code](https://github.com/pschatzmann/arduino-audio-tools/blob/main/examples/examples-stream/streams-generator-i2s/streams-generator-i2s.ino) to play sine wave on the I2S DAC.
- A basic program to play sine wave tone.

```cpp
// TODO replace with step-00/local-sine-wave.ion
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

Client

```cpp
// TODO replace with step-01/udp-sine-wave.ino
```

Server

```js
// TODO replace with step-01/server.js
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

client

```cpp
// TODO replace with step-02/walkie-talkie.ino
```

- server code to stream the AI generated response

server

```js
// TODO replace with step-02/server.js
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
// TODO replace with aside-01/tangible-music.ino
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
// TODO replace with aside-02/tangible-music.ino
```

### Audio Synthesis

- I started with playing the same tone for each note
- I merged the previous code

```cpp
// TODO replace with aside-03/tangible-music.ino
```

### Soundtrack

- I mapped out Ode To Joy melody to the musical notes and their frequencies
- Added a counter to track the current note index

```cpp
// TODO replace with aside-04/tangible-music.ino
```

### A Very Mary B-side

- What if rotating backwards would play the B-side?
- I want to add an equally joyful melody on the B-side: Mary Had A Little Lamb
- I noticed that the encoder would occasionally bounce with an unexpected direction change, and immediately flip back to the original direction
- I had to add additional debouncing logic to ignore the sudden flip of directions
- I also implemented reset. If user switching direction, we alwasy reset the counter

```cpp
// TODO replace with aside-05/tangible-music.ino
```

## After Thought

My development board for XIAO ESP32 was an unsung hero for this week. I was able to explore both ideas without fabrication new PCB.

I was especially glad that I mapped out all the pins to the female sockets. This would be a good example of upfront investment that pays off later.
