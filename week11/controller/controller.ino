#include <ArduinoJson.h>
#include "servo_control.h"

ServoController servos;
bool hasRun = false;

void setup() {
  Serial.begin(115200);
  delay(1500);

  Wire.begin();
  servos.begin();

  Serial.println("\n=== FINAL SERVO TEST MODE ===");
  Serial.println("Faces 1–2 = REAL servos");
  Serial.println("Faces 3–10 = MUX A (print only)");
  Serial.println("Faces 11–20 = MUX B (print only)\n");
}

void processJsonCommand(String jsonMsg) {
  StaticJsonDocument<128> doc;
  if (deserializeJson(doc, jsonMsg)) {
    Serial.println("JSON parse error");
    return;
  }

  String cmd = doc["cmd"];
  String args = doc["args"];

  if (cmd != "move_servo") {
    Serial.println("Unknown command");
    return;
  }

  int comma = args.indexOf(',');
  int f1 = args.substring(0, comma).toInt();
  int f2 = args.substring(comma + 1).toInt();

  Serial.print("\nCommanded faces: ");
  Serial.print(f1);
  Serial.print(", ");
  Serial.println(f2);

  // Always queue movement for BOTH faces
  auto processOne = [&](int face) {
    if (face == 1 || face == 2) {
        Serial.print(" -> Moving PHYSICAL servo for face ");
        Serial.println(face);

        servos.queueFace(face, 180);  // queue movement
    }
    else if (face >= 3 && face <= 10) {
        Serial.print(" -> (MUX A) Face ");
        Serial.println(face);
    }
    else if (face >= 11 && face <= 20) {
        Serial.print(" -> (MUX B) Face ");
        Serial.println(face);
    }
  };

  // queue both
  processOne(f1);
  processOne(f2);

  // execute together
  servos.applyQueuedOutput();
  delay(400);

  // reset
  servos.resetAll();

  Serial.println("Movement complete.\n");
}

void loop() {
  // if (!hasRun) {
    // Change this to any face pair
    String incomingJson = R"({"cmd":"move_servo","args":"1,2"})";
    processJsonCommand(incomingJson);
    // hasRun = true;
  // }
}