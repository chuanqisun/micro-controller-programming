// ESP32 BLE UART-style peripheral for LED control
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

const int ledPins[] = {D0, D1, D2, D3, D7, D8, D9, D10};
const int numLeds = 8;

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
            
            if (rxValue.startsWith("blink:")) {
                int ledIndex = rxValue.substring(6).toInt();
                if (ledIndex >= 0 && ledIndex < numLeds) {
                    Serial.print("Blinking LED ");
                    Serial.println(ledIndex);
                    digitalWrite(ledPins[ledIndex], HIGH);
                    delay(500);
                    digitalWrite(ledPins[ledIndex], LOW);
                    
                    // Send acknowledgment
                    String ack = "ACK:blinked " + String(ledIndex);
                    pTxCharacteristic->setValue((uint8_t*)ack.c_str(), ack.length());
                    pTxCharacteristic->notify();
                } else {
                    Serial.println("Invalid LED index");
                }
            } else if (rxValue.startsWith("on:")) {
                int ledIndex = rxValue.substring(3).toInt();
                if (ledIndex >= 0 && ledIndex < numLeds) {
                    Serial.print("Turning on LED ");
                    Serial.println(ledIndex);
                    digitalWrite(ledPins[ledIndex], HIGH);
                    
                    // Send acknowledgment
                    String ack = "ACK:on " + String(ledIndex);
                    pTxCharacteristic->setValue((uint8_t*)ack.c_str(), ack.length());
                    pTxCharacteristic->notify();
                } else {
                    Serial.println("Invalid LED index");
                }
            } else if (rxValue.startsWith("off:")) {
                String sub = rxValue.substring(4);
                if (sub == "all") {
                    Serial.println("Turning off all LEDs");
                    for (int i = 0; i < numLeds; i++) {
                        digitalWrite(ledPins[i], LOW);
                    }
                    String ack = "ACK:off all";
                    pTxCharacteristic->setValue((uint8_t*)ack.c_str(), ack.length());
                    pTxCharacteristic->notify();
                } else {
                    int ledIndex = sub.toInt();
                    if (ledIndex >= 0 && ledIndex < numLeds) {
                        Serial.print("Turning off LED ");
                        Serial.println(ledIndex);
                        digitalWrite(ledPins[ledIndex], LOW);
                        
                        // Send acknowledgment
                        String ack = "ACK:off " + String(ledIndex);
                        pTxCharacteristic->setValue((uint8_t*)ack.c_str(), ack.length());
                        pTxCharacteristic->notify();
                    } else {
                        Serial.println("Invalid LED index");
                    }
                }
            } else {
                Serial.println("Unknown command");
            }
        }
    }
};

void setup() {
    Serial.begin(115200);


    Serial.println("Starting TRRS address assignment...");
    pinMode(D6, OUTPUT);
    digitalWrite(D6, HIGH);


    Serial.println("Starting ESP32 BLE LED Control...");
    for (int i = 0; i < numLeds; i++) {
        pinMode(ledPins[i], OUTPUT);
        digitalWrite(ledPins[i], LOW);
    }

    // Initialize BLE
    BLEDevice::init("Switchboard");

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
    Serial.println("Device name: Switchboard");
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
    
    delay(10);
}