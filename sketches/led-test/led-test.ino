/*
ESP32 LED Pulse using PWM simulation by rapidly 
toggling LEDs on and off with varying on-time to control brightness.

Pinout:
LED1: D0
LED2: D1
LED3: D2
LED4: D3
LED5: D7
LED6: D8
LED7: D9
LED8: D10
*/



const int ledPins[] = {D0, D1, D2, D3, D7, D8, D9, D10};
const int numLeds = 8;

const int PULSE_DURATION = 500;

const int PERIOD_US = 5000;

void setup() {
  for (int i = 0; i < numLeds; i++) {
    pinMode(ledPins[i], OUTPUT);
    digitalWrite(ledPins[i], LOW);
  }
}

void loop() {
  for(int brightness = 0; brightness <= 255; brightness++) {
    int on_us = map(brightness, 0, 255, 0, 500);
    int off_us = PERIOD_US - on_us;
    for(int i = 0; i < numLeds; i++) {
      digitalWrite(ledPins[i], HIGH);
    }
    delayMicroseconds(on_us);
    for(int i = 0; i < numLeds; i++) {
      digitalWrite(ledPins[i], LOW);
    }
    delayMicroseconds(off_us);
    delay(1); 
  }
  
  for(int brightness = 255; brightness >= 0; brightness--) {
    int on_us = map(brightness, 0, 255, 0, 500); 
    int off_us = PERIOD_US - on_us;
    for(int i = 0; i < numLeds; i++) {
      digitalWrite(ledPins[i], HIGH);
    }
    delayMicroseconds(on_us);
    for(int i = 0; i < numLeds; i++) {
      digitalWrite(ledPins[i], LOW);
    }
    delayMicroseconds(off_us);
    delay(1);
  }
}