#include <ArduinoJson.h>
#include <Adafruit_PWMServoDriver.h>
#include <Wire.h>

// ============================================================================
// SERVO CONTROLLER - Inlined from servo_control.h/cpp
// ============================================================================

// Tuned for SunFounder Digital Servo
#define SERVO_MIN 100
#define SERVO_MAX 580

// PCA9685 CHANNELS
#define PWM_SERVO_A 0   // physical servo (face 1)
#define PWM_SERVO_B 1   // physical servo (face 2)
#define PWM_MUX_A   2   // MUX A common
#define PWM_MUX_B   3   // MUX B common (future)

// MUX PINS
#define MUXA_S0 2
#define MUXA_S1 3
#define MUXA_S2 4
#define MUXA_S3 5

#define MUXB_S0 6
#define MUXB_S1 7
#define MUXB_S2 8
#define MUXB_S3 9

enum OutputType {
    OUT_NONE = 0,
    OUT_PHYSICAL,
    OUT_MUX_A,
    OUT_MUX_B
};

// Global servo state
Adafruit_PWMServoDriver pwm(0x40);

// movement state
bool servo_active = false;
unsigned long servo_lastStep = 0;
int servo_phase = 0;        // 0 = forward, 1 = backward
int servo_stepAngle = 0;
const int servo_stepDeg = 3;          // degrees per step
const int servo_stepIntervalMs = 15;  // ms per step (~60 fps)

// face routing
int servo_f1ID = 1;
int servo_f2ID = 2;

OutputType servo_f1Type = OUT_NONE;
OutputType servo_f2Type = OUT_NONE;

int servo_f1Channel = -1;   // physical channel or mux channel
int servo_f2Channel = -1;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

int angleToPWM(int angle) {
    angle = constrain(angle, 0, 180);
    int pwmVal = map(angle, 0, 180, SERVO_MIN, SERVO_MAX);
    return pwmVal;
}

void selectMuxA(int ch) {
    digitalWrite(MUXA_S0, (ch >> 0) & 1);
    digitalWrite(MUXA_S1, (ch >> 1) & 1);
    digitalWrite(MUXA_S2, (ch >> 2) & 1);
    digitalWrite(MUXA_S3, (ch >> 3) & 1);
}

void selectMuxB(int ch) {
    digitalWrite(MUXB_S0, (ch >> 0) & 1);
    digitalWrite(MUXB_S1, (ch >> 1) & 1);
    digitalWrite(MUXB_S2, (ch >> 2) & 1);
    digitalWrite(MUXB_S3, (ch >> 3) & 1);
}

void resolveFace(int faceID, OutputType &type, int &outChannel) {
    type = OUT_NONE;
    outChannel = -1;

    // Test board: faces 1–2 = direct servos
    if (faceID == 1) {
        type = OUT_PHYSICAL;
        outChannel = PWM_SERVO_A;
        return;
    }
    if (faceID == 2) {
        type = OUT_PHYSICAL;
        outChannel = PWM_SERVO_B;
        return;
    }

    // Faces 3–10 → MUX A, channels 2–9
    if (faceID >= 3 && faceID <= 10) {
        type = OUT_MUX_A;
        outChannel = faceID - 1;
        return;
    }

    // Faces 11–20 → MUX B, channels 0–9
    if (faceID >= 11 && faceID <= 20) {
        type = OUT_MUX_B;
        outChannel = faceID - 11;
        return;
    }
}

void writeOne(OutputType type, int channel, int angle) {
    int pwmVal = angleToPWM(angle);

    switch (type) {
        case OUT_PHYSICAL:
            // channel is PCA9685 output index
            pwm.setPWM(channel, 0, pwmVal);
            break;

        case OUT_MUX_A:
            if (channel >= 0 && channel <= 15) {
                selectMuxA(channel);
                pwm.setPWM(PWM_MUX_A, 0, pwmVal);
            }
            break;

        case OUT_MUX_B:
            if (channel >= 0 && channel <= 15) {
                selectMuxB(channel);
                pwm.setPWM(PWM_MUX_B, 0, pwmVal);
            }
            break;

        default:
            // OUT_NONE → do nothing
            break;
    }
}

void writeDual(int angle) {
    writeOne(servo_f1Type, servo_f1Channel, angle);
    writeOne(servo_f2Type, servo_f2Channel, angle);
}

void servo_begin() {
    // MUX A
    pinMode(MUXA_S0, OUTPUT);
    pinMode(MUXA_S1, OUTPUT);
    pinMode(MUXA_S2, OUTPUT);
    pinMode(MUXA_S3, OUTPUT);

    // MUX B
    pinMode(MUXB_S0, OUTPUT);
    pinMode(MUXB_S1, OUTPUT);
    pinMode(MUXB_S2, OUTPUT);
    pinMode(MUXB_S3, OUTPUT);

    pwm.begin();
    pwm.setPWMFreq(50);
    delay(20);
}

void servo_startMovement(int face1, int face2) {
    servo_f1ID = face1;
    servo_f2ID = face2;

    resolveFace(servo_f1ID, servo_f1Type, servo_f1Channel);
    resolveFace(servo_f2ID, servo_f2Type, servo_f2Channel);

    servo_active = true;
    servo_phase = 0;        // 0 → going up
    servo_stepAngle = 0;    // start at 0°
    servo_lastStep = millis();

    Serial.print("[Movement] Start faces ");
    Serial.print(servo_f1ID);
    Serial.print(", ");
    Serial.println(servo_f2ID);
}

void servo_update() {
    if (!servo_active) return;

    unsigned long now = millis();
    if (now - servo_lastStep < (unsigned long)servo_stepIntervalMs) return;
    servo_lastStep = now;

    // Forward phase: 0 → 180
    if (servo_phase == 0) {
        writeDual(servo_stepAngle);

        servo_stepAngle += servo_stepDeg;
        if (servo_stepAngle >= 180) {
            servo_stepAngle = 180;
            servo_phase = 1;
            Serial.println("[Movement] Reverse");
        }
    }
    // Backward phase: 180 → 0
    else if (servo_phase == 1) {
        writeDual(servo_stepAngle);

        servo_stepAngle -= servo_stepDeg;
        if (servo_stepAngle <= 0) {
            servo_stepAngle = 0;
            servo_active = false;
            Serial.println("[Movement] Done");
        }
    }
}

// ============================================================================
// MAIN PROGRAM
// ============================================================================

bool started = false;

void setup() {
  Serial.begin(115200);
  Wire.begin();
  servo_begin();

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

  servo_startMovement(f1, f2);
}

void loop() {
  // Send a fake JSON command once at boot.
  if (!started) {
    String testJson = R"({"cmd":"move_servo","args":"1,14"})";
    processJson(testJson);
    started = true;
  }

  // In real project, call servo_update()
  // and call processJson(...) from your network callbacks.
  servo_update();
}