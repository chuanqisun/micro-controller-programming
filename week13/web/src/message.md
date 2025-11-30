## Bluetooth Message Format

```
<op-name>:<args>
```

## Messages

### Find device

Sender: Laptop
Receiver: Operator
Example:

```
find:
```

### Announce origin

Sender: ESP32
Receiver: Laptop
Example:

```
operator:192.168.1.101:8888
```

### Set origin

Sender: Laptop
Receiver: Operator
Example:

```
setorigin:192.168.1.100:8080
```

### Probe changed

Sender: Operator
Receiver: Laptop
Example:

```
probe:100
```
