/**
 * @file lib-05-speaker.ino
 * @brief I2S speaker initialization and mode switching
 */

// =============================================================================
// I2S Speaker Setup - Start I2S in TX (speaker) mode
// =============================================================================

bool startSpeaker() {
  Serial.println("Starting I2S in speaker (TX) mode...");
  auto speakerConfig = i2sStream.defaultConfig(TX_MODE);
  speakerConfig.copyFrom(audioInfo);
  speakerConfig.pin_bck = I2S_BCLK;
  speakerConfig.pin_data = I2S_SPEAKER_DATA;
  speakerConfig.pin_ws = I2S_LRC;
  speakerConfig.i2s_format = I2S_STD_FORMAT;

  if (!i2sStream.begin(speakerConfig)) {
    Serial.println("Failed to start I2S in TX (speaker) mode");
    return false;
  }
  
  // Recreate receive copier for UDP -> speaker
  if (receiveCopier) delete receiveCopier;
  if (udpReceive) {
    receiveCopier = new StreamCopy(i2sStream, *udpReceive, 1024);
  }
  
  Serial.println("I2S started in speaker (TX) mode");
  return true;
}

void switchToSpeaker() {
  Serial.println("Switching to SPEAKER mode");
  stopI2S();
  if (startSpeaker()) {
    micActive = false;
  } else {
    // On error, attempt to fall back into mic mode
    if (!startMicrophone()) {
      Serial.println("Error: cannot start mic or speaker");
    }
  }
}

void stopI2S() {
  i2sStream.end();
  delay(10);  // Give hardware time to settle
}
