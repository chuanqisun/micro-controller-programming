import { Subject, debounceTime, distinctUntilChanged } from "rxjs";
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
const resetBtn = document.getElementById("reset") as HTMLButtonElement;
const logDiv = document.getElementById("log") as HTMLDivElement;
const serverAddressSpan = document.getElementById("serverAddress") as HTMLSpanElement;
const operatorAddressSpan = document.getElementById("operatorAddress") as HTMLSpanElement;
const rawProbeSpan = document.getElementById("rawProbe") as HTMLSpanElement;
const debouncedProbeSpan = document.getElementById("debouncedProbe") as HTMLSpanElement;
const ledNumberSpan = document.getElementById("ledNumber") as HTMLSpanElement;

let device: any = null;
let charTx: any = null;
let charRx: any = null;
let probeSubject: Subject<string> | null = null;

function log(msg: string) {
  const timestamp = new Date().toISOString().substring(11, 23);
  logDiv.textContent += `[${timestamp}] ${msg}\n`;
  logDiv.scrollTop = logDiv.scrollHeight;
}

function sendMessage(message: string) {
  if (!charRx) {
    log("ERROR: Not connected");
    return;
  }
  const encoder = new TextEncoder();
  charRx.writeValue(encoder.encode(message));
  log(`TX: ${message}`);
}

function clearUIFields() {
  operatorAddressSpan.textContent = "---";
  rawProbeSpan.textContent = "---";
  debouncedProbeSpan.textContent = "---";
  ledNumberSpan.textContent = "---";
}

function handleRxMessage(message: string) {
  // Handle incoming messages from Operator device
  if (message.startsWith("probe:")) {
    const probeValue = message.substring(6);
    rawProbeSpan.textContent = probeValue;
    if (probeSubject) {
      probeSubject.next(probeValue);
    }
  }
  if (message.startsWith("operator:")) {
    const address = message.substring(9);
    operatorAddressSpan.textContent = address;
    // Send operator address to server
    fetch(`http://localhost:3000/api/locate-operator?address=${encodeURIComponent(address)}`, {
      method: "POST",
    }).catch((error) => {
      console.error("Failed to POST locate-operator:", error);
    });
  }
  log(`RX: ${message}`);
}

connectBtn.addEventListener("click", async () => {
  try {
    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth not supported");
    }

    // Initialize probe subject with debouncing
    probeSubject = new Subject<string>();
    probeSubject.pipe(distinctUntilChanged(), debounceTime(500)).subscribe((probeValue) => {
      debouncedProbeSpan.textContent = probeValue;
      const num = parseInt(probeValue, 2);

      ledNumberSpan.textContent = isNaN(num) ? "---" : num.toString();

      // POST to server when LED number changes
      if (num === 7) {
        fetch(`http://localhost:3000/api/unplug`, {
          method: "POST",
        }).catch((error) => {
          console.error("Failed to POST unplug:", error);
        });
      } else if (!isNaN(num)) {
        fetch(`http://localhost:3000/api/probe?id=${num}`, {
          method: "POST",
        }).catch((error) => {
          console.error("Failed to POST probe:", error);
        });
      }
    });

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
      handleRxMessage(text.trim());
    });

    // Subscribe to RX characteristic for incoming messages
    charRx.addEventListener("characteristicvaluechanged", (e: any) => {
      const text = new TextDecoder().decode(e.target.value.buffer);
      handleRxMessage(text.trim());
    });

    device.addEventListener("gattserverdisconnected", () => {
      log("Operator disconnected");
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
      device = null;
      charTx = null;
      charRx = null;
      clearUIFields();
      if (probeSubject) {
        probeSubject.complete();
        probeSubject = null;
      }
    });

    log("Operator connected");
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;

    // Send server address in format: server:<ip>:<udp_rx_port>
    const serverAddress = serverAddressSpan.textContent;
    if (serverAddress && serverAddress !== "---" && serverAddress !== "Error") {
      try {
        const url = new URL(`http://${serverAddress}`);
        const message = `server:${url.hostname}:${url.port}`;
        sendMessage(message);
      } catch (error) {
        log("ERROR: Invalid server address format");
      }
    } else {
      log("WARNING: Server address not available yet");
    }
  } catch (error: any) {
    log(`ERROR: ${error.message}`);
    console.error(error);
  }
});

disconnectBtn.addEventListener("click", () => {
  if (device && device.gatt.connected) {
    device.gatt.disconnect();
    log("Operator disconnected by user");
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
    device = null;
    charTx = null;
    charRx = null;
    clearUIFields();
    if (probeSubject) {
      probeSubject.complete();
      probeSubject = null;
    }
  }
});

resetBtn.addEventListener("click", () => {
  sendMessage("reset:");
});

// Fetch server IP on page load
async function initializePage() {
  try {
    const response = await fetch("http://localhost:3000/api/origin");
    const data = await response.json();
    serverAddressSpan.textContent = data.host;
  } catch (error) {
    console.error("Failed to fetch origin on page load:", error);
    serverAddressSpan.textContent = "Error";
  }
}

document.addEventListener("DOMContentLoaded", initializePage);
