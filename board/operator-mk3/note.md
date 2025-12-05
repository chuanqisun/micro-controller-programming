Operator Mk3 PCB change notes

- Increase drill hole to M3
- Shrink board footprint, expose speaker pins
- Use vias instead of pins

Learned that vias are too close.

Mill notes:

Round 1

- front
  - x-set: 5
  - x-actual: 6.71|6.67|6.69 = 6.69
  - y-set: 5
  - y-actual: 10.51|10.51|10.51 = 10.51
  - delta = 10.51 - 6.69 = 3.82

- back
  - x-set: 5 + 3.82 = 8.82

Round 2

Calibrate front from Round 1, (5 + 8.82)/2 = 6.91

- front
  - x-set: 6.91

Round 3

- front
  - x-set: 6
  - left-actual: 7.88 | 7.76 | 7.88 | 7.95 = 7.8675
  - right-actual: 9.50 | 9.51 | 9.51 | 9.54 = 9.515
  - delta = 9.515 - 7.8675 = 1.6475
- back
  - x-set: 6 + 1.6475 = 7.6475 = 7.648 instead

Round 4

- front
  - x-set: 6
  - left-actual: 7.86 | 7.87 | 7.78 | 7.81 = 7.83
  - right-actual: 9.50 | 9.50 | 9.48 | 9.52 = 9.5
  - delta = 9.5 - 7.83 = 1.67
- back
  - x-set: 6 + 1.67 = 7.67

Learning:

- The side with the drills should be the side that has the most solder
- f should have the drill, b should not
