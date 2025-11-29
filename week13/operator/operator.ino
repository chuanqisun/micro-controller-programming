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

// UDP configuration (set via BLE)
IPAddress laptopAddress;
int laptopRxPort = 0;
bool udpConfigured = false;

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
UDPStream* udpSend = nullptr;
UDPStream* udpReceive = nullptr;
Throttle* throttle = nullptr;

StreamCopy* transmitCopier = nullptr;
StreamCopy* receiveCopier = nullptr;

int debounceCounter = 0;
bool isTransmitting = false;
bool lastTransmitState = false;

// Forward declarations
void handleBleMessage(String message);
void handleSetOriginMessage(String message);
void initializeUdp();
void cleanupUdp();
void initializeBleUart();
void connectToWiFi();
void handleBleConnectionStateChange();
String readProbeValue();
void sendProbeToBLE(String probeValue);
void processAudioStreams(bool isTransmitting);

// =============================================================================
// BLE Message Handler - Routes incoming messages based on type
// =============================================================================

void handleBleMessage(String message) {
  if (message.startsWith("setorigin:")) {
    handleSetOriginMessage(message);
  }
  if (message.startsWith("reset:")) {
    handleReset();
  }
}

void handleSetOriginMessage(String message) {
  // Parse example:
  // setorigin:192.168.1.100:8888
  String params = message.substring(10);
  int colonPos = params.indexOf(':');
  
  if (colonPos > 0) {
    String ipStr = params.substring(0, colonPos);
    String portStr = params.substring(colonPos + 1);
    
    // Parse IP address
    int ip1, ip2, ip3, ip4;
    if (sscanf(ipStr.c_str(), "%d.%d.%d.%d", &ip1, &ip2, &ip3, &ip4) == 4) {
      laptopAddress = IPAddress(ip1, ip2, ip3, ip4);
      laptopRxPort = portStr.toInt();
      
      Serial.print("Laptop address set to: ");
      Serial.print(laptopAddress);
      Serial.print(":");
      Serial.println(laptopRxPort);
      
      initializeUdp();
    } else {
      Serial.println("ERROR: Invalid IP format");
    }
  } else {
    Serial.println("ERROR: Invalid setorigin format");
  }
}

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
  initializeBleUart();
  
  connectToWiFi();

  // Initialize audio I/O
  initializeMicrophone();
  initializeSpeaker();

  Serial.println("Walkie-talkie + BLE ready!");
  Serial.println("Waiting for laptop address via BLE...");
}

void loop() {
  // Handle BLE connection state
  handleBleConnectionStateChange();

  // Only proceed if UDP is configured
  if (!udpConfigured) {
    delay(100);
    return;
  }

  // Read TRRS probe and send over BLE
  sendProbeToBLE(readProbeValue());

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

  // Process audio streams
  processAudioStreams(isTransmitting);
  
  delay(10);
}