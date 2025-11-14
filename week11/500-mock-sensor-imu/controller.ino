#include "WiFi.h"
#include "AsyncUDP.h"
#include "env.h"

AsyncUDP udp;
IPAddress targetIP(192, 168, 41, 229); // Target unicast address
const unsigned int targetPort = 41234;
int packetNum = 0;

void setup() {
  Serial.begin(115200);

  // Connect to WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startTime < 300000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi Failed");
    while (1) {
      delay(1000);
    }
  }
  Serial.println("Connected to WiFi");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  
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
  updateMockSensorData();
  udp.print(getSensorDataJSON());
  
  delay(100);  // 10Hz = 100ms delay
}