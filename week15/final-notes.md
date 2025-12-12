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

1. Make sure speaker makes sound
2. Test computer streaming sound to speaker
3. Add microphone to stream via UDP
4. Debug undrained buffer played after button up
5. Add one distinct voice per story

## Gemini hacks

- Function calling seems to cause double response
- Use Non-blocking functions with SILENT response removes doube response but function request is ignored
- Add a manual non-terminiating text message to model fixed the missing tool result
