void setup() {
  Serial.begin(115200);

  // Set D6 pin as output and write high
  pinMode(D6, OUTPUT);
  digitalWrite(D6, HIGH);

  // LED pins
  int ledPins[] = {D0, D1, D2, D3, D7, D8, D9, D10};
  int numLeds = 8;
  for (int i = 0; i < numLeds; i++) {
    pinMode(ledPins[i], OUTPUT);
    digitalWrite(ledPins[i], LOW);
  }
}

int ledPins[] = {0, 1, 2, 3, 7, 8, 9, 10};
int numLeds = 8;
int currentLed = 0;

void loop() {
  digitalWrite(ledPins[currentLed], LOW);
  currentLed = (currentLed + 1) % numLeds;
  digitalWrite(ledPins[currentLed], HIGH);
  delay(1000);
  Serial.println("Current LED: " + String(currentLed));
}