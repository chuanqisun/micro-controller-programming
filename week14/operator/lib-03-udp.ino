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

  // Create stream copiers based on current I2S mode
  if (micActive) {
    transmitCopier = new StreamCopy(*udpSend, i2sStream);
  } else {
    receiveCopier = new StreamCopy(i2sStream, *udpReceive, 1024);
  }

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
// Audio Stream Processing - Only one stream active at a time
// =============================================================================

void processAudioStreams() {
  if (!udpConfigured) {
    return;
  }

  // Process only the active stream (mic OR speaker, never both)
  if (micActive && transmitCopier) {
    transmitCopier->copy();
  } else if (!micActive && receiveCopier) {
    receiveCopier->copy();
  }
}
