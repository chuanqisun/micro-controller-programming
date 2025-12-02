/**
 * @file lib-03-udp.ino
 * @brief WiFi and UDP stream management for audio transmission and reception
 */

// =============================================================================
// WiFi Connection
// =============================================================================

void connectToWiFi() {
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
}

// =============================================================================
// UDP Stream Management - Lazy initialization and cleanup
// =============================================================================

void initializeUdp() {
  if (udpConfigured) {
    // UDP can only be initialized once
    Serial.println("UDP already configured, no action taken.");
    return;
  }
  
  Serial.println("Initializing UDP streams...");
  
  // Create new UDP instances
  udpSend = new UDPStream(WIFI_SSID, WIFI_PASSWORD);
  udpReceive = new UDPStream(WIFI_SSID, WIFI_PASSWORD);
  
  udpSend->begin(laptopAddress, laptopRxPort);
  udpReceive->begin(UDP_RECEIVE_PORT);

  // Create stream copiers
  transmitCopier = new StreamCopy(*udpSend, i2sMic);
  receiveCopier = new StreamCopy(i2sSpeaker, *udpReceive, 1024);

  udpConfigured = true;
  
  Serial.println("UDP initialized!");
  Serial.print("Laptop rx address: ");
  Serial.print(laptopAddress);
  Serial.print(":");
  Serial.println(laptopRxPort);
  Serial.print("Receive on port: ");
  Serial.println(UDP_RECEIVE_PORT);
}



// =============================================================================
// Audio Stream Processing
// =============================================================================

void processAudioStreams(bool isTransmitting) {
  if (!udpConfigured) {
    return;
  }

  if (isTransmitting && transmitCopier) {
    transmitCopier->copy();
  } else {
    // Drain mic buffer to prevent overflow when not transmitting
    uint8_t dummyBuffer[512];
    i2sMic.readBytes(dummyBuffer, sizeof(dummyBuffer));
  }
  
  if (receiveCopier) {
    receiveCopier->copy();
  }
}
