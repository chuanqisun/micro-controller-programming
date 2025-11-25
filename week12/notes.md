---
title: Networking ^ 3
---

- I accidentally satisfied the networking requirement twice during the Input device and Machine building week
- I want to make more progress towards the final project but also build something fun under the theme of the week
- I decided to temporarily turn my final project's hardware in whack-a-mole game: switchboard lights up LEDs, user plugs phone jack to "whack" it off, and another LED lights up...
- In the end, I realized that I had build 3 layers of the networking in one project. Kind of neat.

## Layer 1: Voltage as physical address

- In my final project, I have a walkie talkie (aka **Operator**) that can plug in a panel of phone jacks (aka **Switchboard**). In the Electronics week, I prototyped the TRRS connection. - This week, I fabricated all the phone jacks, with wiring, solder, and mounting

[show photo of frabriation](...)

- I fell victim of the information denial trap as observed in behavioral economics. An example of information denial is when patient could scan for potential desease but they worry about the consequence of such knowledge and therefore choose to not know.
- I was on a happy streak soldering all the TRRS jack wires and thought as long as I solder all of the them the same way, it would be fine.
- But as soon as I finished soldering, I recalled that Neil said those connetors are "nasty" because when you plug in, the different terminals would touch all the conductive parts along the way in.
- Here is my initial wiring that took more than 4 hours to solder:

- Switchboard
  - Tip: Address bit 0 (digital write high or ground)
  - Ring1: Ground
  - Ring2: Address bit 1
  - Sleeve: Address bit 2
- Operator
  - Tip: Address bit 0 (digital read)
  - Ring1: Ground
  - Ring2: Address bit 1
  - Sleeve: Address bit 2

Visualize in the 4 by 4 table, where each cell represents a potential contact due to the sliding motion:

```
TRRS
   TRRS

TRRS
  TRRS


TRRS
 TRRS

TRRS
TRRS
```

Visualize this in grid, when any digital write high (R2, S) touches the ground (R1), a short happens:

|               | Tip (write) | Ring1 (GRD) | Ring2 (write) | Sleeve (write) |
| ------------- | ----------- | ----------- | ------------- | -------------- |
| Tip (read)    | OK          | OK          | OK            | OK             |
| Ring1 (GRD)   |             | OK          | Short         | Short          |
| Ring2 (read)  |             |             | OK            | OK             |
| Sleeve (read) |             |             |               | OK             |

Realizing my mistake, I moved the ground to the tip so no other pins can touch it

|               | Tip (GRD) | Ring1 (write) | Ring2 (write) | Sleeve (write) |
| ------------- | --------- | ------------- | ------------- | -------------- |
| Tip (GRD)     | OK        | OK            | OK            | OK             |
| Ring1 (read)  |           | OK            | OK            | OK             |
| Ring2 (read)  |           |               | OK            | OK             |
| Sleeve (read) |           |               |               | OK             |

- Since I already used heat shrink tubes to reinforce the ribbon wires' pin headers, making this changes means removing the heat shrink tube and rearrange the wires. Luckily, the ribbon wires can be re-aranged. That was another 2 hour job.
- In programming, the Switchboard is hard wired to have digital write high or ground on each of the address bits.
- Originally, I thought I could have 8 addresses (3 bits) but because of the shorting issue I need to reserve an address to represent "Unplugged" state, I ended up having 7 usable addresses (`000` to `110`) and `111` represents "Unplugged".

Switchboard:

```cpp
//...
```

Operator:

```cpp
//...
```

## Layer 2: Mac and name as BLE address

- I added the LED lights on the Switchboard. (See details in Final project page)
- Since the TRRS connection is a one-way communication from Switchboard to Operator, I need a way for the Operator to send information back to the Switchboard to change the state of LED lights
- Here is the full data flow:
  - Operator reads an 3-bit address from Switchboard
  - Operator sends the address to the browser app
  - The browser app sends a new address to the Switchboard
  - Switchboard lights up the LED corresponding to the address

## Layer 3: URL as web address

# Preparation

- 3D print
- Solder

# LED connection

See sketches/led-test

# Web -> ESP32: turn one light on with Bluetooth

See sketches/blue-light

# ESP32 -> Web: Stream probe value to browser

Stream raw probe
Debug bit address circuit (add image)
See archive/streaming-probe

# ESP32 -> Web -> ESP32: Whack-a-mole game

I found `Switchboard` became `Switchbo` in the device list. I believe the bluetooth library is shortening the name to 8 characters.

Device name overflow:

```js
deviceSw = await navigator.bluetooth.requestDevice({
  filters: [{ name: "Switchboard" }],
  optionalServices: [SERVICE_UUID],
});
```

into

```js
deviceSw = await navigator.bluetooth.requestDevice({
  filters: [{ name: "sw" }],
  optionalServices: [SERVICE_UUID],
});
```
