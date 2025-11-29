/**
 * @file operator.ino
 * @brief Full-duplex walkie-talkie with BLE UART: transmit on button press, receive when idle
 * Also provides TRRS probe status over BLE
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "AudioTools.h"
#include "AudioTools/Communication/UDPStream.h"
#include "env.h"

// Nordic UART Service UUIDs
#define UART_SERVICE_UUID "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define UART_TX_UUID      "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // notify: ESP32 -> browser
#define UART_RX_UUID      "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // write: browser -> ESP32

const int SAMPLE_RATE = 24000;
const int CHANNELS = 1;
const int BITS_PER_SAMPLE = 16;
const int UDP_SEND_PORT = 8888;
const int UDP_RECEIVE_PORT = 8889;

const int BTN_PTT1 = D8;
const int BTN_PTT2 = D9;
const int DEBOUNCE_THRESHOLD = 5;

const int I2S_BCLK = D0;
const int I2S_MIC_DATA = D1;
const int I2S_SPEAKER_DATA = D10;
const int I2S_LRC = D2;

// TRRS probe pins
const int TRRS_PINS[] = { D3, D4, D5 };
const int NUM_TRRS_PINS = 3;

IPAddress laptopAddress(10, 0, 0, 33);

// BLE Variables
BLEServer* pServer = NULL;
BLECharacteristic* pTxCharacteristic = NULL;
BLECharacteristic* pRxCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Audio Variables
AudioInfo audioInfo(SAMPLE_RATE, CHANNELS, BITS_PER_SAMPLE);

I2SStream i2sMic;
I2SStream i2sSpeaker;
UDPStream udpSend(WIFI_SSID, WIFI_PASSWORD);
UDPStream udpReceive(WIFI_SSID, WIFI_PASSWORD);
Throttle throttle(udpSend);

StreamCopy transmitCopier(throttle, i2sMic);
StreamCopy receiveCopier(i2sSpeaker, udpReceive, 1024);

int debounceCounter = 0;
bool isTransmitting = false;
bool lastTransmitState = false;

// BLE Server Callbacks
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

// RX Characteristic Callbacks
class MyCharacteristicCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String rxValue = pCharacteristic->getValue();
      
      if (rxValue.length() > 0) {
        // TODO: implement message handling logic
        Serial.print("RX: ");
        Serial.println(rxValue);
      }
    }
};

void setup() {
  Serial.begin(115200);
  delay(1000);
  AudioToolsLogger.begin(Serial, AudioToolsLogLevel::Warning);

  // Configure TRRS probe pins
  for (int i = 0; i < NUM_TRRS_PINS; ++i) {
    pinMode(TRRS_PINS[i], INPUT_PULLUP);
    digitalWrite(TRRS_PINS[i], HIGH);
  }

  pinMode(BTN_PTT1, INPUT_PULLUP);
  pinMode(BTN_PTT2, INPUT_PULLUP);

  // Initialize BLE
  Serial.println("Starting BLE...");
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
  
  Serial.println("BLE advertising started");

  Serial.println("\nConnecting to WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nFailed to connect to WiFi");
    return;
  }

  Serial.println("\nWiFi connected!");
  Serial.print("Device IP: ");
  Serial.println(WiFi.localIP());

  Serial.println("Starting I2S microphone...");
  auto micConfig = i2sMic.defaultConfig(RX_MODE);
  micConfig.copyFrom(audioInfo);
  micConfig.pin_bck = I2S_BCLK;
  micConfig.pin_data = I2S_MIC_DATA;
  micConfig.pin_ws = I2S_LRC;
  micConfig.i2s_format = I2S_STD_FORMAT;

  if (!i2sMic.begin(micConfig)) {
    Serial.println("Failed to initialize I2S microphone");
    return;
  }

  Serial.println("Starting I2S speaker...");
  auto speakerConfig = i2sSpeaker.defaultConfig(TX_MODE);
  speakerConfig.copyFrom(audioInfo);
  speakerConfig.pin_bck = I2S_BCLK;
  speakerConfig.pin_data = I2S_SPEAKER_DATA;
  speakerConfig.pin_ws = I2S_LRC;
  speakerConfig.i2s_format = I2S_STD_FORMAT;

  if (!i2sSpeaker.begin(speakerConfig)) {
    Serial.println("Failed to initialize I2S speaker");
    return;
  }

  Serial.println("I2S initialized successfully");

  Serial.println("Starting UDP streams...");
  udpSend.begin(laptopAddress, UDP_SEND_PORT);
  udpReceive.begin(UDP_RECEIVE_PORT);

  auto throttleConfig = throttle.defaultConfig();
  throttleConfig.copyFrom(audioInfo);
  throttle.begin(throttleConfig);

  Serial.println("Walkie-talkie + BLE ready!");
  Serial.print("Transmit target: ");
  Serial.print(laptopAddress);
  Serial.print(":");
  Serial.println(UDP_SEND_PORT);
  Serial.print("Receive on port: ");
  Serial.println(UDP_RECEIVE_PORT);
}

void loop() {
  // Handle BLE connection state changes
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("Restarting BLE advertising");
    oldDeviceConnected = deviceConnected;
  }
  
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  // Read TRRS probe and send over BLE
  String probe = "";
  for (int i = 0; i < NUM_TRRS_PINS; ++i) {
    int v = digitalRead(TRRS_PINS[i]);
    probe += (v == HIGH) ? "1" : "0";
  }
  
  if (deviceConnected) {
    pTxCharacteristic->setValue((uint8_t*)probe.c_str(), probe.length());
    pTxCharacteristic->notify();
  }

  // Handle PTT button with debounce
  bool buttonPressed = (digitalRead(BTN_PTT1) == LOW || digitalRead(BTN_PTT2) == LOW);
  
  if (buttonPressed) {
    debounceCounter++;
    if (debounceCounter >= DEBOUNCE_THRESHOLD) {
      isTransmitting = true;
      debounceCounter = DEBOUNCE_THRESHOLD;
    }
  } else {
    debounceCounter--;
    if (debounceCounter <= -DEBOUNCE_THRESHOLD) {
      isTransmitting = false;
      debounceCounter = -DEBOUNCE_THRESHOLD;
    }
  }

  if (isTransmitting != lastTransmitState) {
    if (isTransmitting) {
      Serial.println("Speaking...");
    } else {
      Serial.println("Listening...");
    }
    lastTransmitState = isTransmitting;
  }

  // Full-duplex: always handle both transmit and receive
  if (isTransmitting) {
    transmitCopier.copy();
  }
  
  // Always listen for incoming audio
  receiveCopier.copy();
  
  delay(10);
}