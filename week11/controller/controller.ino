// ============================================
// SERVO CONTROL - Full Arduino Program
// ============================================

#include <Adafruit_PWMServoDriver.h>
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

// Output type enum
enum OutputType {
    OUT_NONE,
    OUT_PHYSICAL,
    OUT_MUX_A,
    OUT_MUX_B
};

// Global servo state
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);

// Movement state
bool servo_active = false;
int servo_phase = 0;            // 0 = forward, 1 = back
int servo_stepAngle = 0;
unsigned long servo_lastStep = 0;

// Face ID being moved
int servo_faceID = -1;

// Routed output target
OutputType servo_outputType = OUT_NONE;
int servo_outputChannel = -1;

// Movement config
const int servo_stepDeg = 4;         // 0→180 in 45 steps
const int servo_stepIntervalMs = 12; // ~180ms total

// Movement counter
int movementCount = 0;
const int maxMovements = 5;


// ============================================
// ARDUINO MAIN FUNCTIONS
// ============================================

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000);
    
    Serial.println("\n=== Servo Test Program ===");
    setupServo();
    
    // Start with servo 1
    servo_startMovement(1);
}

void loop() {
    // Stop after reaching max movements
    if (movementCount >= maxMovements) {
        Serial.println("\n=== Test Complete: 10 movements finished ===");
        while (true) {
            delay(1000);
        }
    }
    
    updateServo();
    
    // When movement completes, start the next servo
    static bool wasActive = false;
    bool isActive = servo_isActive();
    
    if (wasActive && !isActive) {
        // Movement just finished
        movementCount++;
        
        Serial.print("Completed ");
        Serial.print(movementCount);
        Serial.print(" of ");
        Serial.println(maxMovements);
        
        // Check if we've reached the limit
        if (movementCount >= maxMovements) {
            return;
        }
        
        static int currentServo = 1;
        
        // Toggle between servo 1 and 2
        currentServo = (currentServo == 1) ? 2 : 1;
        
        Serial.print("Starting servo ");
        Serial.println(currentServo);
        
        servo_startMovement(currentServo);
    }
    
    wasActive = isActive;
}



// ============================================
// PUBLIC SERVO API
// ============================================

void setupServo() {
    Wire.begin();

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
    
    Serial.println("Servo system initialized");
}

void servo_startMovement(int faceID) {
    servo_faceID = faceID;

    servo_resolveFace(servo_faceID, servo_outputType, servo_outputChannel);

    servo_active = true;
    servo_phase = 0;        // 0 → going up
    servo_stepAngle = 0;    // start at 0°
    servo_lastStep = millis();

    Serial.print("[Servo] Start movement face ");
    Serial.println(servo_faceID);
}

void updateServo() {
    if (!servo_active) return;

    unsigned long now = millis();
    if (now - servo_lastStep < (unsigned long)servo_stepIntervalMs) return;
    servo_lastStep = now;

    // Forward phase: 0 → 180
    if (servo_phase == 0) {
        servo_write(servo_outputType, servo_outputChannel, servo_stepAngle);

        servo_stepAngle += servo_stepDeg;
        if (servo_stepAngle >= 180) {
            servo_stepAngle = 180;
            servo_phase = 1;
            Serial.println("[Servo] Reverse");
        }
    }
    // Backward phase: 180 → 0
    else if (servo_phase == 1) {
        servo_write(servo_outputType, servo_outputChannel, servo_stepAngle);

        servo_stepAngle -= servo_stepDeg;
        if (servo_stepAngle <= 0) {
            servo_stepAngle = 0;
            servo_active = false;
            Serial.println("[Servo] Done");
        }
    }
}

bool servo_isActive() {
    return servo_active;
}

// ============================================
// SERVO HELPER FUNCTIONS
// ============================================


void servo_resolveFace(int faceID, OutputType &type, int &outChannel) {
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

void servo_write(OutputType type, int channel, int angle) {
    int pwmVal = servo_angleToPWM(angle);

    switch (type) {
        case OUT_PHYSICAL:
            pwm.setPWM(channel, 0, pwmVal);
            break;

        case OUT_MUX_A:
            if (channel >= 0 && channel <= 15) {
                servo_selectMuxA(channel);
                pwm.setPWM(PWM_MUX_A, 0, pwmVal);
            }
            break;

        case OUT_MUX_B:
            if (channel >= 0 && channel <= 15) {
                servo_selectMuxB(channel);
                pwm.setPWM(PWM_MUX_B, 0, pwmVal);
            }
            break;

        default:
            break;
    }
}

int servo_angleToPWM(int angle) {
    angle = constrain(angle, 0, 180);
    int pwmVal = map(angle, 0, 180, SERVO_MIN, SERVO_MAX);
    return pwmVal;
}

void servo_selectMuxA(int ch) {
    digitalWrite(MUXA_S0, (ch >> 0) & 1);
    digitalWrite(MUXA_S1, (ch >> 1) & 1);
    digitalWrite(MUXA_S2, (ch >> 2) & 1);
    digitalWrite(MUXA_S3, (ch >> 3) & 1);
}

void servo_selectMuxB(int ch) {
    digitalWrite(MUXB_S0, (ch >> 0) & 1);
    digitalWrite(MUXB_S1, (ch >> 1) & 1);
    digitalWrite(MUXB_S2, (ch >> 2) & 1);
    digitalWrite(MUXB_S3, (ch >> 3) & 1);
}