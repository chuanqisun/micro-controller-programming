# Handleshake

## Voice

- node.js server send `server:<ip>:<udp_rx_port>` to Operator via BLE
- Operator responds with `operator:<ip>:<udp_rx_port>` via BLE
- ESP32 streams audio to server using server address via UDP
- Server streams audio to ESP using the IP address + fixed port 8889

## Buttons and Probe

- node.js initiates pairing with Operator via BLE
- Operator sends `probe:<value>` when probe changes via BLE
- Operator sends `buttons:<state>` when buttons change via BLE

## LED lighting

- node.js initiates pairing with Switchboard via BLE
- node.js sends `led:on` or `led:off` to Switchboard via BLE

# Events

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

### Buttons changed

Sender: Operator
Receiver: Laptop
Example:

```
buttons:on,off
```

### LED control

Sender: Laptop
Receiver: Switchboard
Example:

```
blink:3
```
