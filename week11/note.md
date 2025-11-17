# A Week-long Machine Programming Hackathon

This is a group project week. This document captures the tasks I was involved in. See the group project page for the full context.

## Labubu

Miranda pitched the idea of building an icosahedron robot that can move around based on IMU data. Each face would be a Labubu to punches out and propels the icosahedron in the desired direction. I don't understand the significance of Labubu, but the idea sounds cool. Towards the end of the project, we have replaced the Labubu with our professor's Neil's face. That makes the project much more relatable but also much higher stakes.

## Project organization

- During the initial project planning, we discussed how to organize the codebase. I proposed a controversial idea of organizing code by people and duplicate code to surface full history at all times.

Consider this folder structure

```txt
- PersonA
  - sensing
  - networking
- PersonB
  - actuation
  - webUI
...
```

I advocated for this style because we need to consistantly branch and fork each other's ideas, 90% of the code in the beginning will be self-contained experiments that can be thrown away later. Exposing everyone's work in the same branch at the same time means:

- We can easily re-mix each other's code
- People using AI can reference multiple components from different people

This organization worked well in the beginning, but towards the second half of the project, we came to the conclusion that we need a point of integration. So our final folder structure is:

```txt
- integration
  - controller
  - web
- PersonA
  ...
- PersonB
  ...
```

I would still advocate for the same strategy for future projects.

## Division of labor

The group decided to divide the project into three teams: MechE, Electronics, and Software. I decided to focus on Software.

On the first night, Matti and I discussed task division. We want to:

- Create independent modules that can be worked on in parallel
- Reduce the dependencies between modules by defining clear interfaces

This is what we came up with:

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

At the end of the project, a similar structure was reflected in our code, redminding me of Conway's Law. As a reflection, we can use Conway's Law to our advantage by asking what kind of teams and collaborations do we desire, and thus we would modularize our project to maximize the organizational structure we want.

## Networking note

We started with UDP over Wifi because I had a similar system already working from the Input/Output week for streaming voice. I implemented a few diagnostic programs to test UDP

(See 300-udp-test-burst)

- Xiao UDP can send over 1k hz to a PC
- But it will crash, presumable due to buffer overflow, when PC sends it too much data
- characteristics
  - typical latency: 30-50ms
  - worst latency: 100-200ms
  - best latency: 4-6ms
- xiao needs to sleep 1ms between send. Otherwise, it will be blocked from reading packet

## Decision record

We also agreed on the high level architecture: shift as much computation to the PC as possible because it's much easier to iterate and debug on the PC than on the xiao.

- Running server on PC instead of xiao
  - Easier to debug
  - Keep laptop connected to school wifi so we can use Gen AI to accelerate coding
  - Drawback acknowledged: higher latency because going through school wifi, but we should be able to

This concept was reflected in every subsequent decision we made. Xiao's logic is dead simple

- Xiao sends low level IMU data to PC: quaternion WXYZ and accelerometer XYZ
- Xiao takes a servo motor number and fully extend, then retracts it based on predefined PWM sequence

The PC takes heavy lifting in interpreting the IMU data, solving the gemoetric puzzle, calibrating, and solving the correct servos to move based on user commands.

## Interface first

To implement the web sever without existing microcontroller code, I encouraged the team to define the networking contract first:

The notified payloads still contain Quaternion (w, x, y, z) and Accelerometer (ax, ay, az) readings in newline-delimited JSON:

### esp32 -> laptop

```json
{
  "w": 0.875,
  "x": 0.0243,
  "y": 0.0393,
  "z": -0.482,
  "ax": 17.5781,
  "ay": 3.1738,
  "az": 1025.3906
}
```

Each notification is parsed by `bluetooth.js` and forwarded to the UI; `threejs-vis.js` consumes the quaternion stream to animate the model.

### laptop -> esp32

General format is JSON with "cmd" and "args" fields. For simplicity, "args" is a string. It is optional.

Move servo command

```json
{ "cmd": "move_servo", "args": "5,12" }
```

Reset device command

```json
{ "cmd": "reset" }
```

We disucssed custom bit packing to reduce bandwidth consumption but I advocated for JSON for simplicity and agreed that we can optimize later if needed.

## Server implementation

- Yufeng ran the demo code for Adafruit IMU board
- In parallel, I mocked the IMU data in a separate Xiao, communicate with a node.js server over UDP, and made user the node.js server can send commands back to Xiao.

## Determine high level logic

Realizing that multiple people are adding pieces to the Xiao code, I started a refactoring effort to modularize the code so that the high level logic is easier to understand. This is the psuedo code I came up with:

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

I discussed the high level design with the group to make sure everyone shares the understanding. In theory the design allows future I/O to plug into the main program without needing to change other modules' code.

## Testing (during Friday Studcom Social Tea hour)

The EE team provided the electronics. We uploaded our sketch and started testing.

(see photo 1, photo 2)

- In Media Lab tea party with about 40 people, the device can experience 3 seconds+ latency
- The WXYZ quaternion takes 12+ seconds to stablize

Bad news: UDP + Wifi clearly won't work.
Good news: we discovered early enough. There is still time to pivot. Also, our communication isn't that coupled to sensor logic.

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

Miraculously, the migration worked on the first try.

## Integrating servo

Saetbeyol implemented the servo motor control. When I integrated her work, the servo could not respond to commands from the PC. We suspect I/O blocking.

After investigation, we realized that the communication loop is blocking.

```
  if (isBLEConnected()) {
    String sensorData = getSensorJSON();
    sendBLEMessage(sensorData); <-- need to disable this line in order to send any command to the ESP32, why?
  }
```

Solution, instead of blocking the main loop, we use a timer to send sensor data every 20ms.

The `20ms` interval is empirically determined. I don't feel confident about the solution but we proceeded and decided to revisit.

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

(Show initial servo dance video)

## Debugging MUX issue

We tested driving multiple servos through the MUX PWM PCA9685 board. The code behaved erratically. Later, we would find out that

- The MUX board was very sensitive. Touching with hand could trigger weird behavior.
- Our code didn't fully implement the MUX behavior.

Matti directed us to run the adafruit official MUX PWM PCA9685 library code.
We confirmed that the board wiring is correct, all servo motors are functional

We solved the issue by using Adadruit official library example code as starting point and not worrying about the board.

Matti also found out how to serial connect two MUX board by soldering the address pin to set one board at 0x41 instead of 0x40.

(Add a photo of the MUX board)

## Stress testing the BLE communication

We found out that rapidly sending BLE messages would the connection to drop.
Matti suggested we use different tx characteristic for namespaced communication, saving bandwidth from command names

## Systematic testing of BLE in Web Bluetooth API

Sending characters at high frequency triggered error:

```js
sendInterval = setInterval(async () => {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    await charTx.writeValue(data);
    log(`TX: ${message}`);
  } catch (error) {
    log(`SEND ERROR: ${error.message}`);
    stopSending();
  }
}, interval);
```

```txt
SEND ERROR: GATT operation already in progress.
```

This implies that flow control is needed. On the browser side, we can throttle or buffer the messages.

Reasoning:

- Throttling could help but throughput is environment dependent. We will end up being very conservative and losing performance.
- Buffering makes sense. We just need to make sure there is only one transmission at a time.

Solving flow control with a naive queue-based scheduler. Using the RxJS mergeMap operator, I could easily toggle between single-thread mode and unrestricted concurrency mode.

```js
const concurrency = useScheduler ? 1 : undefined;

const send$ = interval(intervalMs).pipe(
  takeUntil(stopBrowserSend$),
  tap(() => browserQueueSize++),
  mergeMap(async () => {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    await charTx.writeValue(data);

    browserQueueSize--;
    messageSent$.next();
    log(`[Test 1] TX: ${message}`);
  }, concurrency)
);
```

Based on this idea, I implemented a comprehensive diagnostic tool to profile the BLE performance.

## Characterize the performance:

The tool allows user to measure latency, throughput for varying message sizes.

(show screen recording)

### Best case, side by side same room

- Bandwdith:
  - Browser to ESP32: 14 messages/sec
  - ESP32 to Browser: 100 messages/sec
- Latency: 92 ms average, min: 84 ms, max: 140 ms
- Removing antenna did not reduce performance at close range, but as I walk away, performance drops quickly. Connection lost at 5 meters.

### At distance of 30 meters, through one glass wall

Unable to establish new connection at distance, but can tether previous connection to 30 meters

- Bandwidth:
  - Browser to ESP32: 8 messages/sec
  - ESP32 to Browser: 50 messages/sec
- Latency: 250 ms, min 89 ms, max 540 ms

### Realistic usage: inside metal icosahedron structure, at 10 meters distance

Browser -> ESP32: 14 messages per second
ESP32 -> Browser: 100 messages per second
Latency: 230 ms, min 157 ms, max 332 ms

## Integrate scheduler

- The diagnostic tool used RxJS. For production, I want to avoid adding more libraries. I implemented a stand alone scheduler that uses a queue to ensure single threaded execution of tasks
- I want the scheduler to be hidden behind the bluetooth module so the caller of the bluetooth module does not have to worry about scheduler and multiple callers of the bluetooth will be scheduled in a first in first out manner.

Core implementation:

```js
  /**
   * Add a task to the queue and process it
   * @param {Function} taskFn - Async function to execute
   * @returns {Promise} - Resolves when task completes
   */
  async enqueue(taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this.processQueue(); // After each task, check for more tasks
    });
  }

  /**
   * Process the queue sequentially
   */
  async processQueue() {
    // If already processing, return
    if (this.isProcessing) {
      return;
    }

    // If queue is empty, return
    if (this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const { taskFn, resolve, reject } = this.queue.shift();

      try {
        const result = await taskFn();
        resolve(result);
      } catch (error) {
        console.error("Task failed in scheduler:", error);
        reject(error); // The caller can ignore the rejection if they want.
      }
    }

    this.isProcessing = false;
  }
```

With the scheduler in place, I was able to dispatch the command at the high speed without causing BLE transmission errors.

## Servo doesn't move

EE team shared their production board. Observations:

- They arbitrarily set the I2C address, mismatching with our assumptions
- The channel numbers are not what we expected. Possible issues:
  - Our command is flawed
  - EE team gave us the wrong map
  - Our MUX logic is flawed
