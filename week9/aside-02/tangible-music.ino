#include "RotaryEncoder.h"

// Define the pins connected to the encoder
#define PIN_ENCODER_A D6
#define PIN_ENCODER_B D7

RotaryEncoder encoder(PIN_ENCODER_A, PIN_ENCODER_B);

int counter = 0;
unsigned long lastChangeTime = 0;
bool isChanging = false;
bool groupStarted = false;

void checkPosition() {
  encoder.tick(); // Call tick() to check the state
}

void setup() {
  Serial.begin(115200);
  Serial.println("Rotary Encoder Example");

  // Attach interrupts for encoder pins
  attachInterrupt(digitalPinToInterrupt(PIN_ENCODER_A), checkPosition, CHANGE);
  attachInterrupt(digitalPinToInterrupt(PIN_ENCODER_B), checkPosition, CHANGE);
}

void loop() {
  // Read encoder position
  int newPosition = encoder.getPosition();
  static int lastPosition = 0;

  if (newPosition != lastPosition) {
    lastPosition = newPosition;
    lastChangeTime = millis();
    isChanging = true;
    if (!groupStarted) {
      Serial.println("Position change group started");
      groupStarted = true;
    }
  }

  if (isChanging && (millis() - lastChangeTime > 100)) {
    counter++;
    Serial.print("Position change group ended, Counter: ");
    Serial.println(counter);
    isChanging = false;
    groupStarted = false;
  }
}