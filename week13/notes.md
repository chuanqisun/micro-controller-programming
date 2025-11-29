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

Server

```js
import * as os from "os";
import express from "express";

const app = express();

app.get("/api/origin", (req, res) => {
  const interfaces = os.networkInterfaces();
  const ipv4 = Object.values(interfaces)
    .flat()
    .find((addr) => addr.family === "IPv4" && !addr.internal);

  res.json({ host: ipv4?.address || "localhost" });
});

app.listen(3000);
```

Web UI

```ts
const ipInput = document.getElementById("ipInput") as HTMLInputElement;
const fetchButton = document.getElementById("fetchButton") as HTMLButtonElement;

fetchButton.addEventListener("click", async () => {
  try {
    const response = await fetch("http://localhost:3000/api/origin");
    const data = await response.json();
    ipInput.value = data.host;
  } catch (error) {
    console.error("Failed to fetch origin:", error);
    ipInput.value = "Error fetching origin";
  }
});
```

## TODO

operator send probe only when changed
