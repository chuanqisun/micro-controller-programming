#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels

#define SCREEN_ADDRESS 0x3C // 0x3D or 0x3C depending on brand

#define PIN_RED 17
#define PIN_GREEN 16
#define PIN_BLUE 25

#define N_TOUCH 6
#define THRESHOLD 30

int touch_pins[N_TOUCH] = {3, 4, 2, 27, 1, 26};
int touch_values[N_TOUCH] = {0, 0, 0, 0, 0, 0};

bool pin_touched_now[N_TOUCH] = {false, false, false, false, false, false};
bool pin_touched_past[N_TOUCH] = {false, false, false, false, false, false};

// simple counter state
int counterValue = 0;

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1, 1000000UL, 1000000UL);


void update_touch() {
  int t;
  int t_max = 200;
  int p;

  for (int i = 0; i < N_TOUCH; i++) {
    p = touch_pins[i];

    // set to low
    pinMode(p, OUTPUT);
    digitalWriteFast(p, LOW);

    // settle
    delayMicroseconds(25);

    // make sure nothing else interrupts this
    noInterrupts();

    // enable pull-up
    pinMode(p, INPUT_PULLUP);

    // measure time to rise
    t = 0;
    while (!digitalReadFast(p) && t < t_max) {
      t++;
    }
    touch_values[i] = t;

    // re-enable interrups
    interrupts();

    // update state
    pin_touched_past[i] = pin_touched_now[i];
    pin_touched_now[i] = touch_values[i] > THRESHOLD;
  }
}

void setup() {
  // initialize Serial port
  Serial.begin(115200);

  // initialize LED
  pinMode(PIN_RED, OUTPUT);
  pinMode(PIN_GREEN, OUTPUT);
  pinMode(PIN_BLUE, OUTPUT);
  // HIGH = LED off (they're connected to VCC instead of ground)
  digitalWrite(PIN_RED, HIGH);
  digitalWrite(PIN_GREEN, HIGH);
  digitalWrite(PIN_BLUE, HIGH);

  // initialize display
  display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS);
  display.clearDisplay();
  display.display();

  // text settings
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

}

void print_touch() {
  char print_buffer[30];
  for (int i=0; i < N_TOUCH; i++) {
    sprintf(print_buffer, "%4d ", touch_values[i]);
    Serial.print(print_buffer);
  }
  Serial.println("");
}


void loop() {
  // update the touch sensors
  update_touch();

  // clear the buffer
  display.clearDisplay();
  // pick a position
  display.setCursor(28, 25);
  
  
  // example pressed button
  if (pin_touched_now[0] && !pin_touched_past[0]) {
    // button 0 was just pressed, do something
    digitalWrite(PIN_GREEN, LOW);
  }

  // example released button
  if (!pin_touched_now[0] && pin_touched_past[0]) {
    // button 0 was just released, do something
    digitalWrite(PIN_GREEN, HIGH);
  }


  // print values to Serial, for debugging
  print_touch();

  // time lapsed in seconds
  unsigned long elapsed = millis() / 1000;
  
  
  
  // handle touch A (index 0) = increment, touch B (index 1) = decrement
  // detect newly pressed (now true, past false)
  if (pin_touched_now[0] && !pin_touched_past[0]) {
    counterValue++;
    Serial.print("Counter incremented: ");
    Serial.println(counterValue);
    // brief visual feedback: toggle gReen LED
    digitalWrite(PIN_GREEN, LOW);
  }
  if (pin_touched_now[1] && !pin_touched_past[1]) {
    counterValue--;
    Serial.print("Counter decremented: ");
    Serial.println(counterValue);
    digitalWrite(PIN_RED, LOW);
  }

  // release LEDs when sensors are not pressed
  if (!pin_touched_now[0]) digitalWrite(PIN_GREEN, HIGH);
  if (!pin_touched_now[1]) digitalWrite(PIN_RED, HIGH);

  // draw the counter centered on the display
  display.setTextSize(3);
  display.setTextColor(SSD1306_WHITE);
  // center roughly: measure width (approx 6 px per char at size 1)
  int16_t x = 0;
  int16_t y = (SCREEN_HEIGHT / 2) - 12; // center vertically for size 3
  display.setCursor(20, y);
  display.print(counterValue);
  display.display();

}
