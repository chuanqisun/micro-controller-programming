#include "AsyncUDP.h"
#include "env.h"

AsyncUDP udp;
IPAddress targetIP; // Target unicast address (will be discovered)
const unsigned int targetPort = 41234;

void setup() {
  Serial.begin(115200);

  setupWiFi();
  
  // Discover laptop IP from Firebase
  if (!discoverLaptopIP(targetIP)) {
    Serial.println("Failed to discover laptop IP. Halting.");
    while (1) {
      delay(1000);
    }
  }
  
  if (udp.connect(targetIP, targetPort)) {
    Serial.println("UDP connected");
    udp.onPacket([](AsyncUDPPacket packet) {
      String msg = String((char*)packet.data(), packet.length());
      Serial.println("Received: " + msg);
      String cmd, args;
      if (!parseMessage(msg, cmd, args)) {
        Serial.println("Failed to parse message");
        return;
      }
      
      Serial.println("Command: " + cmd + ", Args: " + args);
      
      // Call all handlers in series, each handler choose what to do
      handle_move_servo(cmd, args);
      handle_reset(cmd, args);
    });
    
    udp.print("Hello Server!");
  }
}

void loop() {
  updateSensorData();
  
  udp.print(getSensorJSON());
  
  delay(100);  // 10Hz = 100ms delay
}