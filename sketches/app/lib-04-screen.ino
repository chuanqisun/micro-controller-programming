void init_screen() {
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

void render_screen(long counter) {
  display.clearDisplay();

  // Clamp the size to fit the shortest screen dimension
  // Use absolute value to avoid negative sizes
  long size = counter;
  if (size < 0) size = -size;

  long maxSize = min(SCREEN_WIDTH, SCREEN_HEIGHT);
  if (size > maxSize) size = maxSize;

  // Compute top-left to center the square
  int16_t x = (SCREEN_WIDTH - (int16_t)size) / 2;
  int16_t y = (SCREEN_HEIGHT - (int16_t)size) / 2;

  // Draw the box. If size is 0, draw a single pixel at center.
  if (size <= 1) {
    display.drawPixel(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2, SSD1306_WHITE);
  } else {
    display.drawRect(x, y, (int16_t)size, (int16_t)size, SSD1306_WHITE);
  }

  display.display();
}