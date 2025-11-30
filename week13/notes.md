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

- Updated solution, an automatd protocol to exchange ip between server and operator
  - A single round of handshake
    - Web -> Server: request server address
    - Server -> Web: send self address
    - Web -> Operator: send server address
    - Operator -> Web: send self address
    - Web -> Server: send operator address
- See screenshot v2

web

```js
// Fetch server IP on page load
const response = await fetch("http://localhost:3000/api/origin");
const data = await response.json();
serverAddressSpan.textContent = data.host;

// After Operator BLE connects, send server address
const message = `server:${url.hostname}:${url.port}`;
sendMessage(message);

// Receive operator address from device
if (message.startsWith("operator:")) {
  const address = message.substring(9);
  operatorAddressSpan.textContent = address;
  fetch(`http://localhost:3000/api/locate-operator?address=${encodeURIComponent(address)}`, {
    method: "POST",
  });
}
```

operator

```cpp
// Receive server address from web
void handleRxMessage(String msg) {
  if (msg.startsWith("server:")) {
    String serverIp = msg.substring(7, msg.lastIndexOf(':'));
    int port = msg.substring(msg.lastIndexOf(':') + 1).toInt();
    // Store and use for UDP
    setupUDP(serverIp.c_str(), port);
  }
}

// Send operator address to web for registration
void sendOperatorAddress() {
  String myIP = WiFi.localIP().toString();
  sendBLE("operator:" + myIP);
}
```

- Added Switchboard UI
  - Basic connection testing features from Networking week
  - See screenshot v3

- Trigger speak from web UI
  - We want the web UI to have the latest speech content
  - Added SSE endpoint on node.js server, so we can push speech content to web with minimum latency
  - Added new endpoints to hande speech content from the web UI

```js
// Server: SSE endpoint for pushing events to web
if (req.url === "/api/events") {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  sseClients.push({ res });
  req.on("close", () => {
    sseClients = sseClients.filter((c) => c.res !== res);
  });
}

// Server: /api/speak endpoint - triggers speech synthesis
else if (req.url === "/api/speak") {
  const { text, voice } = JSON.parse(body);
  await synthesizeAndStreamSpeech(text, voice);
  emitServerEvent(text); // Push to SSE clients
}

// Web: Listen to SSE stream
const eventSource = new EventSource("http://localhost:3000/api/events");
eventSource.onmessage = (event) => {
  logDiv.textContent += `[${timestamp}] SSE: ${event.data}\n`;
};

// Web: Trigger speak from UI
speakBtn.addEventListener("click", async () => {
  const text = speakTextarea.value.trim();
  const response = await fetch("http://localhost:3000/api/speak", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
});
```
