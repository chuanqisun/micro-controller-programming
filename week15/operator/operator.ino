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

const int SAMPLE_RATE = 16000;
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

// Single I2S stream - only one mode active at a time (mic OR speaker)
I2SStream i2sStream;
UDPStream* udpSend = nullptr;
UDPStream* udpReceive = nullptr;

StreamCopy* transmitCopier = nullptr;
StreamCopy* receiveCopier = nullptr;

bool isTransmitting = false;
bool micActive = false;  // Track current I2S mode

// Forward declarations
void handleBleMessage(String message);
void handleServerRxAddress(String message);
void initializeUdp();
void cleanupUdp();
void initializeBleUart();
void connectToWiFi();
void handleBleConnectionStateChange();
String readProbeValue();
void sendProbeToBLE(String probeValue);
void handleAnnounceSelfRxAddress(String message);
void processAudioStreams();
void updateButtonStates();
void sendButtonsToBLE();
bool startMicrophone();
bool startSpeaker();
void stopI2S();
void switchToMicrophone();
void switchToSpeaker();

// =============================================================================
// BLE Message Handler - Routes incoming messages based on type
// =============================================================================

void handleBleMessage(String message) {
  if (message.startsWith("reset:")) {
    handleReset();
  }
  if (message.startsWith("server:")) {
    handleServerRxAddress(message);
    handleAnnounceSelfRxAddress(message);
  }
}

void handleServerRxAddress(String message) {
  // Parse example:
  // server:192.168.1.100:8888

  String params = message.substring(7);
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

  // Start in speaker mode by default (listening when button not pressed)
  micActive = false;
  if (!startSpeaker()) {
    Serial.println("Speaker start failed - check board/config");
  }

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

  // Handle PTT buttons with debounce and send over BLE
  updateButtonStates();
  sendButtonsToBLE();

  // Switch I2S mode based on transmit state (button hold = mic, release = speaker)
  if (isTransmitting && !micActive) {
    switchToMicrophone();
  } else if (!isTransmitting && micActive) {
    switchToSpeaker();
  }

  // Process audio streams
  processAudioStreams();
}