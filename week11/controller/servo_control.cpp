#include <Arduino.h>
#include "servo_control.h"
#include <Wire.h>

// Servo PWM limits (SunFounder servo)
#define SERVO_MIN 80
#define SERVO_MAX 600

// ------------------ MUX PINS ------------------
#define MUXA_S0 2
#define MUXA_S1 3
#define MUXA_S2 4
#define MUXA_S3 5

#define MUXB_S0 6
#define MUXB_S1 7
#define MUXB_S2 8
#define MUXB_S3 9

// ------------------ PCA9685 CHANNELS ------------------
#define PWM_SERVO_A     0   // physical servo 1 (face 1)
#define PWM_SERVO_B     1   // physical servo 2 (face 2)
#define PWM_MUX_A       2   // mux A output
#define PWM_MUX_B       3   // mux B output (future)

ServoController::ServoController()
: pwm(Adafruit_PWMServoDriver(0x40)) { }

void ServoController::begin() {
    // mux A
    pinMode(MUXA_S0, OUTPUT);
    pinMode(MUXA_S1, OUTPUT);
    pinMode(MUXA_S2, OUTPUT);
    pinMode(MUXA_S3, OUTPUT);

    // mux B (not connected yet)
    pinMode(MUXB_S0, OUTPUT);
    pinMode(MUXB_S1, OUTPUT);
    pinMode(MUXB_S2, OUTPUT);
    pinMode(MUXB_S3, OUTPUT);

    pwm.begin();
    pwm.setPWMFreq(50);
    delay(20);
}

int ServoController::angleToPWM(int angle) {
    angle = constrain(angle, 0, 180);
    float ratio = angle / 180.0f;
    return SERVO_MIN + (SERVO_MAX - SERVO_MIN) * ratio;
}

// ------------------ SELECT MUX ------------------
void ServoController::selectMuxA(int ch) {
    digitalWrite(MUXA_S0, (ch >> 0) & 1);
    digitalWrite(MUXA_S1, (ch >> 1) & 1);
    digitalWrite(MUXA_S2, (ch >> 2) & 1);
    digitalWrite(MUXA_S3, (ch >> 3) & 1);
    delayMicroseconds(150);
}

void ServoController::selectMuxB(int ch) {
    digitalWrite(MUXB_S0, (ch >> 0) & 1);
    digitalWrite(MUXB_S1, (ch >> 1) & 1);
    digitalWrite(MUXB_S2, (ch >> 2) & 1);
    digitalWrite(MUXB_S3, (ch >> 3) & 1);
    delayMicroseconds(150);
}

// QUEUE THE MOVEMENT (does NOT move immediately)
void ServoController::queueFace(int faceID, int angle) {

    // ------------------ TEST SERVOS ------------------
    if (faceID == 1) {
        queuedA = angle;
        return;
    }

    if (faceID == 2) {
        queuedB = angle;
        return;
    }

    // ------------------ MUX A (3–10) ------------------
    if (faceID >= 3 && faceID <= 10) {
        queuedMuxChannelA = faceID - 1;
        queuedMuxAngleA = angle;
        return;
    }

    // ------------------ MUX B (11–20) ------------------
    if (faceID >= 11 && faceID <= 20) {
        queuedMuxChannelB = faceID - 11;
        queuedMuxAngleB = angle;
        return;
    }
}

// APPLY ALL QUEUED OUTPUTS SIMULTANEOUSLY
void ServoController::applyQueuedOutput() {
    // test servo A
    pwm.setPWM(PWM_SERVO_A, 0, angleToPWM(queuedA));

    // test servo B
    pwm.setPWM(PWM_SERVO_B, 0, angleToPWM(queuedB));

    // MUX A
    if (queuedMuxChannelA >= 0) {
        selectMuxA(queuedMuxChannelA);
        pwm.setPWM(PWM_MUX_A, 0, angleToPWM(queuedMuxAngleA));
    }

    // MUX B
    if (queuedMuxChannelB >= 0) {
        selectMuxB(queuedMuxChannelB);
        pwm.setPWM(PWM_MUX_B, 0, angleToPWM(queuedMuxAngleB));
    }
}

void ServoController::resetAll() {
    pwm.setPWM(PWM_SERVO_A, 0, angleToPWM(0));
    pwm.setPWM(PWM_SERVO_B, 0, angleToPWM(0));
}