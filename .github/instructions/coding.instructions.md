---
applyTo: "**"
---

# Naming conventions for Arduino sketches

1. Required main entry file at /{project-name}/{project-name}.ino file
2. Additional .ino files are loaded in alphabetical order after the entry file.
3. Use naming convention lib-XX-name.ino for library files, where XX is a two-digit number to control the loading order.

# Data sharing between files

- Sharing is implicit. The compiler simply concatenates all .ino files together in order.
- Do NOT use .h files.
- Do NOT use "extern" declarations.
