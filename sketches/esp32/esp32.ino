/*
  Minimal ESP32 Echo Web Server (SoftAP)

  - Creates a WiFi Access Point
  - Serves a simple HTML form at /
  - Echoes back whatever the user types in the input named `msg`

  How to use:
  1) Flash to ESP32
  2) Connect to WiFi AP: SSID "esp32-echo", Password "esp32echo"
  3) Open http://192.168.4.1/ and submit a message
*/

#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiAP.h>

// SoftAP credentials (password must be >= 8 chars)
const char* AP_SSID = "esp32-echo";
const char* AP_PASS = "esp32echo";

WiFiServer server(80);

// --- Utilities ---
static String urlDecode(const String& s) {
  String out;
  out.reserve(s.length());
  for (size_t i = 0; i < s.length(); ++i) {
    char c = s[i];
    if (c == '+') {
      out += ' ';
    } else if (c == '%' && i + 2 < s.length()) {
      char h1 = s[i + 1];
      char h2 = s[i + 2];
      auto hexVal = [](char ch) -> int {
        if (ch >= '0' && ch <= '9') return ch - '0';
        if (ch >= 'a' && ch <= 'f') return ch - 'a' + 10;
        if (ch >= 'A' && ch <= 'F') return ch - 'A' + 10;
        return -1;
      };
      int v1 = hexVal(h1);
      int v2 = hexVal(h2);
      if (v1 >= 0 && v2 >= 0) {
        out += char((v1 << 4) | v2);
        i += 2;
      } else {
        // Invalid percent-encoding, keep as-is
        out += c;
      }
    } else {
      out += c;
    }
  }
  return out;
}

static String htmlEscape(const String& s) {
  String out;
  out.reserve(s.length());
  for (size_t i = 0; i < s.length(); ++i) {
    char c = s[i];
    switch (c) {
      case '&': out += "&amp;"; break;
      case '<': out += "&lt;"; break;
      case '>': out += "&gt;"; break;
      case '"': out += "&quot;"; break;
      case '\'': out += "&#39;"; break;
      default: out += c; break;
    }
  }
  return out;
}

static String getQueryParam(const String& url, const String& key) {
  // Expecting URL like: /?msg=hello or /path?msg=hello&x=y
  int qIdx = url.indexOf('?');
  if (qIdx < 0) return String("");
  String query = url.substring(qIdx + 1);

  // Split by &
  int start = 0;
  while (start <= query.length()) {
    int amp = query.indexOf('&', start);
    String pair = (amp >= 0) ? query.substring(start, amp) : query.substring(start);
    int eq = pair.indexOf('=');
    String k = (eq >= 0) ? pair.substring(0, eq) : pair;
    String v = (eq >= 0) ? pair.substring(eq + 1) : String("");
    if (k == key) {
      return urlDecode(v);
    }
    if (amp < 0) break;
    start = amp + 1;
  }
  return String("");
}

static void sendHttpHeader(WiFiClient& client, int status = 200, const char* contentType = "text/html; charset=utf-8") {
  if (status == 200) {
    client.println("HTTP/1.1 200 OK");
  } else {
    client.print("HTTP/1.1 "); client.print(status); client.println(" ERROR");
  }
  client.print("Content-Type: "); client.println(contentType);
  client.println("Connection: close");
  client.println();
}

static void sendPage(WiFiClient& client, const String& echoed) {
  sendHttpHeader(client);
  client.println("<!doctype html>");
  client.println("<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">");
  client.println("<title>ESP32 Echo</title>");
  client.println("<style>body{font-family:sans-serif;max-width:600px;margin:2rem auto;padding:0 1rem}input[type=text]{width:100%;padding:.5rem;font-size:1rem}button{padding:.5rem 1rem;font-size:1rem;margin-top:.5rem}</style>");
  client.println("</head><body>");
  client.println("<h1>ESP32 Echo</h1>");
  client.println("<form method=\"GET\" action=\"/\">");
  client.println("  <label>Message</label><br>");
  client.print("  <input type=\"text\" name=\"msg\" placeholder=\"Type something\" value=\"");
  client.print(htmlEscape(echoed));
  client.println("\" autofocus>");
  client.println("  <br><button type=\"submit\">Send</button>");
  client.println("</form>");
  if (echoed.length() > 0) {
    client.print("<p><strong>You said:</strong> ");
    client.print(htmlEscape(echoed));
    client.println("</p>");
  }
  client.println("</body></html>");
}

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println("Configuring SoftAP...");

  if (!WiFi.softAP(AP_SSID, AP_PASS)) {
    Serial.println("SoftAP creation failed.");
    while (true) delay(1000);
  }

  IPAddress ip = WiFi.softAPIP();
  Serial.print("AP SSID: "); Serial.println(AP_SSID);
  Serial.print("AP IP:   "); Serial.println(ip);

  server.begin();
  Serial.println("Server started");
}

void loop() {
  WiFiClient client = server.available();
  if (!client) return;

  Serial.println("Client connected");

  String currentLine;
  String requestLine; // e.g., "GET /?msg=hello HTTP/1.1"

  // Read HTTP request headers
  unsigned long start = millis();
  while (client.connected() && (millis() - start) < 5000) { // simple timeout
    if (client.available()) {
      char c = client.read();
      if (c == '\r') {
        // ignore
      } else if (c == '\n') {
        if (requestLine.length() == 0) {
          requestLine = currentLine; // first line captured
        }
        if (currentLine.length() == 0) {
          // end of headers
          break;
        }
        currentLine = "";
      } else {
        currentLine += c;
      }
    }
  }

  // Parse the request path from requestLine
  String path;
  if (requestLine.startsWith("GET ")) {
    int sp1 = requestLine.indexOf(' ');
    int sp2 = requestLine.indexOf(' ', sp1 + 1);
    if (sp1 >= 0 && sp2 > sp1) {
      path = requestLine.substring(sp1 + 1, sp2);
    }
  } else {
    // For non-GET, just show the form
  }

  String msg = getQueryParam(path, "msg");
  sendPage(client, msg);

  delay(1);
  client.stop();
  Serial.println("Client disconnected");
}
