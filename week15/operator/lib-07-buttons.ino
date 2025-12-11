/**
 * @file lib-07-buttons.ino
 * @brief Button handling with debounce and BLE transmission
 */

// =============================================================================
// Button State - Read and transmit debounced button values
// =============================================================================

int debounceCounter1 = 0;
int debounceCounter2 = 0;
bool btn1State = false;
bool btn2State = false;
String lastButtonsValue = "";

void updateButtonStates() {
  // Handle BTN_PTT1 debounce
  bool btn1Pressed = (digitalRead(BTN_PTT1) == LOW);
  if (btn1Pressed) {
    debounceCounter1++;
    if (debounceCounter1 >= DEBOUNCE_THRESHOLD) {
      btn1State = true;
      debounceCounter1 = DEBOUNCE_THRESHOLD;
    }
  } else {
    debounceCounter1--;
    if (debounceCounter1 <= -DEBOUNCE_THRESHOLD) {
      btn1State = false;
      debounceCounter1 = -DEBOUNCE_THRESHOLD;
    }
  }

  // Handle BTN_PTT2 debounce
  bool btn2Pressed = (digitalRead(BTN_PTT2) == LOW);
  if (btn2Pressed) {
    debounceCounter2++;
    if (debounceCounter2 >= DEBOUNCE_THRESHOLD) {
      btn2State = true;
      debounceCounter2 = DEBOUNCE_THRESHOLD;
    }
  } else {
    debounceCounter2--;
    if (debounceCounter2 <= -DEBOUNCE_THRESHOLD) {
      btn2State = false;
      debounceCounter2 = -DEBOUNCE_THRESHOLD;
    }
  }

  // Update isTransmitting (either button pressed)
  bool wasTransmitting = isTransmitting;
  isTransmitting = btn1State || btn2State;

  if (isTransmitting != wasTransmitting) {
    if (isTransmitting) {
      Serial.println("Speaking...");
    } else {
      Serial.println("Listening...");
    }
  }
}

void sendButtonsToBLE() {
  if (!deviceConnected || !pTxCharacteristic) {
    return;
  }

  String btn1Str = btn1State ? "on" : "off";
  String btn2Str = btn2State ? "on" : "off";
  String buttonsValue = btn1Str + "," + btn2Str;

  // Only send if value has changed
  if (buttonsValue == lastButtonsValue) {
    return;
  }

  lastButtonsValue = buttonsValue;
  String message = "buttons:" + buttonsValue;
  pTxCharacteristic->setValue((uint8_t*)message.c_str(), message.length());
  pTxCharacteristic->notify();
}
