1. Found via to be the issue. Logic analyzer helped
2. Patch soldered the via. Applied hot glue to reinforce the headers
3. Edit the PCB to replace via with regular through hole for using header pin as via
   Reduced the 2mm via hole to 1mm hole

4. Improved the enclosure design based on learning from previous iterations:
   - Added snap-fit tabs to all the lids
   - Added more brim support to prevent switchboard lid from sinking
   - Reduced bottom layer warping by tweaking PLA settings
     - Previous: 230C nozzle, 60C bed
     - New: 205C nozzle, 65C bed
   - The theory is that high temperature differential causes high shrinking, which causes warping.
   - Lower nozzle temperature and increase bed temperature seems to have reduced warping but more adjust is still needed.
5. "Solidified" the PCB headers with hot glue. I've accidently bent sever 2.54mm headers during mounting and unmounting of components. I have a fear that the headers will break off. Applying hot glue gave me the confident the the project can survive multiple assembly/disassembly.
6. Improving soldering skills: towards the semester, my soldering start to look better
   - Shinnier
   - Better cone shape (Hershey's kiss)
   - Still need to work on:
     - Ground joint still has cold joints symptoms: floating balls of solder.
     - Can't get heat to concentrate due to too many run-out paths on the copper.
