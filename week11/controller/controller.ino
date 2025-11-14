#include "AsyncUDP.h"
#include "env.h"

AsyncUDP udp;
IPAddress targetIP(192, 168, 41, 229); // Target unicast address
const unsigned int targetPort = 41234;
int packetNum = 0;

void setup() {
  Serial.begin(115200);

  // Connect to WiFi
  setupWiFi();
  
  // Connect to target IP
  if (udp.connect(targetIP, targetPort)) {
    Serial.println("UDP connected");
    udp.onPacket([](AsyncUDPPacket packet) {
      // Print received packet content
      String msg = String((char*)packet.data(), packet.length());
      Serial.println("Received: " + msg);
    });
    // Send initial message
    udp.print("Hello Server!");
  }
}

void loop() {
  // Update sensor readings
  updateSensorData();
  
  // Send sensor data as JSON
  udp.print(getSensorJSON());
  
  delay(100);  // 10Hz = 100ms delay
}