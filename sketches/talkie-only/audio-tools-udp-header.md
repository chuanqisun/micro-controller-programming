A UDP class which makes sure that we can use UDP as AudioSource and AudioSink. By default the WiFiUDP object is used and we login to wifi if the ssid and password is provided and we are not already connected.

```cpp
namespace audio_tools {

class UDPStream : public BaseStream {
public:
UDPStream() = default;

UDPStream(const char *ssid, const char *password) {
setSSID(ssid);
setPassword(password);
}

UDPStream(UDP &udp) { setUDP(udp); }

void setUDP(UDP &udp) { p_udp = &udp; };

int availableForWrite() { return 1492; }

int available() override {
int size = p_udp->available();
// if the curren package is used up we prvide the info for the next
if (size == 0) {
size = p_udp->parsePacket();
}
return size;
}

bool begin(IPAddress a, uint16_t port) {
connect();
remote_address_ext = a;
remote_port_ext = port;
return p_udp->begin(port);
}

bool begin(uint16_t port, uint16_t port_ext = 0) {
connect();
remote_address_ext = IPAddress((uint32_t)0);
remote_port_ext = port_ext != 0 ? port_ext : port;
printIP();
return p_udp->begin(port);
}

bool beginMulticast(IPAddress address, uint16_t port) {
connect();
return p_udp->beginMulticast(address,port);
 }

uint16_t remotePort() {
uint16_t result = p_udp->remotePort();
return result != 0 ? result : remote_port_ext;
}

IPAddress remoteIP() {
// Determine address if it has not been specified
if ((uint32_t)remote_address_ext == 0) {
remote_address_ext = p_udp->remoteIP();
}
// IPAddress result = p_udp->remoteIP();
// LOGI("ip: %u", result);
return remote_address_ext;
}

size_t write(const uint8_t \*data, size_t len) override {
TRACED();
p_udp->beginPacket(remoteIP(), remotePort());
size_t result = p_udp->write(data, len);
p_udp->endPacket();
return result;
}

size_t readBytes(uint8_t _data, size_t len) override {
TRACED();
size_t avail = available();
size_t bytes_read = 0;
if (avail > 0) {
// get the data now
bytes_read = p_udp->readBytes((uint8_t _)data, len);
}
return bytes_read;
}

void setSSID(const char \*ssid) { this->ssid = ssid; }

void setPassword(const char \*pwd) { this->password = pwd; }

protected:
WiFiUDP default_udp;
UDP *p_udp = &default_udp;
uint16_t remote_port_ext = 0;
IPAddress remote_address_ext;
const char *ssid = nullptr;
const char \*password = nullptr;

void printIP(){
Serial.print(WiFi.localIP());
Serial.print(":");
Serial.println(remote_port_ext);
}

void connect() {
if (WiFi.status() != WL_CONNECTED && ssid != nullptr &&
password != nullptr) {
WiFi.begin(ssid, password);
while (WiFi.status() != WL_CONNECTED) {
delay(500);
}
}

}
}

} // namespace audio_tools
```
