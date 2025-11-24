// ESP32 BLE UART-style peripheral for probe data
// Based on Nordic UART Service

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Nordic UART Service UUIDs
#define UART_SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define UART_TX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // notify: ESP32 -> browser

BLEServer* pServer = NULL;
BLECharacteristic* pTxCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

const int inputPins[] = { D3, D4, D5 };
const char* inputNames[] = { "D3", "D4", "D5" };
const int numInputs = 3;

// Server callbacks
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        deviceConnected = true;
        Serial.println("Client connected");
    }

    void onDisconnect(BLEServer* pServer) {
        deviceConnected = false;
        Serial.println("Client disconnected");
    }
};

void setup() {
  Serial.begin(115200);
  delay(50);

  // Configure digital input pins
  for (int i = 0; i < numInputs; ++i) {
    pinMode(inputPins[i], INPUT_PULLUP);
    digitalWrite(inputPins[i], HIGH); // HIGH HIGH HIGH means unplugged
  }

  Serial.println("Starting ESP32 BLE Operator...");
  
  // Initialize BLE
  BLEDevice::init("op");

  // Create server
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Create service
  BLEService* pService = pServer->createService(UART_SERVICE_UUID);

  // Create TX characteristic (notify from ESP32 to browser)
  pTxCharacteristic = pService->createCharacteristic(
      UART_TX_UUID,
      BLECharacteristic::PROPERTY_NOTIFY
  );
  pTxCharacteristic->addDescriptor(new BLE2902());

  // Start service
  pService->start();

  // Start advertising
  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(UART_SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);
  BLEDevice::startAdvertising();
  
  Serial.println("BLE advertising started");
  Serial.println("Device name: op");
}

void loop() {
  // Handle connection state changes
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("Restarting advertising");
    oldDeviceConnected = deviceConnected;
  }
  
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  // Read and send probe data
  String probe = "";
  for (int i = 0; i < numInputs; ++i) {
    int v = digitalRead(inputPins[i]);
    probe += (v == HIGH) ? "1" : "0";
  }
  Serial.println(probe);
  
  if (deviceConnected) {
    pTxCharacteristic->setValue((uint8_t*)probe.c_str(), probe.length());
    pTxCharacteristic->notify();
  }
  
  delay(100);
}