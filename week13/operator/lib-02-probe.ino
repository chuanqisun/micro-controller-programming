/**
 * @file lib-02-probe.ino
 * @brief TRRS probe status handling and BLE transmission
 */

// =============================================================================
// Probe Status - Read and transmit TRRS probe values
// =============================================================================

String readProbeValue() {
  String probeValue = "";
  for (int i = 0; i < NUM_TRRS_PINS; ++i) {
    int v = digitalRead(TRRS_PINS[i]);
    probeValue += (v == HIGH) ? "1" : "0";
  }
  return probeValue;
}

void sendProbeToBLE(String probeValue) {
  if (!deviceConnected || !pTxCharacteristic) {
    return;
  }
  
  String probe = "probe:" + probeValue;
  pTxCharacteristic->setValue((uint8_t*)probe.c_str(), probe.length());
  pTxCharacteristic->notify();
}
