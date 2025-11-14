// ESP32 BLE UART-style peripheral that notifies the browser.
// Converted from MicroPython to Arduino

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// Nordic UART Service UUIDs
#define UART_SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define UART_TX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // notify: ESP32 -> browser
#define UART_RX_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // write: browser -> ESP32

BLEUUID serviceUUID(UART_SERVICE_UUID);
BLEUUID txUUID(UART_TX_UUID);
BLEUUID rxUUID(UART_RX_UUID);

BLEServer* pServer = NULL;
BLECharacteristic* pTxCharacteristic = NULL;
BLECharacteristic* pRxCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Callback for server events
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
        deviceConnected = true;
        Serial.println("Central connected");
    }

    void onDisconnect(BLEServer* pServer) {
        deviceConnected = false;
        Serial.println("Central disconnected");
    }
};

// Callback for RX characteristic (write from browser)
class MyRxCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic* pCharacteristic) {
        String rxValue = pCharacteristic->getValue();
        if (rxValue.length() > 0) {
            Serial.print("RX from browser: ");
            Serial.println(rxValue);
            
            // Check if received "b" command and send acknowledgement
            if (rxValue == "b") {
                Serial.println("Received 'b' command - sending acknowledgement");
                String ack = "ACK: b";
                pTxCharacteristic->setValue((uint8_t*)ack.c_str(), ack.length());
                pTxCharacteristic->notify();
            }
        }
    }
};

void setup() {
    Serial.begin(115200);
    Serial.println("Starting ESP32 BLE UART...");

    // Initialize BLE device
    BLEDevice::init("ESP32-UART");

    // Create BLE server
    pServer = BLEDevice::createServer();
    pServer->setCallbacks(new MyServerCallbacks());

    // Create BLE service
    BLEService* pService = pServer->createService(serviceUUID);

    // Create TX characteristic (notify)
    pTxCharacteristic = pService->createCharacteristic(
        txUUID,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    pTxCharacteristic->addDescriptor(new BLE2902());

    // Create RX characteristic (write)
    pRxCharacteristic = pService->createCharacteristic(
        rxUUID,
        BLECharacteristic::PROPERTY_WRITE
    );
    pRxCharacteristic->setCallbacks(new MyRxCallbacks());

    // Start the service
    pService->start();

    // Start advertising
    BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(serviceUUID);
    pAdvertising->setScanResponse(false);
    pAdvertising->setMinPreferred(0x0);  // set value to 0x00 to not advertise this parameter
    BLEDevice::startAdvertising();
    Serial.println("Advertising as ESP32-UART");
}

void loop() {
    // Handle disconnection
    if (!deviceConnected && oldDeviceConnected) {
        delay(500); // give the bluetooth stack the chance to get things ready
        pServer->startAdvertising(); // restart advertising
        Serial.println("Restarting advertising");
        oldDeviceConnected = deviceConnected;
    }
    
    // Handle connection
    if (deviceConnected && !oldDeviceConnected) {
        oldDeviceConnected = deviceConnected;
    }

    // Send 'a' every second when connected
    if (deviceConnected) {
        pTxCharacteristic->setValue((uint8_t*)"a", 1);
        pTxCharacteristic->notify();
        delay(1000);
    } else {
        delay(200);
    }
}

