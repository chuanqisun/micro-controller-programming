// ESP32 BLE UART-style peripheral for testing
// Based on Nordic UART Service

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Nordic UART Service UUIDs
#define UART_SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define UART_TX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // notify: ESP32 -> browser
#define UART_RX_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // write: browser -> ESP32

BLEServer* pServer = NULL;
BLECharacteristic* pTxCharacteristic = NULL;
BLECharacteristic* pRxCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Echo state
bool echoActive = false;
String echoMessage = "";
unsigned long echoInterval = 1000;
unsigned long lastEchoTime = 0;

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

// RX characteristic callback (receives from browser)
class MyRxCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* pCharacteristic) {
        String rxValue = pCharacteristic->getValue();
        if (rxValue.length() > 0) {
            Serial.print("Received: ");
            Serial.println(rxValue);
            
            // Check if this is a command for Test 2 (START/STOP)
            if (rxValue.startsWith("START:")) {
                // Format: START:message:interval
                int firstColon = rxValue.indexOf(':');
                int secondColon = rxValue.indexOf(':', firstColon + 1);
                
                if (secondColon > 0) {
                    echoMessage = rxValue.substring(firstColon + 1, secondColon);
                    String intervalStr = rxValue.substring(secondColon + 1);
                    echoInterval = intervalStr.toInt();
                    
                    if (echoInterval < 1) echoInterval = 1000;
                    if (echoInterval > 10000) echoInterval = 10000;
                    
                    echoActive = true;
                    lastEchoTime = millis();
                    
                    Serial.print("[Test 2] Started echo: '");
                    Serial.print(echoMessage);
                    Serial.print("' every ");
                    Serial.print(echoInterval);
                    Serial.println("ms");
                    
                    // Send acknowledgment
                    String ack = "ACK:STARTED";
                    pTxCharacteristic->setValue((uint8_t*)ack.c_str(), ack.length());
                    pTxCharacteristic->notify();
                }
            } else if (rxValue == "STOP") {
                echoActive = false;
                echoMessage = "";
                Serial.println("[Test 2] Stopped echo");
                
                // Send acknowledgment
                String ack = "ACK:STOPPED";
                pTxCharacteristic->setValue((uint8_t*)ack.c_str(), ack.length());
                pTxCharacteristic->notify();
            } else {
                // Test 1: Just received a regular message from browser
                Serial.print("[Test 1] Received from browser: ");
                Serial.println(rxValue);
                
                // Echo it back with ACK prefix
                String response = "ACK:" + rxValue;
                pTxCharacteristic->setValue((uint8_t*)response.c_str(), response.length());
                pTxCharacteristic->notify();
            }
        }
    }
};

void setup() {
    Serial.begin(115200);
    Serial.println("Starting ESP32 BLE Test...");

    // Initialize BLE
    BLEDevice::init("ESP32-BLE-Test");

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

    // Create RX characteristic (write from browser to ESP32)
    pRxCharacteristic = pService->createCharacteristic(
        UART_RX_UUID,
        BLECharacteristic::PROPERTY_WRITE
    );
    pRxCharacteristic->setCallbacks(new MyRxCallbacks());

    // Start service
    pService->start();

    // Start advertising
    BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(UART_SERVICE_UUID);
    pAdvertising->setScanResponse(false);
    pAdvertising->setMinPreferred(0x0);
    BLEDevice::startAdvertising();
    
    Serial.println("BLE advertising started");
    Serial.println("Device name: ESP32-BLE-Test");
}

void loop() {
    // Handle connection state changes
    if (!deviceConnected && oldDeviceConnected) {
        delay(500);
        pServer->startAdvertising();
        Serial.println("Restarting advertising");
        oldDeviceConnected = deviceConnected;
        // Reset echo state on disconnect
        echoActive = false;
        echoMessage = "";
    }
    
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
    }

    // Test 2: Send echo message at specified interval when active
    if (deviceConnected && echoActive) {
        if (millis() - lastEchoTime >= echoInterval) {
            pTxCharacteristic->setValue((uint8_t*)echoMessage.c_str(), echoMessage.length());
            pTxCharacteristic->notify();
            Serial.print("[Test 2] Sent echo: ");
            Serial.println(echoMessage);
            lastEchoTime = millis();
        }
    }
    
    delay(10);
}
