# Tangible Adventure

This is the software/firmware stack for the Tangible Adventure project.

See [project website](https://fab.cba.mit.edu/classes/863.25/people/SunChuanqi/posts/final-project/) for full documentation.

## Prerequisites

### Services

- OpenAI API key
- Google AI Studio API key
- Microsoft Azure Speech API key and region

### Software

- Node.js (v24)
- Arduino IDE or Arduino CLI

### One-time setup

- Install Node.js dependencies:

```bash
# Run in the project root
npm install
```

- Setup environment variables
  - Copy `.env.example` to `.env` and fill in the API keys
  - Copy `operator/env.h.example` to `operator/env.h` and fill in the WiFi credentials
- Install Arduino IDE board and libraries
  - Install ESP32 board and libraries `v3.3.3` or above following the [official website](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html).
  - Install Arduino Audio Tools library `v1.2.0` or above following the [GitHub documentation](https://github.com/pschatzmann/arduino-audio-tools?tab=readme-ov-file#installation-in-arduino).

## Development

```bash
# Compile, upload, and monitor operator
npm run dev:op

# Compile, upload, and monitor switchboard
npm run dev:sw

# Run full stack (web + server) with auto-reload on change
npm run dev
```
