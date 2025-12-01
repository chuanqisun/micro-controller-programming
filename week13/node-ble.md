# Quick start guide

## Provide permissions

In order to allow a connection with the DBus daemon, you have to set up right permissions.

Execute the following command, in order to create the file `/etc/dbus-1/system.d/node-ble.conf`, configured with the current _user id_ (Note: You may need to manually change the _user id_).

```sh
echo '<!DOCTYPE busconfig PUBLIC "-//freedesktop//DTD D-BUS Bus Configuration 1.0//EN"
  "http://www.freedesktop.org/standards/dbus/1.0/busconfig.dtd">
<busconfig>
  <policy user="__USERID__">
   <allow own="org.bluez"/>
    <allow send_destination="org.bluez"/>
    <allow send_interface="org.bluez.GattCharacteristic1"/>
    <allow send_interface="org.bluez.GattDescriptor1"/>
    <allow send_interface="org.freedesktop.DBus.ObjectManager"/>
    <allow send_interface="org.freedesktop.DBus.Properties"/>
  </policy>
</busconfig>' | sed "s/__USERID__/$(id -un)/" | sudo tee /etc/dbus-1/system.d/node-ble.conf > /dev/null
```

## STEP 1: Get Adapter

To start a Bluetooth Low Energy (BLE) connection you need a Bluetooth adapter instance.

```javascript
const { createBluetooth } = require("node-ble");
const { bluetooth, destroy } = createBluetooth();
const adapter = await bluetooth.defaultAdapter();
```

## STEP 2: Start discovering

In order to find a Bluetooth Low Energy device out, you have to start a discovery operation.

```javascript
if (!(await adapter.isDiscovering())) await adapter.startDiscovery();
```

## STEP 3: Get a device, Connect and Get GATT Server

Use the adapter instance in order to get a remote Bluetooth device, then connect and interact with the GATT (Generic Attribute Profile) server.

```javascript
const device = await adapter.waitDevice("00:00:00:00:00:00");
await device.connect();
const gattServer = await device.gatt();
```

## STEP 4a: Read and write a characteristic.

```javascript
const service1 = await gattServer.getPrimaryService("uuid");
const characteristic1 = await service1.getCharacteristic("uuid");
await characteristic1.writeValue(Buffer.from("Hello world"));
const buffer = await characteristic1.readValue();
console.log(buffer);
```

## STEP 4b: Subscribe to a characteristic.

```javascript
const service2 = await gattServer.getPrimaryService("uuid");
const characteristic2 = await service2.getCharacteristic("uuid");
characteristic2.on("valuechanged", (buffer) => {
  console.log(buffer);
});
await characteristic2.startNotifications();
```

## STEP 5: Disconnect

When you have done you can stop notifications, disconnect and destroy the session.

```javascript
await characteristic2.stopNotifications();
await device.disconnect();
destroy();
```

# Node BLE APIs

## Classes

- [Adapter][1]

  Adapter class interacts with the local bluetooth adapter

- [Bluetooth][2]

  Top level object that represent a bluetooth session

- [Device][3] ⇐ `EventEmitter`

  Device class interacts with a remote device.

- [GattCharacteristic][4] ⇐ `EventEmitter`

  GattCharacteristic class interacts with a GATT characteristic.

- [GattServer][5]

  GattServer class that provides interaction with device GATT profile.

- [GattService][6]

  GattService class interacts with a remote GATT service.

## Functions

- [createBluetooth()][7] ⇒ `NodeBleInit`

  Init bluetooth session and return

## Typedefs

- [WritingMode][8]
- [NodeBleSession][9] : `Object`

# Specs

## Adapter

Adapter class interacts with the local bluetooth adapter

**Kind**: global class\
**See**: You can construct an Adapter session via [getAdapter][10] method

- [Adapter][1]
  - [.getAddress()][11] ⇒ `string`
  - [.getAddressType()][12] ⇒ `string`
  - [.getName()][13] ⇒ `string`
  - [.getAlias()][14] ⇒ `string`
  - [.isPowered()][15] ⇒ `boolean`
  - [.isDiscovering()][16] ⇒ `boolean`
  - [.startDiscovery()][17]
  - [.stopDiscovery()][18]
  - [.devices()][19] ⇒ `Array.<string>`
  - [.getDevice(uuid)][20] ⇒ [Device][3]
  - [.waitDevice(uuid, \[timeout\], \[discoveryInterval\])][21] ⇒ [Device][3]
  - [.toString()][22] ⇒ `string`

### adapter.getAddress() ⇒ `string`

The Bluetooth device address.

**Kind**: instance method of [Adapter][1]

### adapter.getAddressType() ⇒ `string`

The Bluetooth device Address Type. (public, random)

**Kind**: instance method of [Adapter][1]

### adapter.getName() ⇒ `string`

The Bluetooth system name

**Kind**: instance method of [Adapter][1]

### adapter.getAlias() ⇒ `string`

The Bluetooth friendly name.

**Kind**: instance method of [Adapter][1]

### adapter.isPowered() ⇒ `boolean`

Current adapter state.

**Kind**: instance method of [Adapter][1]

### adapter.isDiscovering() ⇒ `boolean`

Indicates that a device discovery procedure is active.

**Kind**: instance method of [Adapter][1]

### adapter.startDiscovery()

This method starts the device discovery session.

**Kind**: instance method of [Adapter][1]

### adapter.stopDiscovery()

This method will cancel any previous StartDiscovery transaction.

**Kind**: instance method of [Adapter][1]

### adapter.devices() ⇒ `Array.<string>`

List of found device names (uuid).

**Kind**: instance method of [Adapter][1]

### adapter.getDevice(uuid) ⇒ [Device][3]

Init a device instance and returns it.

**Kind**: instance method of [Adapter][1]

| Param | Type     | Description  |
| ----- | -------- | ------------ |
| uuid  | `string` | Device Name. |

### adapter.waitDevice(uuid, \[timeout], \[discoveryInterval]) ⇒ [Device][3]

Wait that a specific device is found, then init a device instance and returns it.

**Kind**: instance method of [Adapter][1]

| Param                | Type     | Default  | Description                                                |
| -------------------- | -------- | -------- | ---------------------------------------------------------- |
| uuid                 | `string` |          | Device Name.                                               |
| \[timeout]           | `number` | `120000` | Time (ms) to wait before throwing a timeout expection.     |
| \[discoveryInterval] | `number` | `1000`   | Interval (ms) frequency that verifies device availability. |

### adapter.toString() ⇒ `string`

Human readable class identifier.

**Kind**: instance method of [Adapter][1]

## Bluetooth

Top level object that represent a bluetooth session

**Kind**: global class\
**See**: You can construct a Bluetooth session via [createBluetooth][7] function

- [Bluetooth][2]
  - [.adapters()][23] ⇒ `Array.<string>`
  - [.defaultAdapter()][24] ⇒ [Adapter][1]
  - [.getAdapter(adapter)][10] ⇒ [Adapter][1]
  - [.activeAdapters()][25] ⇒ `Promise.<Array.<Adapter>>`

### bluetooth.adapters() ⇒ `Array.<string>`

List of available adapter names

**Kind**: instance method of [Bluetooth][2]

### bluetooth.defaultAdapter() ⇒ [Adapter][1]

Get first available adapter

**Kind**: instance method of [Bluetooth][2]\
**Throws**:

- Will throw an error if there aren't available adapters.

### bluetooth.getAdapter(adapter) ⇒ [Adapter][1]

Init an adapter instance and returns it

**Kind**: instance method of [Bluetooth][2]\
**Throw**: Will throw adapter not found if provided name isn't valid.

| Param   | Type     | Description        |
| ------- | -------- | ------------------ |
| adapter | `string` | Name of an adapter |

### bluetooth.activeAdapters() ⇒ `Promise.<Array.<Adapter>>`

List all available (powered) adapters

**Kind**: instance method of [Bluetooth][2]

## Device ⇐ `EventEmitter`

Device class interacts with a remote device.

**Kind**: global class\
**Extends**: `EventEmitter`\
**See**: You can construct a Device object via [getDevice][20] method

- [Device][3] ⇐ `EventEmitter`
  - [.getName()][26] ⇒ `string`
  - [.getAddress()][27] ⇒ `string`
  - [.getAddressType()][28] ⇒ `string`
  - [.getAlias()][29] ⇒ `string`
  - [.getRSSI()][30] ⇒ `number`
  - [.getTXPower()][31] ⇒ `number`
  - [.getManufacturerData()][32] ⇒ `Object.<string, any>`
  - [.getAdvertisingData()][33] ⇒ `Object.<string, any>`
  - [.getServiceData()][34] ⇒ `Object.<string, any>`
  - [.isPaired()][35] ⇒ `boolean`
  - [.isConnected()][36] ⇒ `boolean`
  - [.pair()][37]
  - [.cancelPair()][38]
  - [.connect()][39]
  - [.disconnect()][40]
  - [.gatt()][41] ⇒ [GattServer][5]
  - [.toString()][42] ⇒ `string`
  - ["connect"][43]
  - ["disconnect"][44]

### device.getName() ⇒ `string`

The Bluetooth remote name.

**Kind**: instance method of [Device][3]

### device.getAddress() ⇒ `string`

The Bluetooth device address of the remote device.

**Kind**: instance method of [Device][3]

### device.getAddressType() ⇒ `string`

The Bluetooth device Address Type (public, random).

**Kind**: instance method of [Device][3]

### device.getAlias() ⇒ `string`

The name alias for the remote device.

**Kind**: instance method of [Device][3]

### device.getRSSI() ⇒ `number`

Received Signal Strength Indicator of the remote device

**Kind**: instance method of [Device][3]

### device.getTXPower() ⇒ `number`

Advertised transmitted power level.

**Kind**: instance method of [Device][3]

### device.getManufacturerData() ⇒ `Object.<string, any>`

Advertised transmitted manufacturer data.

**Kind**: instance method of [Device][3]

### device.getAdvertisingData() ⇒ `Object.<string, any>`

Advertised transmitted data. (experimental: this feature might not be fully supported by bluez)

**Kind**: instance method of [Device][3]

### device.getServiceData() ⇒ `Object.<string, any>`

Advertised transmitted data.

**Kind**: instance method of [Device][3]

### device.isPaired() ⇒ `boolean`

Indicates if the remote device is paired.

**Kind**: instance method of [Device][3]

### device.isConnected() ⇒ `boolean`

Indicates if the remote device is currently connected.

**Kind**: instance method of [Device][3]

### device.pair()

This method will connect to the remote device

**Kind**: instance method of [Device][3]

### device.cancelPair()

This method can be used to cancel a pairing operation initiated by the Pair method.

**Kind**: instance method of [Device][3]

### device.connect()

Connect to remote device

**Kind**: instance method of [Device][3]

### device.disconnect()

Disconnect remote device

**Kind**: instance method of [Device][3]

### device.gatt() ⇒ [GattServer][5]

Init a GattServer instance and return it

**Kind**: instance method of [Device][3]

### device.toString() ⇒ `string`

Human readable class identifier.

**Kind**: instance method of [Device][3]

### "connect"

Connection event

**Kind**: event emitted by [Device][3]\
**Properties**

| Name      | Type      | Description                          |
| --------- | --------- | ------------------------------------ |
| connected | `boolean` | Indicates current connection status. |

### "disconnect"

Disconection event

**Kind**: event emitted by [Device][3]\
**Properties**

| Name      | Type      | Description                          |
| --------- | --------- | ------------------------------------ |
| connected | `boolean` | Indicates current connection status. |

## GattCharacteristic ⇐ `EventEmitter`

GattCharacteristic class interacts with a GATT characteristic.

**Kind**: global class\
**Extends**: `EventEmitter`\
**See**: You can construct a GattCharacteristic object via [getCharacteristic][45] method.

- [GattCharacteristic][4] ⇐ `EventEmitter`
  - [.getUUID()][46] ⇒ `string`
  - [.getFlags()][47] ⇒ `Array.<string>`
  - [.isNotifying()][48] ⇒ `boolean`
  - [.readValue(\[offset\])][49] ⇒ `Buffer`
  - [.writeValue(value, \[optionsOrOffset\])][50]
  - [.writeValueWithoutResponse(value, \[offset\])][51] ⇒ `Promise`
  - [.writeValueWithResponse(value, \[offset\])][52] ⇒ `Promise`
  - [.startNotifications()][53]
  - ["valuechanged"][54]

### gattCharacteristic.getUUID() ⇒ `string`

128-bit characteristic UUID.

**Kind**: instance method of [GattCharacteristic][4]

### gattCharacteristic.getFlags() ⇒ `Array.<string>`

Defines how the characteristic value can be used.

**Kind**: instance method of [GattCharacteristic][4]

### gattCharacteristic.isNotifying() ⇒ `boolean`

True, if notifications or indications on this characteristic are currently enabled.

**Kind**: instance method of [GattCharacteristic][4]

### gattCharacteristic.readValue(\[offset]) ⇒ `Buffer`

Read the value of the characteristic

**Kind**: instance method of [GattCharacteristic][4]

| Param     | Type     | Default |
| --------- | -------- | ------- |
| \[offset] | `number` | `0`     |

### gattCharacteristic.writeValue(value, \[optionsOrOffset])

Write the value of the characteristic.

**Kind**: instance method of [GattCharacteristic][4]

| Param                     | Type        | Default    | Description                                 |
| ------------------------- | ----------- | ---------- | ------------------------------------------- |
| value                     | `Buffer`    |            | Buffer containing the characteristic value. |
| \[optionsOrOffset]        | \\\|        | `0`        | Starting offset or writing options.         |
| \[optionsOrOffset.offset] | `number`    | `0`        | Starting offset.                            |
| \[optionsOrOffset.type]   | WritingMode | `reliable` | Writing mode                                |

### gattCharacteristic.writeValueWithoutResponse(value, \[offset]) ⇒ `Promise`

Write the value of the characteristic without waiting for the response.

**Kind**: instance method of [GattCharacteristic][4]

| Param     | Type     | Default | Description                                 |
| --------- | -------- | ------- | ------------------------------------------- |
| value     | `Buffer` |         | Buffer containing the characteristic value. |
| \[offset] | `number` | `0`     | Starting offset.                            |

### gattCharacteristic.writeValueWithResponse(value, \[offset]) ⇒ `Promise`

Write the value of the characteristic and wait for the response.

**Kind**: instance method of [GattCharacteristic][4]

| Param     | Type     | Default | Description                                 |
| --------- | -------- | ------- | ------------------------------------------- |
| value     | `Buffer` |         | Buffer containing the characteristic value. |
| \[offset] | `number` | `0`     | Starting offset.                            |

### gattCharacteristic.startNotifications()

Starts a notification session from this characteristic. It emits valuechanged event when receives a notification.

**Kind**: instance method of [GattCharacteristic][4]

### "valuechanged"

Notification event

**Kind**: event emitted by [GattCharacteristic][4]

## GattServer

GattServer class that provides interaction with device GATT profile.

**Kind**: global class\
**See**: You can construct a Device object via [gatt][41] method

- [GattServer][5]
  - [.services()][55] ⇒ `Array.<string>`
  - [.getPrimaryService(uuid)][56] ⇒ [GattService][6]

### gattServer.services() ⇒ `Array.<string>`

List of available services

**Kind**: instance method of [GattServer][5]

### gattServer.getPrimaryService(uuid) ⇒ [GattService][6]

Init a GattService instance and return it

**Kind**: instance method of [GattServer][5]

| Param | Type     |
| ----- | -------- |
| uuid  | `string` |

## GattService

GattService class interacts with a remote GATT service.

**Kind**: global class\
**See**: You can construct a GattService object via [getPrimaryService][56] method.

- [GattService][6]
  - [.isPrimary()][57] ⇒ `boolean`
  - [.getUUID()][58] ⇒ `string`
  - [.characteristics()][59] ⇒ `Array.<string>`
  - [.getCharacteristic(uuid)][45] ⇒ [GattCharacteristic][4]
  - [.toString()][60] ⇒ `string`

### gattService.isPrimary() ⇒ `boolean`

Indicates whether or not this GATT service is a primary service.

**Kind**: instance method of [GattService][6]

### gattService.getUUID() ⇒ `string`

128-bit service UUID.

**Kind**: instance method of [GattService][6]

### gattService.characteristics() ⇒ `Array.<string>`

List of available characteristic names.

**Kind**: instance method of [GattService][6]

### gattService.getCharacteristic(uuid) ⇒ [GattCharacteristic][4]

Init a GattCharacteristic instance and return it

**Kind**: instance method of [GattService][6]

| Param | Type     | Description          |
| ----- | -------- | -------------------- |
| uuid  | `string` | Characteristic UUID. |

### gattService.toString() ⇒ `string`

Human readable class identifier.

**Kind**: instance method of [GattService][6]

## createBluetooth() ⇒ `NodeBleInit`

Init bluetooth session and return

**Kind**: global function\
**Example**

```
const { createBluetooth } = require('node-ble')

async function main () {
 const { bluetooth, destroy } = createBluetooth()
 const adapter = await bluetooth.defaultAdapter()
 // do here your staff
 destroy()
}
```

## WritingMode

**Kind**: global typedef\
**Properties**

| Name     | Type     | Description            |
| -------- | -------- | ---------------------- |
| command  | `string` | Write without response |
| request  | `string` | Write with response    |
| reliable | `string` | Reliable Write         |

## NodeBleSession : `Object`

**Kind**: global typedef\
**Properties**

| Name      | Type      | Description             |
| --------- | --------- | ----------------------- |
| bluetooth | Bluetooth | Bluetooth session       |
| destroy   | `func`    | Close bluetooth session |

[1]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter
[2]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Bluetooth
[3]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device
[4]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattCharacteristic
[5]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattServer
[6]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattService
[7]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#createBluetooth
[8]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#WritingMode
[9]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#NodeBleSession
[10]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Bluetooth+getAdapter
[11]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter+getAddress
[12]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter+getAddressType
[13]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter+getName
[14]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter+getAlias
[15]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter+isPowered
[16]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter+isDiscovering
[17]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter+startDiscovery
[18]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter+stopDiscovery
[19]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter+devices
[20]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter+getDevice
[21]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter+waitDevice
[22]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Adapter+toString
[23]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Bluetooth+adapters
[24]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Bluetooth+defaultAdapter
[25]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Bluetooth+activeAdapters
[26]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+getName
[27]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+getAddress
[28]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+getAddressType
[29]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+getAlias
[30]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+getRSSI
[31]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+getTXPower
[32]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+getManufacturerData
[33]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+getAdvertisingData
[34]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+getServiceData
[35]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+isPaired
[36]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+isConnected
[37]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+pair
[38]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+cancelPair
[39]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+connect
[40]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+disconnect
[41]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+gatt
[42]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+toString
[43]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+event_connect
[44]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#Device+event_disconnect
[45]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattService+getCharacteristic
[46]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattCharacteristic+getUUID
[47]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattCharacteristic+getFlags
[48]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattCharacteristic+isNotifying
[49]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattCharacteristic+readValue
[50]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattCharacteristic+writeValue
[51]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattCharacteristic+writeValueWithoutResponse
[52]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattCharacteristic+writeValueWithResponse
[53]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattCharacteristic+startNotifications
[54]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattCharacteristic+event_valuechanged
[55]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattServer+services
[56]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattServer+getPrimaryService
[57]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattService+isPrimary
[58]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattService+getUUID
[59]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattService+characteristics
[60]: https://github.com/chrvadala/node-ble/blob/main/docs/api.md#GattService+toString
