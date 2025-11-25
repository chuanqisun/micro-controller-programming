---
title: Networking ^ 3
---

# Preparation

- 3D print
- Solder

# LED connection

See sketches/led-test

# Web -> ESP32: turn one light on with Bluetooth

See sketches/blue-light

# ESP32 -> Web: Stream probe value to browser

Stream raw probe
Debug bit address circuit (add image)
See archive/streaming-probe

# ESP32 -> Web -> ESP32: Whack-a-mole game

I found `Switchboard` became `Switchbo` in the device list. I believe the bluetooth library is shortening the name to 8 characters.

Device name overflow:

```js
deviceSw = await navigator.bluetooth.requestDevice({
  filters: [{ name: "Switchboard" }],
  optionalServices: [SERVICE_UUID],
});
```

into

```js
deviceSw = await navigator.bluetooth.requestDevice({
  filters: [{ name: "sw" }],
  optionalServices: [SERVICE_UUID],
});
```
