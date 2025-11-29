/**
 * @file lib-05-speaker.ino
 * @brief I2S speaker initialization and configuration
 */

// =============================================================================
// I2S Speaker Setup
// =============================================================================

void initializeSpeaker() {
  Serial.println("Starting I2S speaker...");
  auto speakerConfig = i2sSpeaker.defaultConfig(TX_MODE);
  speakerConfig.copyFrom(audioInfo);
  speakerConfig.pin_bck = I2S_BCLK;
  speakerConfig.pin_data = I2S_SPEAKER_DATA;
  speakerConfig.pin_ws = I2S_LRC;
  speakerConfig.i2s_format = I2S_STD_FORMAT;

  if (!i2sSpeaker.begin(speakerConfig)) {
    Serial.println("Failed to initialize I2S speaker");
    return;
  }
  
  Serial.println("I2S speaker initialized");
}
