#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// BLE UUIDs - these are standard for custom services
#define SERVICE_UUID        "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"

BLECharacteristic *pCharacteristic;
bool deviceConnected = false;
uint32_t counter = 0;

class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
    Serial.println("Device connected");
  }

  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    Serial.println("Device disconnected");
    // Restart advertising
    BLEDevice::startAdvertising();
    Serial.println("Advertising restarted");
  }
};

class MyCharacteristicCallbacks: public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *pCharacteristic) {
    String value = pCharacteristic->getValue().c_str();
    if (value.length() > 0) {
      Serial.println("====================================");
      Serial.println("Received from browser:");
      Serial.println(value);
      Serial.println("====================================");
    }
  }
};

void setup() {
  Serial.begin(115200);
  Serial.println("Starting BLE...");

  // Initialize BLE
  BLEDevice::init("ESP32-Counter");
  
  // Create BLE Server
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // Create BLE Service
  BLEService *pService = pServer->createService(SERVICE_UUID);

  // Create BLE Characteristic with notify and write properties
  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ |
    BLECharacteristic::PROPERTY_WRITE |
    BLECharacteristic::PROPERTY_NOTIFY
  );

  // Add descriptor for notifications
  pCharacteristic->addDescriptor(new BLE2902());
  
  // Set callback for receiving data
  pCharacteristic->setCallbacks(new MyCharacteristicCallbacks());

  // Start the service
  pService->start();

  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  
  Serial.println("BLE device is ready to be connected");
  Serial.println("Device name: ESP32-Counter");
}

void loop() {
  if (deviceConnected) {
    // Increment counter
    counter++;
    
    // Convert counter to string
    String value = String(counter);
    
    // Send notification
    pCharacteristic->setValue(value.c_str());
    pCharacteristic->notify();
    
    Serial.print("Sent: ");
    Serial.println(counter);
  }
  
  delay(1000); // Send every 1 second
}
