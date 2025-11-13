const dgram = require("dgram");
const http = require("http");
const os = require("os");
const WebSocket = require("ws");

// Create UDP server
const udpServer = dgram.createSocket("udp4");

// Create HTTP server
const httpServer = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(HTML_PAGE);
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server: httpServer });

// Store connected WebSocket clients
const clients = new Set();

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");
  clients.add(ws);

  ws.on("message", (message) => {
    const data = message.toString();
    console.log(`WebSocket message received: ${data}`);

    // Send the message to the device via UDP
    if (lastDeviceAddress) {
      udpServer.send(data, lastDeviceAddress.port, lastDeviceAddress.address, (err) => {
        if (err) {
          console.error("Error sending UDP message:", err);
        } else {
          console.log(`Sent to device [${lastDeviceAddress.address}:${lastDeviceAddress.port}]: ${data}`);
        }
      });
    } else {
      console.warn("No device address known yet. Waiting for device to send data first.");
    }
  });

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
    clients.delete(ws);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
    clients.delete(ws);
  });
});

// Broadcast data to all connected WebSocket clients
function broadcast(data) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// Store last known device address
let lastDeviceAddress = null;

udpServer.on("message", (msg, rinfo) => {
  const data = msg.toString();
  console.log(`[${rinfo.address}:${rinfo.port}] ${data}`);

  // Remember the device address for sending messages back
  lastDeviceAddress = { address: rinfo.address, port: rinfo.port };

  // Broadcast to all connected WebSocket clients
  broadcast(data);
});

udpServer.on("listening", () => {
  const address = udpServer.address();
  const interfaces = os.networkInterfaces();
  let localIP = "127.0.0.1"; // fallback
  for (let iface in interfaces) {
    for (let addr of interfaces[iface]) {
      if (addr.family === "IPv4" && !addr.internal) {
        localIP = addr.address;
        break;
      }
    }
    if (localIP !== "127.0.0.1") break;
  }
  console.log(`UDP server listening on ${localIP}:${address.port}`);
  console.log("Waiting for data...");
});

udpServer.bind(41234); // Bind to port 41234

// Start HTTP/WebSocket server
const HTTP_PORT = 3000;
httpServer.listen(HTTP_PORT, () => {
  const interfaces = os.networkInterfaces();
  let localIP = "127.0.0.1";
  for (let iface in interfaces) {
    for (let addr of interfaces[iface]) {
      if (addr.family === "IPv4" && !addr.internal) {
        localIP = addr.address;
        break;
      }
    }
    if (localIP !== "127.0.0.1") break;
  }
  console.log(`Web server running at http://${localIP}:${HTTP_PORT}`);
  console.log(`Open http://localhost:${HTTP_PORT} in your browser`);
});

// HTML page with WebSocket client
const HTML_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Orientation Data Viewer</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 20px;
      padding: 40px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      max-width: 800px;
      width: 100%;
    }
    h1 {
      color: #333;
      margin-bottom: 30px;
      text-align: center;
      font-size: 2em;
    }
    .status {
      text-align: center;
      padding: 15px;
      border-radius: 10px;
      margin-bottom: 30px;
      font-weight: 600;
    }
    .status.connected {
      background: #d4edda;
      color: #155724;
    }
    .status.disconnected {
      background: #f8d7da;
      color: #721c24;
    }
    .data-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .data-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 25px;
      border-radius: 15px;
      box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
    }
    .data-label {
      font-size: 0.9em;
      opacity: 0.9;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .data-value {
      font-size: 2em;
      font-weight: bold;
    }
    .raw-data {
      background: #f8f9fa;
      border: 2px solid #dee2e6;
      border-radius: 10px;
      padding: 20px;
      font-family: 'Courier New', monospace;
      font-size: 0.9em;
      color: #495057;
      max-height: 200px;
      overflow-y: auto;
    }
    .raw-data-title {
      font-weight: bold;
      margin-bottom: 10px;
      color: #333;
    }
    .button-grid-section {
      margin-top: 30px;
      padding: 25px;
      background: #f8f9fa;
      border-radius: 10px;
      border: 2px solid #dee2e6;
    }
    .button-grid-section h2 {
      color: #333;
      font-size: 1.2em;
      margin-bottom: 15px;
      text-align: center;
    }
    .button-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
      max-width: 500px;
      margin: 0 auto 20px auto;
    }
    .button-grid button {
      padding: 20px;
      font-size: 20px;
      font-weight: bold;
      border: 3px solid #5c1a33;
      background: #d81159;
      color: #ffffff;
      cursor: pointer;
      border-radius: 5px;
      transition: all 0.2s ease;
    }
    .button-grid button:hover {
      background: #6a9bd4;
      border-color: #ff6b35;
    }
    .button-grid button.active {
      background: #c1ff31;
      color: #3f933f;
      border-color: #ff6b35;
    }
    .button-grid button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .send-section {
      margin-top: 30px;
      padding: 25px;
      background: #f8f9fa;
      border-radius: 10px;
      border: 2px solid #dee2e6;
    }
    .send-section h2 {
      color: #333;
      font-size: 1.2em;
      margin-bottom: 15px;
    }
    .input-group {
      display: flex;
      gap: 10px;
    }
    .input-group input {
      flex: 1;
      padding: 12px 15px;
      border: 2px solid #dee2e6;
      border-radius: 8px;
      font-size: 1em;
      font-family: 'Courier New', monospace;
    }
    .input-group input:focus {
      outline: none;
      border-color: #667eea;
    }
    .input-group button {
      padding: 12px 30px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1em;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .input-group button:hover {
      transform: translateY(-2px);
    }
    .input-group button:active {
      transform: translateY(0);
    }
    .input-group button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎮 Orientation Data Viewer</h1>
    <div id="status" class="status disconnected">Disconnected</div>
    
    <div class="data-grid">
      <div class="data-card">
        <div class="data-label">Pitch (X)</div>
        <div class="data-value" id="pitch">--</div>
      </div>
      <div class="data-card">
        <div class="data-label">Roll (Y)</div>
        <div class="data-value" id="roll">--</div>
      </div>
      <div class="data-card">
        <div class="data-label">Yaw (Z)</div>
        <div class="data-value" id="yaw">--</div>
      </div>
    </div>

    <div class="raw-data">
      <div class="raw-data-title">Raw Data Stream</div>
      <div id="rawData">Waiting for data...</div>
    </div>

    <div class="button-grid-section">
      <h2>🎲 D20 Actuator Control</h2>
      <div class="button-grid" id="buttonGrid"></div>
    </div>

    <div class="send-section">
      <h2>📤 Send to Device</h2>
      <div class="input-group">
        <input type="text" id="messageInput" placeholder="Enter message to send..." />
        <button id="sendButton" disabled>Send</button>
      </div>
    </div>
  </div>

  <script>
    const statusEl = document.getElementById('status');
    const pitchEl = document.getElementById('pitch');
    const rollEl = document.getElementById('roll');
    const yawEl = document.getElementById('yaw');
    const rawDataEl = document.getElementById('rawData');
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(protocol + '//' + window.location.host);

    ws.onopen = () => {
      console.log('WebSocket connected');
      statusEl.textContent = 'Connected';
      statusEl.className = 'status connected';
      sendButton.disabled = false;
      updateButtonStates(true);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      statusEl.textContent = 'Disconnected';
      statusEl.className = 'status disconnected';
      sendButton.disabled = true;
      updateButtonStates(false);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      const data = event.data;
      rawDataEl.textContent = data;

      // Try to parse orientation data
      // Expected format: "pitch:X,roll:Y,yaw:Z" or similar
      const pitchMatch = data.match(/pitch[:\\s]*([\\-\\d.]+)/i);
      const rollMatch = data.match(/roll[:\\s]*([\\-\\d.]+)/i);
      const yawMatch = data.match(/yaw[:\\s]*([\\-\\d.]+)/i);

      if (pitchMatch) {
        pitchEl.textContent = parseFloat(pitchMatch[1]).toFixed(2) + '°';
      }
      if (rollMatch) {
        rollEl.textContent = parseFloat(rollMatch[1]).toFixed(2) + '°';
      }
      if (yawMatch) {
        yawEl.textContent = parseFloat(yawMatch[1]).toFixed(2) + '°';
      }
    };

    // Create button grid
    const buttonGrid = document.getElementById('buttonGrid');
    for (let i = 1; i <= 20; i++) {
      const btn = document.createElement('button');
      btn.textContent = i;
      btn.disabled = true; // Start disabled
      btn.onclick = () => pushFace(i, btn);
      buttonGrid.appendChild(btn);
    }

    // Enable/disable buttons based on connection
    function updateButtonStates(enabled) {
      document.querySelectorAll('.button-grid button').forEach(btn => {
        btn.disabled = !enabled;
      });
    }

    function pushFace(faceNumber, button) {
      // Remove active class from all buttons
      document.querySelectorAll('.button-grid button').forEach(b => b.classList.remove('active'));
      
      // Add active class to clicked button
      button.classList.add('active');
      
      // Send the face number to the device
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(faceNumber.toString());
        console.log('Sent face number:', faceNumber);
      }
    }

    // Send message functionality
    function sendMessage() {
      const message = messageInput.value.trim();
      if (message && ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        console.log('Sent:', message);
        messageInput.value = '';
      }
    }

    sendButton.addEventListener('click', sendMessage);
    
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  </script>
</body>
</html>
`;
