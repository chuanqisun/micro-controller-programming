/**
 * @file lib-04-microphone.ino
 * @brief I2S microphone initialization and mode switching
 */

// =============================================================================
// I2S Microphone Setup - Start I2S in RX (microphone) mode
// =============================================================================

bool startMicrophone() {
  Serial.println("Starting I2S in mic (RX) mode...");
  auto micConfig = i2sStream.defaultConfig(RX_MODE);
  micConfig.copyFrom(audioInfo);
  micConfig.pin_bck = I2S_BCLK;
  micConfig.pin_data = I2S_MIC_DATA;
  micConfig.pin_ws = I2S_LRC;
  micConfig.i2s_format = I2S_STD_FORMAT;

  if (!i2sStream.begin(micConfig)) {
    Serial.println("Failed to start I2S in RX (mic) mode");
    return false;
  }
  
  // Recreate transmit copier for mic -> UDP
  if (transmitCopier) delete transmitCopier;
  if (udpSend) {
    transmitCopier = new StreamCopy(*udpSend, i2sStream);
  }
  
  Serial.println("I2S started in mic (RX) mode");
  return true;
}

void switchToMicrophone() {
  Serial.println("Switching to MICROPHONE mode");
  stopI2S();
  if (startMicrophone()) {
    micActive = true;
  } else {
    // On error, try to recover by restarting speaker
    startSpeaker();
    micActive = false;
  }
}
