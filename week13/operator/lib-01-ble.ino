/**
 * @file lib-01-ble.ino
 * @brief BLE UART communication library
 * Handles BLE server, connection callbacks, and message routing
 */

// Forward declarations for BLE message handler
void handleBleMessage(String message);
void sendAnnouncement();

// =============================================================================
// BLE Server Callbacks
// =============================================================================

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        deviceConnected = true;
        Serial.println("BLE Client connected");
    }

    void onDisconnect(BLEServer* pServer) {
        deviceConnected = false;
        Serial.println("BLE Client disconnected");
    }
};

// =============================================================================
// BLE RX Characteristic Callbacks - routes incoming messages
// =============================================================================

class MyCharacteristicCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String rxValue = pCharacteristic->getValue();
      
      if (rxValue.length() > 0) {
        Serial.print("RX: ");
        Serial.println(rxValue);
        handleBleMessage(rxValue);
      }
    }
};

// =============================================================================
// BLE UART Service Initialization
// =============================================================================

void initializeBleUart() {
  Serial.println("Starting BLE UART...");
  BLEDevice::init("op");
  
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService* pService = pServer->createService(UART_SERVICE_UUID);

  pTxCharacteristic = pService->createCharacteristic(
      UART_TX_UUID,
      BLECharacteristic::PROPERTY_NOTIFY
  );
  pTxCharacteristic->addDescriptor(new BLE2902());

  pRxCharacteristic = pService->createCharacteristic(
      UART_RX_UUID,
      BLECharacteristic::PROPERTY_WRITE
  );
  pRxCharacteristic->setCallbacks(new MyCharacteristicCallbacks());

  pService->start();

  BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(UART_SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);
  BLEDevice::startAdvertising();
  
  Serial.println("BLE UART advertising started");
}

// =============================================================================
// BLE Connection State Management
// =============================================================================

void handleBleConnectionStateChange() {
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("Restarting BLE advertising");
    oldDeviceConnected = deviceConnected;
  }
  
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
}

// =============================================================================
// Announce UDP Address - Sends ESP32's IP and port to paired device
// =============================================================================

void handleAnnounceSelfRxAddress(String message) {
  if (!pTxCharacteristic || WiFi.status() != WL_CONNECTED) {
    Serial.println("Cannot send announcement: WiFi not connected");
    return;
  }
  
  // Format: operator:192.168.1.101:8889
  String announcement = "operator:" + WiFi.localIP().toString() + ":" + String(UDP_RECEIVE_PORT);
  pTxCharacteristic->setValue(announcement.c_str());
  pTxCharacteristic->notify();
  
  Serial.print("Sent announcement: ");
  Serial.println(announcement);
}
