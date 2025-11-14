#ifndef SERVO_CONTROL_H
#define SERVO_CONTROL_H

#include <Adafruit_PWMServoDriver.h>

class ServoController {
public:
    ServoController();

    void begin();

    // Queue per-face movement (real-case architecture)
    void queueFace(int faceID, int angle);

    // Execute all queued servo outputs simultaneously
    void applyQueuedOutput();

    // Reset all servos to resting position
    void resetAll();

private:
    Adafruit_PWMServoDriver pwm;

    int angleToPWM(int angle);

    void selectMuxA(int ch);
    void selectMuxB(int ch);

    // queued angles for the 2 physical servos + mux output
    int queuedA = 0;   // servo A angle
    int queuedB = 0;   // servo B angle
    int queuedMuxAngleA = -1;
    int queuedMuxChannelA = -1;

    int queuedMuxAngleB = -1;
    int queuedMuxChannelB = -1;
};

#endif