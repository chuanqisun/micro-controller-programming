#include <WiFi.h>
#include <WiFiUdp.h>

const char* WIFI_PASSWORD = "";

WiFiUDP udp;

void setup() {
  Serial.begin(115200);

  // Connect to WiFi
  WiFi.begin("MLDEV", WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    Serial.println("Connecting to WiFi...");
  }
  Serial.println("Connected to WiFi");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  
  udp.begin(0);
}

void loop() {
  udp.beginPacket("192.168.41.141", 5005);
  udp.print("hello world");
  udp.endPacket();
  
  Serial.println("Sent: hello world");
  delay(1000); // Send every second
}