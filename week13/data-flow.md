# Data flow

- On Web init, web fetch server ip and port from node.js
- Web connects to Operator via Bluetooth
- On connect, Web send `server:<ip>:<udp_rx_port>` to Operator via Bluetooth
- Operator responds with `operator:<ip>:<udp_rx_port>` via Bluetooth
- Web query node.js for server address (IP + Port)
- Web send server address to ESP32 via Bluetooth
- ESP32 streams audio to server using server address via UDP
- Server streams audio to ESP using the IP address + fixed port 8889

## Events

```
<op-name>:<args>
```

## Messages

### Server handshake

Sender: Laptop
Receiver: Operator
Example:

```
server:192.168.1.100:8889
```

### Operator handshake

Sender: ESP32
Receiver: Laptop
Example:

```
operator:192.168.1.101:8888
```

### Probe changed

Sender: Operator
Receiver: Laptop
Example:

```
probe:100
```
