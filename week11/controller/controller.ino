// ============================================
// SERVO CONTROL - Simplified Direct Control
// ============================================

#include <Adafruit_PWMServoDriver.h>
#include <Wire.h>

// Tuned for SunFounder Digital Servo
#define SERVO_MIN 100
#define SERVO_MAX 580
#define SERVO_FREQ 50

// Global servo state
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);
Adafruit_PWMServoDriver pwm2 = Adafruit_PWMServoDriver(0x41);

// Movement state
bool servo_active = false;
int servo_phase = 0;            // 0 = forward, 1 = back
int servo_stepAngle = 0;
unsigned long servo_lastStep = 0;

// Servo channel being moved (0-6)
int servo_channel = 0;

// Movement config
const int servo_stepDeg = 4;         // 0→180 in 45 steps
const int servo_stepIntervalMs = 12; // ~180ms total

// Movement counter
int movementCount = 0;
const int maxMovements = 20;  // Test all 20 servos


// ============================================
// ARDUINO MAIN FUNCTIONS
// ============================================

void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 3000);
    
    Serial.println("\n=== Servo Test Program ===");
    setupServo();
    
    // Start with servo 0
    servo_startMovement(0);
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
        
        static int currentServo = 0;
        
        // Cycle through servos 0-19
        currentServo++;
        if (currentServo > 19) currentServo = 0;
        
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

    // Initialize first PWM controller (servos 0-9)
    pwm.begin();
    pwm.setOscillatorFrequency(27000000);
    pwm.setPWMFreq(SERVO_FREQ);
    delay(10);
    
    // Initialize second PWM controller (servos 10-19)
    pwm2.begin();
    pwm2.setOscillatorFrequency(27000000);
    pwm2.setPWMFreq(SERVO_FREQ);
    delay(10);
    
    Serial.println("Servo system initialized (2 PWM controllers)");
}

void servo_startMovement(int channel) {
    servo_channel = constrain(channel, 0, 19);  // 0-19 for 20 servos

    servo_active = true;
    servo_phase = 0;        // 0 → going up
    servo_stepAngle = 0;    // start at 0°
    servo_lastStep = millis();

    Serial.print("[Servo] Start movement channel ");
    Serial.println(servo_channel);
}

void updateServo() {
    if (!servo_active) return;

    unsigned long now = millis();
    if (now - servo_lastStep < (unsigned long)servo_stepIntervalMs) return;
    servo_lastStep = now;

    // Forward phase: 0 → 180
    if (servo_phase == 0) {
        servo_write(servo_channel, servo_stepAngle);

        servo_stepAngle += servo_stepDeg;
        if (servo_stepAngle >= 180) {
            servo_stepAngle = 180;
            servo_phase = 1;
            Serial.println("[Servo] Reverse");
        }
    }
    // Backward phase: 180 → 0
    else if (servo_phase == 1) {
        servo_write(servo_channel, servo_stepAngle);

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

void servo_write(int channel, int angle) {
    int pwmVal = servo_angleToPWM(angle);
    
    // Use pwm for channels 0-9, pwm2 for channels 10-19
    if (channel < 10) {
        pwm.setPWM(channel, 0, pwmVal);
    } else {
        pwm2.setPWM(channel - 10, 0, pwmVal);  // Map 10-19 to 0-9 on second controller
    }
}

int servo_angleToPWM(int angle) {
    angle = constrain(angle, 0, 180);
    int pwmVal = map(angle, 0, 180, SERVO_MIN, SERVO_MAX);
    return pwmVal;
}