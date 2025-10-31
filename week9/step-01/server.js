const dgram = require("dgram");

const SAMPLE_RATE = 22000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const UDP_PORT = 8888;
const TARGET_IP = "192.168.41.239"; // ESP32 IP address
const PACKET_SIZE = 1024; // bytes per UDP packet
const FREQUENCY = 440; // Hz (A4 note)

const client = dgram.createSocket("udp4");

startServer();

function startServer() {
  logServerStartup();
  startSineWaveStream();

  process.on("SIGINT", handleGracefulShutdown);
}

function handleGracefulShutdown() {
  client.close(() => {
    process.exit(0);
  });
}

function startSineWaveStream() {
  let phase = 0;
  const samplesPerPacket = PACKET_SIZE / 2; // 2 bytes per sample (16-bit)
  const phaseIncrement = (2 * Math.PI * FREQUENCY) / SAMPLE_RATE;

  setInterval(
    () => {
      const result = generateSineWaveBuffer(phase, samplesPerPacket, phaseIncrement);
      phase = result.phase;
      sendAudioPacket(result.buffer);
    },
    (samplesPerPacket / SAMPLE_RATE) * 1000
  );
}

function sendAudioPacket(buffer) {
  client.send(buffer, UDP_PORT, TARGET_IP, (err) => {
    if (err) {
      console.error("❌ Error sending packet:", err.message);
    }
  });
}

function logServerStartup() {
  const networkAddresses = getNetworkAddresses();

  console.log("\n==============================================");
  console.log("ESP32 Audio UDP Emitter (Sine Wave)");
  console.log("==============================================");
  console.log(`Target: ${TARGET_IP}:${UDP_PORT}`);
  console.log(`Sample Rate: ${SAMPLE_RATE} Hz`);
  console.log(`Channels: ${CHANNELS} (mono)`);
  console.log(`Bits per sample: ${BITS_PER_SAMPLE}`);
  console.log(`Frequency: ${FREQUENCY} Hz`);
  console.log(`Packet size: ${PACKET_SIZE} bytes`);
  console.log("\nLocal addresses:");
  networkAddresses.forEach((addr) => {
    console.log(`  ${addr}`);
  });
  console.log("==============================================\n");
}

function getNetworkAddresses() {
  const interfaces = require("os").networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  return addresses;
}

function generateSineWaveBuffer(phase, samplesPerPacket, phaseIncrement) {
  const buffer = Buffer.alloc(PACKET_SIZE);

  for (let i = 0; i < samplesPerPacket; i++) {
    const sample = Math.sin(phase) * 0.3; // 30% amplitude to avoid clipping
    const pcm16Value = Math.round(sample * 32767);
    buffer.writeInt16LE(pcm16Value, i * 2);
    phase += phaseIncrement;
    if (phase >= 2 * Math.PI) {
      phase -= 2 * Math.PI;
    }
  }

  return { buffer, phase };
}
