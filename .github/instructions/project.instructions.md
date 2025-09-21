---
applyTo: "**"
---

You are editing an Arduino sketch, .ino file.

# Hardware list

- seeed studio, XIAO-RP2040
- Adafruit_SSD1306 OLED display (128x64 pixels, I2C address 0x3C)

# Pin connections

- P6: Display SDA (I2C data)
- P7: Display SCL (I2C clock)
- P17: Red LED (active low)
- P16: Green LED (active low)
- P25: Blue LED (active low)

# Touch sensor pads (capacitive):

- P3: "A" pad
- P4: "B" pad
- P2: "Down" pad
- P27: "Left" pad
- P1: "Right" pad
- P26: "Up" pad

# Software defined behavior

- 6 total touch sensors
- Touch threshold: 30
- Uses capacitive touch sensing with pull-up timing measurement
- Count measurements up to 200
