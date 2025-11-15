#ifndef SERVO_CONTROL_H
#define SERVO_CONTROL_H

#include <Adafruit_PWMServoDriver.h>

enum OutputType {
    OUT_NONE = 0,
    OUT_PHYSICAL,
    OUT_MUX_A,
    OUT_MUX_B
};

class ServoController {
public:
    ServoController();

    void begin();

    // Start one full cycle: 0 → 180 → 0 for two faces
    void startMovement(int face1, int face2);

    // Call this every loop()
    void update();

private:
    Adafruit_PWMServoDriver pwm;

    // movement state
    bool active = false;
    unsigned long lastStep = 0;
    int phase = 0;        // 0 = forward, 1 = backward
    int stepAngle = 0;
    const int stepDeg = 3;          // degrees per step
    const int stepIntervalMs = 15;  // ms per step (~60 fps)

    // face routing
    int f1ID = 1;
    int f2ID = 2;

    OutputType f1Type = OUT_NONE;
    OutputType f2Type = OUT_NONE;

    int f1Channel = -1;   // physical channel or mux channel
    int f2Channel = -1;

    // helpers
    int  angleToPWM(int angle);
    void selectMuxA(int ch);
    void selectMuxB(int ch);
    void resolveFace(int faceID, OutputType &type, int &outChannel);
    void writeOne(OutputType type, int channel, int angle);
    void writeDual(int angle);
};

#endif