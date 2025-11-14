# Rolling Ball – Servo Test (ESP32-S3 + PCA9685 + Single MUX)
writer: saetbyeol
- ESP32-S3 (I2C master)
- PCA9685 16-channel Servo Driver
- SunFounder Digital Servos
- One 74HC4067 16-channel analog MUX (for face servos)

### Features
- Move two selected faces together by JSON command
- Routing logic automatically chooses
    - AA → both faces on MUX A
    - BB → both faces on MUX B
    - AB → one face on A, one on B (simultaneous output)
- Sends PWM to the correct MUX and PCA9685 channel
- Physical movement supported for Face 1 and Face 2 (servo A/B)
- Other faces print debug messages for now
- Supports JSON test input inside .ino file:
```json
{"cmd":"move_servo","args":"1,14"}
```

### Hardware Wiring
- PCA9685 OUT0 → Servo A  
- PCA9685 OUT1 → Servo B  
- PCA9685 OUT2 → MUX A Common
- PCA9685 OUT3 → MUX B Common
- ESP32-S3 Pins 2, 3, 4, 5 → MUX S0–S3  
- Face servos → MUX Channels 0–9  

### How to Test
- In the .ino file:
```cpp
String incomingJson = R"({"cmd":"move_servo","args":"1,2"})";
```
- Change "1,2" to any pair:
    - "1,2" → moves servo A & B
    - "1,14" → moves A + prints B
    - "3,7" → prints (MUX A)
    - "14,20" → prints (MUX B future)
