# gerber2img technique:

- Front: cu + edge, no drill
- Back: cu + edge + drill


Mods project config
- both sides: 1000 dpi
- front side: tool 2 max depth 1.75 -> 1.2 to ensure no cut through, but deep enough to use cliper measure effective offset
- back side: Flip H

# Run 1

board size: 2 by 3 inch
stock board: 3 inch = 76.2 mm
pcb board: 66.98 mm

frontside:
bottom: 5 mm
left: 6.22 mm

backside:
bottom: 5 mm
left: 3 mm

Reflection:

1. The front side png was exported without edge cut, hence scaling up
2. The back side

# Run 2

(set 2 margin, and use 1000 dpi, rather than 999.998 dpi)

stock board: 3 inch, measured at 75.90mm
pcb board: 68.047

backside:
bottom: 5 mm
entered left: 3.9265 mm
expected right: 3.9265 mm
actual left: 5.51 mm
actual right: 4.74 mm

frontside:
bottom: 5 mm
entered left: 3.156 mm = 4.74 - (5.51 - 3.9265 )
expected right: 5.51 mm


# Run 3

frontside:
bottom: 5 mm
entered left: 3.5 mm
actual left: 5.26, 5.23, 5.33, 5.29 avg to 5.2775
actual right: 5.07, 5.05, 5.07, 5.02 avg to 5.0525

backside:
bottom: 5 mm
entered left: 3.275 mm = 5.0525 - (5.2775 - 3.5)
