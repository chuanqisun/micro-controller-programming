#include "servo_control.h"
#include <Arduino.h>
#include <Wire.h>

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

ServoController::ServoController()
: pwm(Adafruit_PWMServoDriver(0x40)) { }

void ServoController::begin() {
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

// Map 0–180°
int ServoController::angleToPWM(int angle) {
    angle = constrain(angle, 0, 180);
    int pwmVal = map(angle, 0, 180, SERVO_MIN, SERVO_MAX);
    return pwmVal;
}

// MUX SELECT
void ServoController::selectMuxA(int ch) {
    digitalWrite(MUXA_S0, (ch >> 0) & 1);
    digitalWrite(MUXA_S1, (ch >> 1) & 1);
    digitalWrite(MUXA_S2, (ch >> 2) & 1);
    digitalWrite(MUXA_S3, (ch >> 3) & 1);
}

void ServoController::selectMuxB(int ch) {
    digitalWrite(MUXB_S0, (ch >> 0) & 1);
    digitalWrite(MUXB_S1, (ch >> 1) & 1);
    digitalWrite(MUXB_S2, (ch >> 2) & 1);
    digitalWrite(MUXB_S3, (ch >> 3) & 1);
}

// FACE TO OUTPUT ROUTING
void ServoController::resolveFace(int faceID, OutputType &type, int &outChannel) {
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

// WRITE ONE FACE
void ServoController::writeOne(OutputType type, int channel, int angle) {
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

// WRITE BOTH FACES (AA / AB / BB)
void ServoController::writeDual(int angle) {
    writeOne(f1Type, f1Channel, angle);
    writeOne(f2Type, f2Channel, angle);
}

// START ONE FULL CYCLE
void ServoController::startMovement(int face1, int face2) {
    f1ID = face1;
    f2ID = face2;

    resolveFace(f1ID, f1Type, f1Channel);
    resolveFace(f2ID, f2Type, f2Channel);

    active = true;
    phase = 0;        // 0 → going up
    stepAngle = 0;    // start at 0°
    lastStep = millis();

    Serial.print("[Movement] Start faces ");
    Serial.print(f1ID);
    Serial.print(", ");
    Serial.println(f2ID);
}

// UPDATE (NON-BLOCKING)
void ServoController::update() {
    if (!active) return;

    unsigned long now = millis();
    if (now - lastStep < (unsigned long)stepIntervalMs) return;
    lastStep = now;

    // Forward phase: 0 → 180
    if (phase == 0) {
        writeDual(stepAngle);

        stepAngle += stepDeg;
        if (stepAngle >= 180) {
            stepAngle = 180;
            phase = 1;
            Serial.println("[Movement] Reverse");
        }
    }
    // Backward phase: 180 → 0
    else if (phase == 1) {
        writeDual(stepAngle);

        stepAngle -= stepDeg;
        if (stepAngle <= 0) {
            stepAngle = 0;
            active = false;
            Serial.println("[Movement] Done");
        }
    }
}