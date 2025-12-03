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

const int ledPins[] = {D0, D7, D2, D9, D1, D8, D3};
const int numLeds = 7;
const int PERIOD_US = 1000;
const int FADE_STEP_MS = 1;  // Time between brightness steps

// Track LED on/off state
bool ledOn[7] = {false};

// Fade state for each LED
struct FadeState {
    bool active;
    bool fadingOn;      // true = fading on, false = fading off
    int brightness;     // 0-255
    unsigned long lastStepTime;
};
FadeState fadeStates[7];

// Global fade-all state
bool fadeAllActive = false;
int fadeAllBrightness = 255;
unsigned long fadeAllLastStepTime = 0;
bool fadeAllLedMask[7] = {false};  // Which LEDs to fade during fade-all

// Process one PWM cycle for all LEDs based on their current brightness
void processPwmCycle() {
    for (int i = 0; i < numLeds; i++) {
        if (fadeStates[i].active && fadeStates[i].brightness > 0) {
            int on_us = map(fadeStates[i].brightness, 0, 255, 0, PERIOD_US);
            int off_us = PERIOD_US - on_us;
            digitalWrite(ledPins[i], HIGH);
            delayMicroseconds(on_us);
            digitalWrite(ledPins[i], LOW);
            delayMicroseconds(off_us);
        }
    }
}

// Update fade states (called from loop)
void updateFades() {
    unsigned long now = millis();
    
    // Handle fade-all-off
    if (fadeAllActive) {
        if (now - fadeAllLastStepTime >= FADE_STEP_MS) {
            fadeAllLastStepTime = now;
            fadeAllBrightness--;
            
            int on_us = map(fadeAllBrightness, 0, 255, 0, PERIOD_US);
            int off_us = PERIOD_US - on_us;
            for (int i = 0; i < numLeds; i++) {
                if (fadeAllLedMask[i]) {
                    digitalWrite(ledPins[i], HIGH);
                }
            }
            delayMicroseconds(on_us);
            for (int i = 0; i < numLeds; i++) {
                if (fadeAllLedMask[i]) {
                    digitalWrite(ledPins[i], LOW);
                }
            }
            delayMicroseconds(off_us);
            
            if (fadeAllBrightness <= 0) {
                fadeAllActive = false;
                for (int i = 0; i < numLeds; i++) {
                    if (fadeAllLedMask[i]) {
                        digitalWrite(ledPins[i], LOW);
                        ledOn[i] = false;
                    }
                }
                // Send acknowledgment
                String ack = "ACK:fadeoff all";
                pTxCharacteristic->setValue((uint8_t*)ack.c_str(), ack.length());
                pTxCharacteristic->notify();
            }
        }
        return; // Don't process individual fades during fade-all
    }
    
    // Handle individual LED fades
    for (int i = 0; i < numLeds; i++) {
        if (fadeStates[i].active) {
            if (now - fadeStates[i].lastStepTime >= FADE_STEP_MS) {
                fadeStates[i].lastStepTime = now;
                
                // Do one PWM cycle at current brightness
                int on_us = map(fadeStates[i].brightness, 0, 255, 0, PERIOD_US);
                int off_us = PERIOD_US - on_us;
                if (fadeStates[i].brightness > 0) {
                    digitalWrite(ledPins[i], HIGH);
                    delayMicroseconds(on_us);
                    digitalWrite(ledPins[i], LOW);
                    delayMicroseconds(off_us);
                }
                
                // Update brightness
                if (fadeStates[i].fadingOn) {
                    fadeStates[i].brightness++;
                    if (fadeStates[i].brightness >= 255) {
                        fadeStates[i].active = false;
                        digitalWrite(ledPins[i], HIGH);  // Leave on
                        ledOn[i] = true;
                        String ack = "ACK:fadeon " + String(i);
                        pTxCharacteristic->setValue((uint8_t*)ack.c_str(), ack.length());
                        pTxCharacteristic->notify();
                    }
                } else {
                    fadeStates[i].brightness--;
                    if (fadeStates[i].brightness <= 0) {
                        fadeStates[i].active = false;
                        digitalWrite(ledPins[i], LOW);  // Leave off
                        ledOn[i] = false;
                        String ack = "ACK:fadeoff " + String(i);
                        pTxCharacteristic->setValue((uint8_t*)ack.c_str(), ack.length());
                        pTxCharacteristic->notify();
                    }
                }
            }
        }
    }
}

// Start fade on for a specific LED
void startFadeOn(int ledIndex) {
    fadeStates[ledIndex].active = true;
    fadeStates[ledIndex].fadingOn = true;
    fadeStates[ledIndex].brightness = 0;
    fadeStates[ledIndex].lastStepTime = millis();
}

// Start fade off for a specific LED (only if currently on)
void startFadeOff(int ledIndex) {
    if (!ledOn[ledIndex]) return;  // Skip if LED is not on
    fadeStates[ledIndex].active = true;
    fadeStates[ledIndex].fadingOn = false;
    fadeStates[ledIndex].brightness = 255;
    fadeStates[ledIndex].lastStepTime = millis();
}

// Start fade off for all LEDs (only those currently on)
void startFadeOffAll() {
    bool anyOn = false;
    for (int i = 0; i < numLeds; i++) {
        fadeAllLedMask[i] = ledOn[i];
        if (ledOn[i]) anyOn = true;
        fadeStates[i].active = false;  // Cancel any individual fades
    }
    if (!anyOn) {
        // No LEDs are on, send ACK immediately
        String ack = "ACK:fadeoff all";
        pTxCharacteristic->setValue((uint8_t*)ack.c_str(), ack.length());
        pTxCharacteristic->notify();
        return;
    }
    fadeAllActive = true;
    fadeAllBrightness = 255;
    fadeAllLastStepTime = millis();
}

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
                    ledOn[ledIndex] = true;
                    
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
                        ledOn[i] = false;
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
                        ledOn[ledIndex] = false;
                        
                        // Send acknowledgment
                        String ack = "ACK:off " + String(ledIndex);
                        pTxCharacteristic->setValue((uint8_t*)ack.c_str(), ack.length());
                        pTxCharacteristic->notify();
                    } else {
                        Serial.println("Invalid LED index");
                    }
                }
            } else if (rxValue.startsWith("fadeon:")) {
                int ledIndex = rxValue.substring(7).toInt();
                if (ledIndex >= 0 && ledIndex < numLeds) {
                    Serial.print("Fading on LED ");
                    Serial.println(ledIndex);
                    startFadeOn(ledIndex);
                } else {
                    Serial.println("Invalid LED index");
                }
            } else if (rxValue.startsWith("fadeoff:")) {
                String sub = rxValue.substring(8);
                if (sub == "all") {
                    Serial.println("Fading off all LEDs");
                    startFadeOffAll();
                } else {
                    int ledIndex = sub.toInt();
                    if (ledIndex >= 0 && ledIndex < numLeds) {
                        Serial.print("Fading off LED ");
                        Serial.println(ledIndex);
                        startFadeOff(ledIndex);
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
    BLEDevice::init("sw");

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
    Serial.println("Device name: sw");
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
    
    // Process non-blocking fades
    updateFades();
}