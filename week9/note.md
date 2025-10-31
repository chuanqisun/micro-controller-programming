## Playing sine wave

(see step-00)

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

## Stream sine wave from computer to device

(see step-01)

## Transcribing audio and stream voice from computer to device

(see step-02)
