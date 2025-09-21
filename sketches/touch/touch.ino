#define PIN_RED 17
#define PIN_GREEN 16
#define PIN_BLUE 25

#define N_TOUCH 6
#define THRESHOLD 30

int touch_pins[N_TOUCH] = {3, 4, 2, 27, 1, 26};
int touch_values[N_TOUCH] = {0, 0, 0, 0, 0, 0};

bool pin_touched_now[N_TOUCH] = {false, false, false, false, false, false};
bool pin_touched_past[N_TOUCH] = {false, false, false, false, false, false};

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

void print_touch() {
  char print_buffer[30];
  for (int i=0; i < N_TOUCH; i++) {
    sprintf(print_buffer, "%4d ", touch_values[i]);
    Serial.print(print_buffer);
  }
  Serial.println("");
}

void setup() {
  // initialize Serial port
  Serial.begin(0);

  // initialize LED
  pinMode(PIN_RED, OUTPUT);
  pinMode(PIN_GREEN, OUTPUT);
  pinMode(PIN_BLUE, OUTPUT);
  // HIGH = LED off (they're connected to VCC instead of ground)
  digitalWrite(PIN_RED, HIGH);
  digitalWrite(PIN_GREEN, HIGH);
  digitalWrite(PIN_BLUE, HIGH);
}

void loop() {
  // update the touch sensors
  update_touch();

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

  // slow down the loop to not print too fast (optional)
  delay(50);
}
