On the single-core ESP32 C3, I encountered the issue where within each loop, I can either send audio or play sound, but never both. When I do both, the microphone became silent.

If we alternating between the two tasks, it would work as expected.

```cpp
bool shouldSend = false;

if (shouldSend && isTransmitting) {
  micToUdpCopier.copy();
} else if (!shouldSend && !isTransmitting) {
  soundToSpeakerCopier.copy();
}

shouldSend = !shouldSend;
```

# Plans

1. Laser cut unit-1/2 or fabricate a vinly cut sticky
1. Reduce audio band width with either ADPCM or lower sample rate to 16kHz
1. Debug undrained buffer played after button up
1. Add one distinct voice per story
1. Produce unit-2

# DONE

1. Make sure speaker makes sound
2. Test computer streaming sound to speaker
3. Add microphone to stream via UDP

## Gemini hacks

- Function calling seems to cause double response
- Use Non-blocking functions with SILENT response removes doube response but function request is ignored
- Add a manual non-terminiating text message to model fixed the missing tool result
