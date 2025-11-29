import "./style.css";

declare global {
  interface Navigator {
    bluetooth: any;
  }
}

const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // notify: ESP32 -> browser
const RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // write: browser -> ESP32

const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement;
const disconnectBtn = document.getElementById("disconnectBtn") as HTMLButtonElement;
const statusSpan = document.getElementById("statusOp") as HTMLSpanElement;
const logDiv = document.getElementById("log") as HTMLDivElement;
const ipInput = document.getElementById("ipInput") as HTMLInputElement;
const fetchButton = document.getElementById("fetchButton") as HTMLButtonElement;
const rawProbeSpan = document.getElementById("rawProbe") as HTMLSpanElement;
const debouncedProbeSpan = document.getElementById("debouncedProbe") as HTMLSpanElement;
const ledNumberSpan = document.getElementById("ledNumber") as HTMLSpanElement;

let device: any = null;
let charTx: any = null;
let charRx: any = null;

function log(msg: string) {
  const timestamp = new Date().toISOString().substring(11, 23);
  logDiv.textContent += `[${timestamp}] ${msg}\n`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

function handleRxMessage(message: string) {
  // Handle incoming messages from Operator device
  // TODO: implement message handling logic
  log(`TX: ${message}`);
}

connectBtn.addEventListener("click", async () => {
  try {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth not supported");
    }

    log("Requesting Operator BLE device...");
    device = await navigator.bluetooth.requestDevice({
      filters: [{ name: "op" }],
      optionalServices: [SERVICE_UUID],
    });

    log(`Connecting to ${device.name || "device"}...`);
    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    charTx = await service.getCharacteristic(TX_CHAR_UUID);
    charRx = await service.getCharacteristic(RX_CHAR_UUID);

    await charTx.startNotifications();
    charTx.addEventListener("characteristicvaluechanged", (e: any) => {
      const text = new TextDecoder().decode(e.target.value.buffer);
      rawProbeSpan.textContent = text.trim();
      log(`RX: ${text.trim()}`);

      // Debounce: show different value after 500ms of no changes
      debouncedProbeSpan.textContent = text.trim();
      const num = parseInt(text.trim(), 2);
      ledNumberSpan.textContent = isNaN(num) ? "---" : num.toString();
    });

    // Subscribe to RX characteristic for incoming messages
    charRx.addEventListener("characteristicvaluechanged", (e: any) => {
      const text = new TextDecoder().decode(e.target.value.buffer);
      handleRxMessage(text.trim());
    });

    device.addEventListener("gattserverdisconnected", () => {
      log("Operator disconnected");
      statusSpan.textContent = "Disconnected";
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      device = null;
      charTx = null;
      charRx = null;
    });

    log("Operator connected");
    statusSpan.textContent = "Connected";
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    console.error(error);
  }
});

disconnectBtn.addEventListener("click", () => {
  if (device && device.gatt.connected) {
    device.gatt.disconnect();
    log("Operator disconnected by user");
    statusSpan.textContent = "Disconnected";
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    device = null;
    charTx = null;
    charRx = null;
  }
});

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
