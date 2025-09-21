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

void render_screen() {
  display.clearDisplay();
  display.setCursor(28, 25);

  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.print(String(counter));
  display.display();
}