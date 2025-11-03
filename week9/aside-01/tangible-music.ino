#include <RotaryEncoder.h>

// Define the pins connected to the encoder
#define PIN_ENCODER_A D6
#define PIN_ENCODER_B D7

RotaryEncoder encoder(PIN_ENCODER_A, PIN_ENCODER_B);

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
    Serial.print("Encoder Position: ");
    Serial.println(newPosition);
    lastPosition = newPosition;
  }

  delay(10); // Debounce or prevent overwhelming serial
}
