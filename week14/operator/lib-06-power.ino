/**
 * @file lib-06-power.ino
 * @brief Power management and device reset functionality
 */

// =============================================================================
// Reset Handler - Reboots the ESP32 device
// =============================================================================

void handleReset() {
  Serial.println("Initiating device reset...");
  delay(100);  // Ensure serial output is flushed
  ESP.restart();
}
