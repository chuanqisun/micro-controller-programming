#define THRESHOLD 10

unsigned long lastRepeatMillis_A = 0;
unsigned long lastRepeatMillis_B = 0;
const unsigned long REPEAT_MS = 100; // repeat rate while held
const unsigned long RISE_COUNT = 200; // max count for touch read

void detect_touch() {
  int t;
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

    pinMode(p, INPUT_PULLUP);

    // measure ticks to rise
    // touching will slow the rise time, increase the count
    t = 0;
    while (!digitalReadFast(p) && t < RISE_COUNT) {
      t++;
    }
    touch_values[i] = t;

    // re-enable interrups
    interrupts();

    pin_touched_past[i] = pin_touched_now[i];
    pin_touched_now[i] = touch_values[i] > THRESHOLD;
  }
}


void handle_touch(long &counter) {
  unsigned long now = millis();

  if (pin_touched_now[0]) {
    if (!pin_touched_past[0]) {
      counter += 1;
      lastRepeatMillis_A = now;
    } else {
      while (now - lastRepeatMillis_A >= REPEAT_MS) {
        counter += 1;
        lastRepeatMillis_A += REPEAT_MS;
      }
    }
  }

  if (pin_touched_now[1]) {
    if (!pin_touched_past[1]) {
      counter -= 1;
      lastRepeatMillis_B = now;
    } else {
      while (now - lastRepeatMillis_B >= REPEAT_MS) {
        counter -= 1;
        lastRepeatMillis_B += REPEAT_MS;
      }
    }
  }
}
