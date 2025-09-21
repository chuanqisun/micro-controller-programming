#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels

#define SCREEN_ADDRESS 0x3C // 0x3D or 0x3C depending on brand

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1, 1700000UL, 1700000UL);


void setup() {
  // initialize Serial port
  Serial.begin(115200);

  // give the screen some time to power up
  delay(50);

  // initialize display
  display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS);
  display.clearDisplay();
  display.display();

  // text settings
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
}


void loop() {
  // clear the buffer
  display.clearDisplay();
  // pick a position
  display.setCursor(28, 25);
  // write to buffer
  display.print("Hello world!");
  // send buffer
  display.display();
}

