// Read digital inputs D3, D4, D5 and report their HIGH/LOW state over Serial

const int inputPins[] = { D3, D4, D5 };
const char* inputNames[] = { "D3", "D4", "D5" };
const int numInputs = 3;

void setup() {
  Serial.begin(115200);
  // Give Serial a moment to initialize on some boards
  delay(50);

  // Configure input pins. Use INPUT_PULLUP so external pull-downs can be applied as needed.
  for (int i = 0; i < numInputs; ++i) {
    pinMode(inputPins[i], INPUT_PULLUP);
    digitalWrite(inputPins[i], HIGH); // HIGH HIGH HIGH means unplugged
  }

  Serial.println("Input monitor started");
}

void loop() {
  for (int i = 0; i < numInputs; ++i) {
    int v = digitalRead(inputPins[i]);
    Serial.print(inputNames[i]);
    Serial.print(": ");
    if (v == HIGH) {
      Serial.println("HIGH");
    } else {
      Serial.println("LOW");
    }
  }
  Serial.println(); // blank line between samples
  delay(50);
}