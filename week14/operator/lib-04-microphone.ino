/**
 * @file lib-04-microphone.ino
 * @brief I2S microphone initialization and configuration
 */

// =============================================================================
// I2S Microphone Setup
// =============================================================================

void initializeMicrophone() {
  Serial.println("Starting I2S microphone...");
  auto micConfig = i2sMic.defaultConfig(RX_MODE);
  micConfig.copyFrom(audioInfo);
  micConfig.pin_bck = I2S_BCLK;
  micConfig.pin_data = I2S_MIC_DATA;
  micConfig.pin_ws = I2S_LRC;
  micConfig.i2s_format = I2S_STD_FORMAT;

  if (!i2sMic.begin(micConfig)) {
    Serial.println("Failed to initialize I2S microphone");
    return;
  }
  
  Serial.println("I2S microphone initialized");
}
