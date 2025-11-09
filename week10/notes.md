Via sizing:
https://fab.cba.mit.edu/classes/863.16/doc/tutorials/PCB_Rivets/#:~:text=For%20the%201.0mm%20rivets%2C%20the%20best%20hole,securing%20(flanging)%20a%20rivet%20to%20the%20board:

# Outline

- Group assignment:
  - I went to the training hosted by Kat.
  - Read the SDS for smooth-on 300 series plastic and smooth-on 30 series rubber.
  - Comparing molding
    - 3D Printed Mold
      - FDM
        - PLA
        - PETG
      - SLA
    - CNC Machined Mold
      - Wax
  - Comparing casting
    - Two step
      - 3D print -> Rubber -> Plastic
      - 3D print -> Silicone -> Plastic
    - Single step
      - 3D print -> Silicone
- Project: A Manual Particle Accelerator
  - CNC wax mold -> Rubber mold -> Plastic part
    - I've been using Onshape for its linux compatibility.
    - Learning from the CNC week that using someone else's CAM software adds overhead, so I'm going to learn FreeCAD for this week
    - Reference tutorials
      - 3D pocketing
      - Adaptive clearing
    - Modeling parts in Onshape, create tool paths in FreeCAD
      - Problem with narrow gutter. The toolpath can't detect the ring-like pocket geometry
      - Increasing ring-width to be significantly greater than tool diameter solves the problem (tool: 1/8", ring width: 3.4mm)
      - Multiple tool paths feature is very buggy in FreeCAD. After the 1st tool path, producing paths for the remaining material doesn't work
    - Tried modeling directly in FreeCAD
      - Transitioning from Onshape to FreeCAD is a bit rough, as FreeCAD feels more rigid
      - Finished the mold design, tested in CAM, but still had issues with multiple tool paths
    - Switching to Mods for tool path
      - Unable to generate multiple tool paths that builds on each other
      - Realized the U-pipe geometry requires ball endmill. Adding custom bit geometry would take too long
        - Had I known better, I would practice FreeCAD CAM during the machine week, but time is limited, I had to move on
  - 3D printing mold -> Rubber mold -> Plastic part
    - Tool the design in Onshape, sliced, and printed in PLA
    - Casted, and realized that I got the positive/negative inverted
    - To smooth surface, I considered
      - Apply resin coating: Kat's feedback is that resin inhibits silicone curing, use wax
      - Apply wax coating: switch to PETG, because wax melts PLA
    - Melt, brush on, Heat gun, drain
    - I warped the PETG during the drain process
    - Casting the rubber mold
      - Difficult release from PETG mold
      - Damaged the rubber
      - Fixed it with a quick 3D printed support ring
      - The waxed mold couldn't eliminiate the layer lines, and also, it destroyed the sharp edges
    - Switching back to PLA
      - Enabled ironing
      - Reduced layer height to 0.05mm
      - Switched to concentric infill
    - Casting
      - Shake bottle causing too many bubbles
      - Stir is better
      - Pulling bubbles with vaccum is bad, as it cause the bottom surface to be rough
    - Post-processing
      - Belt sander and deburring tools to remove rough edges
      - The lips are too tight. My next iteraction added fi

# Reference notes

## Cad for CAM

- pos/neg spatial reasoning
- lofting

## Setting up cam

- freecad 1st time setup (previously used Dan's fusion360)
- tutorial: https://www.youtube.com/watch?v=ER1wUvfIswk
- copy pasted example file 5mm_Endmill.fctb and modified for 1/8", 1/16", 1/32" endmills

```json
{
  "version": 2,
  "name": "1/8 inch Endmill",
  "shape": "endmill.fcstd",
  "parameter": {
    "CuttingEdgeHeight": "30.0000 mm",
    "Diameter": "3.1750 mm",
    "Length": "50.0000 mm",
    "ShankDiameter": "3.0000 mm"
  },
  "attribute": {}
}
```

## Roughing

- use 1/8" endmill
- Step down: 1mm
- Cut mode: offset
- Checked: Min Travel, Use Rest Machining

## Tried:

- FreeCAD adaptive clearing, 3D pocket, Mods
- The programs all have issues with my geometry
