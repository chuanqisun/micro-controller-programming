#include "AsyncUDP.h"
#include "env.h"

AsyncUDP udp;
IPAddress targetIP(192, 168, 41, 229); // Target unicast address
const unsigned int targetPort = 41234;

void setup() {
  Serial.begin(115200);

  setupWiFi();
  
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
  // Update sensor readings
  updateSensorData();
  
  // Send sensor data as JSON
  udp.print(getSensorJSON());
  
  delay(100);  // 10Hz = 100ms delay
}