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
