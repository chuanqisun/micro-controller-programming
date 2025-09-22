#define THRESHOLD 10

unsigned long lastRepeatMillis_A = 0; // A -> zoom+
unsigned long lastRepeatMillis_B = 0; // B -> zoom-
unsigned long lastRepeatMillis_Up = 0;    // Up -> pitch+
unsigned long lastRepeatMillis_Down = 0;  // Down -> pitch-
unsigned long lastRepeatMillis_Left = 0;  // Left -> yaw-
unsigned long lastRepeatMillis_Right = 0; // Right -> yaw+
const unsigned long REPEAT_MS = 50; // repeat rate while held
const unsigned long RISE_COUNT = 50; // max count for touch read

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


void handle_touch(long &zoom, long &pitch, long &yaw) {
  unsigned long now = millis();

  if (pin_touched_now[0]) {
    if (!pin_touched_past[0]) {
      zoom += 1;
      lastRepeatMillis_A = now;
    } else {
      while (now - lastRepeatMillis_A >= REPEAT_MS) {
        zoom += 1;
        lastRepeatMillis_A += REPEAT_MS;
      }
    }
  }

  if (pin_touched_now[1]) {
    if (!pin_touched_past[1]) {
      zoom -= 1;
      lastRepeatMillis_B = now;
    } else {
      while (now - lastRepeatMillis_B >= REPEAT_MS) {
        zoom -= 1;
        lastRepeatMillis_B += REPEAT_MS;
      }
    }
  }

  // Down pad (index 2) -> pitch-
  if (pin_touched_now[2]) {
    if (!pin_touched_past[2]) {
      pitch -= 1;
      lastRepeatMillis_Down = now;
    } else {
      while (now - lastRepeatMillis_Down >= REPEAT_MS) {
        pitch -= 1;
        lastRepeatMillis_Down += REPEAT_MS;
      }
    }
  }

  // Left pad (index 3) -> yaw-
  if (pin_touched_now[3]) {
    if (!pin_touched_past[3]) {
      yaw -= 1;
      lastRepeatMillis_Left = now;
    } else {
      while (now - lastRepeatMillis_Left >= REPEAT_MS) {
        yaw -= 1;
        lastRepeatMillis_Left += REPEAT_MS;
      }
    }
  }

  // Right pad (index 4) -> yaw+
  if (pin_touched_now[4]) {
    if (!pin_touched_past[4]) {
      yaw += 1;
      lastRepeatMillis_Right = now;
    } else {
      while (now - lastRepeatMillis_Right >= REPEAT_MS) {
        yaw += 1;
        lastRepeatMillis_Right += REPEAT_MS;
      }
    }
  }

  // Up pad (index 5) -> pitch+
  if (pin_touched_now[5]) {
    if (!pin_touched_past[5]) {
      pitch += 1;
      lastRepeatMillis_Up = now;
    } else {
      while (now - lastRepeatMillis_Up >= REPEAT_MS) {
        pitch += 1;
        lastRepeatMillis_Up += REPEAT_MS;
      }
    }
  }
}
