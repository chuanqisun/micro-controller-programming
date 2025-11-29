- Revived walkie-talkie code from week 9. Without any UI
- Problem 1: IP discovery.
  - Laptop has hard coded IP address for ESP32
    - Solved by inspecting the `rinfo.address` of incoming UDP packets

```js
import * as dgram from "dgram";

const udpReceiver = dgram.createSocket("udp4");

udpReceiver.bind(8888);

udpReceiver.on("message", (msg, rinfo) => {
  // rinfo contains sender information
  const senderIp = rinfo.address; // Get sender's IP address
  const senderPort = rinfo.port; // Get sender's port

  console.log(`Received from ${senderIp}:${senderPort}`);
  console.log(`Data: ${msg.toString()}`);
});
```

- ESP32 has hard coded IP address for laptop
  - We are able to get laptop's IP address using OS network interface API within node.js
  - Let's build a web UI that allows the user to push the laptop IP address into ESP32
