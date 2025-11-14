// Replace with your GATT UUIDs (example: Nordic UART Service)
const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // notifications from ESP32 (TX)
const RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // write to ESP32 (RX)

let charRx; // for receiving notifications (TX characteristic)
let charTx; // for sending data (RX characteristic)

async function connectESP32() {
  const device = await navigator.bluetooth.requestDevice({
    filters: [{ services: [SERVICE_UUID] }]
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(SERVICE_UUID);
  
  // Get TX characteristic for receiving notifications
  charRx = await service.getCharacteristic(TX_CHAR_UUID);
  window.charRx = charRx;
  
  // Get RX characteristic for sending data
  charTx = await service.getCharacteristic(RX_CHAR_UUID);
  window.charTx = charTx;

  // receive notifications
  await charRx.startNotifications();
  charRx.addEventListener('characteristicvaluechanged', (e) => {
    const v = e.target.value;           // DataView
    // decode as UTF-8 (or parse bytes as needed)
    const text = new TextDecoder().decode(v.buffer);
    console.log('ESP32>', text);
  });
}

async function sendToESP32(data) {
  const txChar = window.charTx || charTx;
  if (!txChar) {
    throw new Error('Not connected. Please connect first.');
  }
  const encoder = new TextEncoder();
  const dataArray = encoder.encode(data);
  await txChar.writeValue(dataArray);
  console.log('Sent to ESP32:', data);
}