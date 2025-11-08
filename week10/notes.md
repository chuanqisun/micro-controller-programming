Via sizing:
https://fab.cba.mit.edu/classes/863.16/doc/tutorials/PCB_Rivets/#:~:text=For%20the%201.0mm%20rivets%2C%20the%20best%20hole,securing%20(flanging)%20a%20rivet%20to%20the%20board:

# Cad for CAM

- pos/neg spatial reasoning
- lofting

# Setting up cam

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
