#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define N_TOUCH 6

#define SCREEN_WIDTH 128 // OLED display width, in pixels
#define SCREEN_HEIGHT 64 // OLED display height, in pixels
#define SCREEN_ADDRESS 0x3C // 0x3D or 0x3C depending on module


int touch_pins[N_TOUCH] = {3, 4, 2, 27, 1, 26};
int touch_values[N_TOUCH] = {0, 0, 0, 0, 0, 0};

bool pin_touched_now[N_TOUCH] = {false, false, false, false, false, false};
bool pin_touched_past[N_TOUCH] = {false, false, false, false, false, false};

int PIN_RED = 17;
int PIN_GREEN = 16;
int PIN_BLUE = 25;

void update_touch();
void print_touch();
void init_screen();
void render_screen(long zoom, long pitch, long yaw);
void handle_touch(long &zoom, long &pitch, long &yaw);
void send_serial_data(long zoom, long pitch, long yaw);


Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1, 1700000UL, 1700000UL);

long zoom = 0;
long pitch = 0;
long yaw = 0; 


void setup() {
  Serial.begin(115200);

  delay(50);

  init_screen();
}

void loop() {
  detect_touch();
  handle_touch(zoom, pitch, yaw);
  render_screen(zoom, pitch, yaw);
  send_serial_data(zoom, pitch, yaw);
}
