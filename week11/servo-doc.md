# Adafruit_PWMServoDriver Class Documentation

The **Adafruit_PWMServoDriver** class provides a convenient interface for controlling the PCA9685 PWM driver chip over I²C. It supports setting PWM frequencies, configuring individual pins, and handling both internal and external clock sources.

---

## Overview

- **Purpose** – Store state and expose functions for interacting with the PCA9685 PWM chip.
- **Library** – `#include <Adafruit_PWMServoDriver.h>`
- **Supported Platforms** – Arduino, ESP32, Raspberry Pi, etc.

---

## Constructors

| Constructor                                                 | Parameters                                                          | Description                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------- |
| `Adafruit_PWMServoDriver()`                                 | None                                                                | Instantiates a new driver with the default I²C address `0x40`. |
| `Adafruit_PWMServoDriver(const uint8_t addr)`               | `addr` – 7‑bit I²C address (default `0x40`)                         | Instantiates a new driver with a custom I²C address.           |
| `Adafruit_PWMServoDriver(const uint8_t addr, TwoWire &i2c)` | `addr` – 7‑bit I²C address, `i2c` – reference to a `TwoWire` object | Instantiates a new driver using a specified I²C bus.           |

---

## Public Member Functions

| Function                                                      | Return Type | Parameters                                                                 | Description                                                                         |
| ------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `bool begin(uint8_t prescale = 0)`                            | `bool`      | `prescale` – optional external clock prescale                              | Initializes the I²C interface and hardware. Returns `true` on success.              |
| `void reset()`                                                | `void`      | None                                                                       | Sends a reset command to the PCA9685 chip.                                          |
| `void sleep()`                                                | `void`      | None                                                                       | Puts the board into sleep mode.                                                     |
| `void wakeup()`                                               | `void`      | None                                                                       | Wakes the board from sleep.                                                         |
| `void setExtClk(uint8_t prescale)`                            | `void`      | `prescale` – prescale for external clock                                   | Configures the EXTCLK pin to use an external clock source.                          |
| `void setPWMFreq(float freq)`                                 | `void`      | `freq` – desired PWM frequency (Hz)                                        | Sets the PWM frequency for the entire chip (up to ~1.6 kHz).                        |
| `void setOutputMode(bool totempole)`                          | `void`      | `totempole` – `true` for push‑pull, `false` for open‑drain                 | Sets the output mode. Open‑drain is required for LEDs with integrated Zener diodes. |
| `uint16_t getPWM(uint8_t num, bool off = false)`              | `uint16_t`  | `num` – pin number (0‑15), `off` – `true` returns OFF value                | Retrieves the PWM value for a specific pin.                                         |
| `uint8_t setPWM(uint8_t num, uint16_t on, uint16_t off)`      | `uint8_t`   | `num` – pin number, `on` – ON tick, `off` – OFF tick                       | Sets the PWM output for a specific pin. Returns `0` on success.                     |
| `void setPin(uint8_t num, uint16_t val, bool invert = false)` | `void`      | `num` – pin number, `val` – active ticks (0‑4095), `invert` – invert pulse | Helper to set a pin’s PWM output without manual tick placement.                     |
| `uint8_t readPrescale()`                                      | `uint8_t`   | None                                                                       | Reads the current prescale value from the chip.                                     |
| `void writeMicroseconds(uint8_t num, uint16_t Microseconds)`  | `void`      | `num` – pin number, `Microseconds` – pulse width in µs                     | Sets PWM based on microseconds (approximate).                                       |
| `void setOscillatorFrequency(uint32_t freq)`                  | `void`      | `freq` – oscillator frequency (Hz)                                         | Sets the internal oscillator frequency used for calculations.                       |
| `uint32_t getOscillatorFrequency()`                           | `uint32_t`  | None                                                                       | Returns the internally tracked oscillator frequency.                                |

---

## Detailed Descriptions

### `begin()`

Initializes the I²C bus and configures the PCA9685. If a non‑zero `prescale` is supplied, it sets the external clock prescale before initialization.

### `setExtClk()`

Enables the external clock source by writing the given prescale value to the appropriate register.

### `setPWMFreq()`

Calculates the required prescale based on the desired frequency and writes it to the chip. The formula used is:

```
prescale = round(oscillator_freq / (4096 * freq)) - 1
```

### `setOutputMode()`

Writes to the `OUTDRV` bit in the `MODE2` register to switch between open‑drain (`0`) and push‑pull (`1`).

### `getPWM()`

Reads either the `ON` or `OFF` register for the specified pin, depending on the `off` flag.

### `setPWM()`

Writes the `ON` and `OFF` tick values to the appropriate registers for the specified pin.

### `setPin()`

Convenience wrapper that automatically calculates `ON` and `OFF` ticks based on a desired active width (`val`). Handles edge cases:

- `val == 0` → completely off (`OFF = 4095`, `ON = 0`).
- `val == 4095` → completely on (`ON = 0`, `OFF = 4095`).

### `writeMicroseconds()`

Converts a pulse width in microseconds to the corresponding tick count using the current frequency and calls `setPin()`.

### `setOscillatorFrequency()` / `getOscillatorFrequency()`

Allow the user to override the default oscillator frequency (typically 25 MHz) for more accurate timing calculations.

---

## Example Usage

```cpp
#include <Adafruit_PWMServoDriver.h>

Adafruit_PWMServoDriver pwm; // Uses default address 0x40

void setup() {
  pwm.begin();                 // Initialize
  pwm.setPWMFreq(50);           // 50 Hz for servos
  pwm.setOutputMode(false);     // Open‑drain mode
}

void loop() {
  // Move servo on pin 0 to 90° (approx 1.5 ms pulse)
  pwm.writeMicroseconds(0, 1500);
  delay(1000);
  // Move servo to 0° (1 ms pulse)
  pwm.writeMicroseconds(0, 1000);
  delay(1000);
}
```

---

## References

- [Adafruit PWM Servo Driver Library – Documentation](https://adafruit.github.io/Adafruit-PWM-Servo-Driver-Library/html/class_adafruit___p_w_m_servo_driver.html)
- [Header File (`Adafruit_PWMServoDriver.h`)](https://adafruit.github.io/Adafruit-PWM-Servo-Driver-Library/html/_adafruit___p_w_m_servo_driver_8h_source.html)
- [Source File (`Adafruit_PWMServoDriver.cpp`)](https://adafruit.github.io/Adafruit-PWM-Servo-Driver-Library/html/_adafruit___p_w_m_servo_driver_8cpp.html)

---
