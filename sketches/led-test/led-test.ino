/*
 * ESP32 LED Sequencer
 * 
 * Pinout:
 * LED1: GPIO 0
 */

// --- Configuration ---

// Define the GPIO pin for the LED
const int ledPin = D0;

// Time to keep each LED on (in milliseconds)
const int ON_DURATION = 500;
const int OFF_DURATION = 500;

void setup() {
  // Initialize the pin as output
  pinMode(ledPin, OUTPUT);
  digitalWrite(ledPin, LOW); // Ensure it starts OFF
  Serial.begin(115200);
}

void loop() {
  // Turn the LED ON
  digitalWrite(ledPin, HIGH);
  Serial.println("LED 1 ON");
  
  // Wait for the specified duration
  delay(ON_DURATION);
  
  // Turn the LED OFF
  digitalWrite(ledPin, LOW);
  Serial.println("LED 1 OFF");

  delay(OFF_DURATION);
  
  // Loop restarts immediately
}