1. host some server, eg:
   python3 -m http.server 8000

2. run the esp32_bluetooth.ino file on the ESP32 (via arduino IDE)

3. go to:
http://localhost:8000/test.html

4. pair the ESP32 device

what you should see:
arduino code sends "a" every second, so this shoudl show up on the webpage
if you send a "b" command from the webpage, should show up on Serial Monitor in arduino IDE

