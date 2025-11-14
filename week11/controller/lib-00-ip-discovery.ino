#include "HTTPClient.h"

const char* FIREBASE_URL = "https://htmaa-25-labubu-default-rtdb.firebaseio.com/config.json";

// Extract IP address from JSON string using simple string parsing
String extractIPFromJSON(String json) {
  // Look for "ip":"192.168.x.x" pattern
  int ipStart = json.indexOf("\"ip\"");
  if (ipStart == -1) return "";
  
  // Find the opening quote after "ip":
  int quoteStart = json.indexOf("\"", ipStart + 4);
  if (quoteStart == -1) return "";
  
  // Find the closing quote
  int quoteEnd = json.indexOf("\"", quoteStart + 1);
  if (quoteEnd == -1) return "";
  
  return json.substring(quoteStart + 1, quoteEnd);
}

// Fetch laptop IP from Firebase
bool discoverLaptopIP(IPAddress &targetIP) {
  HTTPClient http;
  
  Serial.println("Fetching laptop IP from Firebase...");
  http.begin(FIREBASE_URL);
  
  int httpCode = http.GET();
  
  if (httpCode == HTTP_CODE_OK) {
    String payload = http.getString();
    Serial.println("Received: " + payload);
    
    // Extract IP address from JSON
    String ipStr = extractIPFromJSON(payload);
    
    if (ipStr.length() == 0) {
      Serial.println("IP field not found in JSON");
      http.end();
      return false;
    }
    
    // Parse IP address string
    if (!targetIP.fromString(ipStr)) {
      Serial.println("Failed to parse IP address: " + ipStr);
      http.end();
      return false;
    }
    
    Serial.println("Discovered laptop IP: " + ipStr);
    http.end();
    return true;
  } else {
    Serial.println("HTTP GET failed, code: " + String(httpCode));
    http.end();
    return false;
  }
}
