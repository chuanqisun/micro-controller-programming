# Week 10:

> Hofstadter's law: It always takes longer than you expect, even when you take into account Hofstadter's law.

> Neal's law: You will cast the opposite of what you expect, even after Neal told you about Neal's law.

## Group assignment

- I went to the training hosted by [Kat](https://fabacademy.org/2023/labs/kamakura/students/ekaterina-kormilitsyna/).
- Read the SDS for oomoo 30 rubber and smooth-cast 300 plastic, both by Smooth-On.
- See [group notes](https://fab.cba.mit.edu/classes/MAS.863/CBA/group_assignments/week10/).

## Project: Manual Particle Accelerator

- Who doesn't like particle physics? Smashing particles together at near light speed makes cool pictures and wins you [Nobel prizes](https://en.wikipedia.org/wiki/Higgs_boson). Why don't we do this at home?
- I sketched out the positive/negative hard/soft relations, it's time to make!

### The CAM Debacle

- CNC wax mold -> Rubber mold -> Plastic part
  - I've been using Onshape for its linux compatibility.
  - Learning from the CNC week that using someone else's CAM software adds overhead, so I'm going to learn FreeCAD for this week
  - Reference tutorials
    - [3D pocketing](https://academy.cba.mit.edu/classes/computer_machining/3DRough.mp4)
    - [Adaptive clearing](https://academy.cba.mit.edu/classes/computer_machining/AdaptiveRest.mp4)
  - Modeling parts in Onshape, create tool paths in FreeCAD
    - A quick boolean operation against a stock geometry reveals design flow: I had edges without thickness
      ![TODO: show image of boolean operation failure](...)
    - I managed to setup machine job, creating tool bits based on example endmill shapes, modifying the json file

    ```json
    // TODO embed json file
    ```

    - Problem with narrow gutter. The toolpath can't detect the ring-like pocket geometry
      ![TODO: show image of FreeCAD toolpath failure](...)
    - Increasing ring-width to be significantly greater than tool diameter solves the problem, but I didn't want to alter the design
    - Multiple tool paths feature is very buggy in FreeCAD. After the 1st tool path, producing paths for the remaining material doesn't work

  - Tried modeling directly in FreeCAD
    - Transitioning from Onshape to FreeCAD is a bit rough, as FreeCAD feels more rigid
    - Finished the mold design, tested in CAM, but still had issues with multiple tool paths
      ![TODO: show FreeCAD toolpath failure](...)
  - Switching to Mods for tool path
    - Unable to generate multiple tool paths that builds on each other
    - Realized the U-pipe geometry requires ball endmill. Adding custom bit geometry would take too long
    - It still failed to generate proper tool paths (similar issues to FreeCAD CAM). I'm suspecting issues with my modeling process
  - List of what I failed at (2x2 grid, showing modeling software vs CAM software and the issue I got)
    - Onshape modeling -> FreeCAD CAM: unnecessary vertical travels
    - FreeCAD modeling -> FreeCAD CAM: missing tool paths on half of the ring
    - Onshape modeling -> Mods CAM: unnecessary horizontal back-and-forth travels
    - FreeCAD modeling -> Mods CAM: missing tool paths on half of the ring

- In the spirit of supply driven project management, I need to move forward with something I can make real progress on. 3D printing it is!

### Table of contents, Literally

- Image of a table, show from top to bottom, each iteration I've been through
  ![TODO: show a physical gantt chart of artifacts](...)
- From left to right is the mother-mold, the mold, and the cast
- Timeline is aligned, staggered development visualized

### Perfectly Making The Wrong Thing

- Design in Onshape, sliced, and printed in PLA
  - ![TODO: show CAD model](...)
  - ![TODO: printing result](...)
- To smooth surface, I considered
  - Apply resin coating: Kat's feedback is that resin inhibits silicone curing, use wax
  - Apply wax coating: switch to PETG, because wax melts PLA
- Melt, brush on, Heat gun, drain
- I warped the PETG during the drain process
- Casting the rubber mold
  - The waxed mold couldn't eliminiate the layer lines, and also, it destroyed the sharp edges
    ![TODO: show waxing process](...)
- Comparison
  - PLA is easy to print. If the printer is well-calibrated, the surface can be very smooth, but the layer lines are still visible.
  - PETG is more difficult to print. In our shop, the fillament had quality issue so the resulting surface isn't ideal. With wax treament, the sharp edges were smoothed out but some of the layer lines remained.
- Casted, and realized that I got the positive/negative inverted
  - ![TODO: casting process](...)
- Switching back to PLA
  - I recalled from the 3D printing week there was an ironing setting. I wonder if that can improve the surface
  - Reduced layer height to 0.05mm
  - Switched to concentric infill
    - This ends up speeding up the print quite significantly, probably because my geometry is circle like so the concentric infill minimizes travel moves
    - See characteristics photo
    - Top left: monotonic line infill
    - Top right: concentric infill
    - Bottom left: Ironing at 0.15mm spacing, 15% flow rate
    - Bottom right: Ironing at 0.1mm spacing, 10% flow rate
      ![TODO: show comparison photos](...)
  - "Low and slow" -- Texas BBQ pitmaster.
  - Low layer height and slow ironing does the trick.
- Casting the rubber mold from poorly ironed PLA mold
  - I used a glass to press down the backside of the rubber as it cures
    - Extremely difficult to release from glass
      ![TODO: show glass release photo](...)
  - It was also extremely difficult to release the rubber from the plastic mold
    - "Poor worker blaming his tools". I've tried nearly all of the 3D printers in the shop and identified 3 machines that works consistently well
    - Due to printing congestion, I used the least performant printer. There as not only visible layer lines, but they had a very rough texture that grabbed onto the rubber
    - I torn the wall of the rubber
      ![TODO: show torn rubber photo](...)
    - Next time, I should add more draft angle
    - As a work around, I 3D printed a support ring to hold the mold in shape
      ![TODO: show image of adhoc support ring](...)
- During parts casting, I learned a few things
  - Shake bottle causing too many bubbles. It's ok to pour and stir using the "sheering" motion mentioned in the lecture.
  - Pulling bubbles with vaccum is bad, as it cause the bottom surface to be rough
    ![TODO: show comparison photos](...)
  - This prompted me to:
    - Add chamfer and increased silicone base thickness
    - Switch to the best PLA printer in the lab
- Post-processing
  - Belt sander and deburring tools to remove rough edges
    ![TODO: show post-processing photo](...)
  - The interface are too tight. But after enough repeated mating, the two parts finally fit well.
    - Kerf makes the male part wider and female part narrower. Should adjust for that
      ![TODO: show the result](...)

## Reflection

- Single threaded tasks carry much more risk. Mother-mold -> Mold -> Cast is a linear process, and any failure in the chain causes big overhauls. It's worth being more cautious and validating the designs as we go.
- There are emotional factors at play. One of my 3D printing tasks was near finish when I realized that I should have added fillet on the interface. I couldn't stop the job because I fell victim to the sunk cost fallacy.
- I mistakely flipped the positive/negative relation, even when I was fully aware of such fallacy. Sometimes, it's better to have others check your work than trusting your own brain.
- The "table of contents" show how important pipelining is. Imagine doing this in a single thread, it would take 40+ hours.

## Appendix

- TODO, attach: Infill and ironing testing print
- TODO, attach: Final model for CNC mother-mold
- TODO, attach: Final model for 3D printable mother-mold

# Raw notes

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
