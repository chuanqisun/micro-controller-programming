# Laptop <-> ESP32 Communication Protocol

## ESP32 -> Laptop Message Format

The minimal message includes Quaternion (w, x, y, z) and Accelerometer (ax, ay, az) data in JSON format.
Additional data may be appended in the future, including temperature, gyroscope.

```json
{ "w": -0.0686, "x": 0.7928, "y": -0.3534, "z": 0.4918, "ax": 0.0003, "ay": -0.0005, "az": 0.0098 }
```

## Laptop -> ESP32 Message Format

General format is JSON with "cmd" and "args" fields. For simplicity, "args" is a string. It is optional.

### Move servo command

```json
{ "cmd": "move_servo", "args": "5,12" }
```

### Reset device command

```json
{ "cmd": "reset" }
```

# ESP32 Top Level Logic

```cpp
void setup() {
  Serial.begin(115200);
  setupWiFi();

  if (udp.connect(targetIP, targetPort)) {
    udp.onPacket([](AsyncUDPPacket packet) {
      String msg = ...;
      String cmd, args;
      parseMessage(msg, cmd, args);

      // Call all handlers in series, each handler choose what to do
      handle_move_servo(cmd, args);
      handle_reset(cmd, args);
      // ... more handlers
    });

    udp.print("Hello Server!");
  }
}

void loop() {
  updateSensorData();
  udp.print(getSensorJSON());
}
```
