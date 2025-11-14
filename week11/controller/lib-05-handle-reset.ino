// Handle reset command
// Restarts the ESP32 device
void handle_reset(String cmd, String args) {
  if (cmd != "reset") return;
  
  Serial.println("Reset command received. Restarting device...");
  delay(100);  // Brief delay to allow serial print
  ESP.restart();
}
