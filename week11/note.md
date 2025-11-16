# Networking note

- Xiao UDP can send over 1k hz to a PC
- But it will crash, presumable due to buffer overflow, when PC sends it too much data
- characteristics
  - typical latency: 30-50ms
  - worst latency: 100-200ms
  - best latency: 4-6ms
- xiao needs to sleep 1ms between send. Otherwise, it will be blocked from reading packet

## Division of labor

- Sensing (C++):
  - Understand the format of IMU data from our sensor.
  - Prepare it on the xiao before sending to network.
- Networking (C++ & Python):
  - wifi connection management
  - tracking IP address of the remote control (PC)
  - sending IMU data from xiao to remote control over UDP
  - receiving servo motor number from remote control to xiao over UDP
- Planning (JavaScript)
  - Use math to convert move front/back/left/right into the correct servo motor number that should move
- Actuation (C++)
  - Based on the received servo motor number, drive the motor to make the movement
- UI (JavaScript/HTML/CSS):
  - a web UI
  - Visualize device orientation
  - Show buttons to move front/back/left/right and provides control butt
  - Show buttons to manually move individual servo motors

## Decision record

- Running server on PC instead of xiao
  - Easier to debug
  - Keep laptop connected to school wifi so we can use Gen AI to accelerate coding
  - Drawback acknowledged: higher latency because going through school wifi, but we should be able to

## Implementing server

- Yufeng ran the demo code for Adafruit IMU board
- In parallel, I mocked the IMU data in a separate Xiao, communicate with a node.js server over UDP, and made user the node.js server can send commands back to Xiao.

## Determine high level logic

```cpp
setup() {
  wifi = connect_wifi();
  laptop_ip = discover_laptop(wifi);

  on_message_received = (message) => {
    handle_reset(message);
    handle_servo_command(message);
  };

  handle_laptop_udp_message(wifi, laptop_ip, on_message_received);
}

loop() {
  sendor_data = read_imu_sensor();
  send_udp_message(wifi, laptop_ip, sendor_data);
}
```

## Testing (friday Tea hour)

- In Media Lab tea party with about 40 people, the device can experience 3 seconds+ delays
- The WXYZ quaternion takes 12+ seconds to stablize
- Panic: we need to ditch al the wifi and UDP code. It's gonna be a rewrite!

## Migration

After the testing I tool Miranda's Bluetooth 2-way communication code, and used Claude 4.5 Sonnet to migrate the Wifi+UDP code with Bluetooth

```txt
Plan step by step, we are going to swap out the wifi + UDP + WebSocket based communication between ESP32 and Node.js with a simpler Bluetooth BLE based communication between ESP32 and the Web page, using Web Bluetooth API.

The change will include at least the following:
1. Remove UDP and Wifi on both ESP32 and Node.js
2. Add BLE on both ESP32 and the web page
3. Remove IP discovery code
4. Treat the server folder as static. use simple npx command to serve the file and not worry about maintaining a node.js server

We already have working reference implemention in #file:bluetooth. You can use that code as skeleton.

Keep the ESP32 organized by files, similar to existing structure lib-xx-name.ino; delete files that are no longer in use.

Make sure to carefully map out the migration and execute it with a checklist.
```

## Integrating servo

```
  if (isBLEConnected()) {
    String sensorData = getSensorJSON();
    sendBLEMessage(sensorData); <-- need to disable this line in order to send any command to the ESP32, why?
  }
```

Solution, instead of blocking the main loop, we use a timer to send sensor data every 20ms.

```cpp
static unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL_MS = 20;

void setupSensorTransmission() {
  lastSendTime = 0;
  Serial.println("Sensor transmission initialized");
}

void sendSensorDataIfReady() {
  if (!isBLEConnected()) {
    return;
  }

  unsigned long currentTime = millis();

  if (currentTime - lastSendTime >= SEND_INTERVAL_MS) {
    String sensorData = getSensorJSON();
    sendBLEMessage(sensorData);
    lastSendTime = currentTime;
  }
}

```

## Debugging MUX issue

Matti directed us to run the adafruit official MUX PWM PCA9685 library code.
We confirmed that the board wiring is correct, all servo motors are functional
