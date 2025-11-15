#include <ArduinoJson.h>
#include "servo_control.h"

ServoController servos;
bool started = false;
unsigned long lastMoveTime = 0;
const unsigned long MOVE_INTERVAL = 3000; // 3 seconds in milliseconds
int moveCount = 0;
const int MAX_MOVES = 3;

void setup() {
  Serial.begin(115200);
  Wire.begin();
  servos.begin();

  Serial.println("\n=== SERVO TEST MODE ===");
  Serial.println("Faces 1–2 = REAL servos");
  Serial.println("Faces 3–10 = MUX A (print only)");
  Serial.println("Faces 11–20 = MUX B (print only)\n");
}

void processJson(const String &jsonMsg) {
  StaticJsonDocument<128> doc;
  auto err = deserializeJson(doc, jsonMsg);
  if (err) {
    Serial.print("JSON parse error: ");
    Serial.println(err.c_str());
    return;
  }

  String cmd  = doc["cmd"] | "";
  String args = doc["args"] | "";

  if (cmd != "move_servo") {
    Serial.println("Unknown cmd");
    return;
  }

  int comma = args.indexOf(',');
  if (comma < 0) {
    Serial.println("Bad args format, expected 'X,Y'");
    return;
  }

  int f1 = args.substring(0, comma).toInt();
  int f2 = args.substring(comma + 1).toInt();

  Serial.print("Commanded faces: ");
  Serial.print(f1);
  Serial.print(", ");
  Serial.println(f2);

  servos.startMovement(f1, f2);
}

void loop() {
  // Send a JSON command every 3 seconds, max 3 times.
  if (moveCount < MAX_MOVES) {
    unsigned long currentTime = millis();
    if (currentTime - lastMoveTime >= MOVE_INTERVAL) {
      String testJson = R"({"cmd":"move_servo","args":"1,2"})";
      processJson(testJson);
      moveCount++;
      lastMoveTime = currentTime;
    }
  }

  // In real project, call servos.update()
  // and call processJson(...) from your network callbacks.
  servos.update();
}