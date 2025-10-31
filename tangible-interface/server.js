const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const dgram = require("dgram");
const OpenAI = require("openai");
const { spawn } = require("child_process");

const app = express();
const PORT = 8000;
const UDP_PORT = 8888;
const PACKET_SIZE = 1024; // bytes per UDP packet

// Audio parameters must match the microcontroller
const SAMPLE_RATE = 16000; // Hz
const BITS_PER_SAMPLE = 16; // bits
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8; // 2 bytes
const SAMPLES_PER_PACKET = PACKET_SIZE / BYTES_PER_SAMPLE; // 512 samples
const MS_PER_PACKET = (SAMPLES_PER_PACKET / SAMPLE_RATE) * 1000; // 32ms

const udpClient = dgram.createSocket("udp4");

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Generate caption for image using OpenAI
async function generateImageCaption(imageBuffer) {
  try {
    // Convert image buffer to base64 data URL
    const base64Image = imageBuffer.toString("base64");
    const imageUrl = `data:image/jpeg;base64,${base64Image}`;

    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Describe this image in a short caption." },
            { type: "input_image", image_url: imageUrl, detail: "auto" },
          ],
        },
      ],
      reasoning: { effort: "minimal" },
      text: { verbosity: "low" },
    });

    // Extract the caption text from the response
    const outputMessage = response.output.find((item) => item.type === "message");
    if (outputMessage && outputMessage.content && outputMessage.content.length > 0) {
      const textContent = outputMessage.content.find((c) => c.type === "output_text");
      return textContent?.text || "No caption generated";
    }

    return "No caption generated";
  } catch (error) {
    console.error("❌ Error generating caption:", error.message);
    return "Error generating caption";
  }
}

// Handle POST request to /upload
app.post("/upload", express.raw({ type: "*/*", limit: "10mb" }), async (req, res) => {
  const boundary = req.headers["content-type"]?.match(/boundary=(.+)$/)?.[1];

  if (!boundary) {
    return res.status(400).json({ error: "No boundary in multipart data" });
  }

  // Extract JPEG data from multipart body
  const body = req.body.toString("binary");
  const parts = body.split("--" + boundary);

  let jpegBuffer = null;
  for (const part of parts) {
    if (part.includes("Content-Type: image/jpeg")) {
      const startMarker = "\r\n\r\n";
      const start = part.indexOf(startMarker) + startMarker.length;
      const end = part.lastIndexOf("\r\n");
      if (start > startMarker.length && end > start) {
        jpegBuffer = Buffer.from(part.substring(start, end), "binary");
        break;
      }
    }
  }

  if (!jpegBuffer) {
    return res.status(400).json({ error: "No image data found" });
  }

  const filePath = path.join(__dirname, "..", "image.jpeg");
  fs.writeFileSync(filePath, jpegBuffer);

  console.log("File uploaded successfully: image.jpeg");

  // Generate caption for the image
  console.log("🤖 Generating caption...");
  const caption = await generateImageCaption(jpegBuffer);
  console.log(`📝 Caption: ${caption}`);

  // Get client IP from request
  const clientIP = req.ip.replace(/^::ffff:/, ""); // Remove IPv6 prefix if present

  // Stream MP3 file via UDP
  streamMP3ToClient(clientIP);

  // Log client IP and response
  console.log(`Streaming MP3 to client IP: ${clientIP}:${UDP_PORT}`);

  res.json({
    ok: true,
    message: "File uploaded successfully",
    filename: "image.jpeg",
    caption: caption,
  });
});

// Convert MP3 to PCM and stream to client via UDP
function streamMP3ToClient(targetIP) {
  const mp3Path = path.join(__dirname, "example.mp3");

  if (!fs.existsSync(mp3Path)) {
    console.error("❌ example.mp3 not found!");
    return;
  }

  console.log("\n==============================================");
  console.log("Starting PCM UDP Stream (from MP3)");
  console.log("==============================================");
  console.log(`Target: ${targetIP}:${UDP_PORT}`);
  console.log(`Source: ${mp3Path}`);
  console.log(`Packet size: ${PACKET_SIZE} bytes`);
  console.log(`Sample rate: ${SAMPLE_RATE} Hz`);
  console.log(`Samples per packet: ${SAMPLES_PER_PACKET}`);
  console.log(`Delay per packet: ${MS_PER_PACKET.toFixed(2)} ms`);
  console.log("Converting MP3 to raw PCM...");
  console.log("==============================================\n");

  // Use ffmpeg to convert MP3 to raw PCM
  // Output format: 16-bit signed little-endian PCM, mono, 16kHz
  const ffmpeg = spawn("ffmpeg", [
    "-i",
    mp3Path, // Input file
    "-f",
    "s16le", // Output format: signed 16-bit little-endian
    "-ar",
    "16000", // Sample rate: 16kHz
    "-ac",
    "1", // Channels: mono
    "-", // Output to stdout
  ]);

  let packetIndex = 0;
  let buffer = Buffer.alloc(0);

  ffmpeg.stdout.on("data", (chunk) => {
    // Accumulate data
    buffer = Buffer.concat([buffer, chunk]);

    // Send packets when we have enough data
    while (buffer.length >= PACKET_SIZE) {
      const packet = buffer.subarray(0, PACKET_SIZE);
      buffer = buffer.subarray(PACKET_SIZE);

      // Schedule the packet send with proper timing to match playback speed
      setTimeout(() => {
        udpClient.send(packet, UDP_PORT, targetIP, (err) => {
          if (err) {
            console.error(`❌ Error sending packet ${packetIndex}:`, err.message);
          }
        });
      }, packetIndex * MS_PER_PACKET);

      packetIndex++;

      // Log progress every 100 packets
      if (packetIndex % 100 === 0) {
        const seconds = (packetIndex * MS_PER_PACKET) / 1000;
        console.log(`📦 Sent ${packetIndex} packets (${seconds.toFixed(1)}s of audio)`);
      }
    }
  });

  ffmpeg.stdout.on("end", () => {
    // Send any remaining data
    if (buffer.length > 0) {
      setTimeout(() => {
        udpClient.send(buffer, UDP_PORT, targetIP, (err) => {
          if (err) {
            console.error(`❌ Error sending final packet:`, err.message);
          }
        });
      }, packetIndex * MS_PER_PACKET);
      packetIndex++;
    }
    console.log(`✅ PCM streaming completed (${packetIndex} packets total)`);
  });

  ffmpeg.stderr.on("data", (data) => {
    // ffmpeg outputs its logs to stderr, suppress them unless there's an error
  });

  ffmpeg.on("error", (error) => {
    console.error("❌ ffmpeg error:", error.message);
  });

  ffmpeg.on("close", (code) => {
    if (code !== 0) {
      console.error(`❌ ffmpeg exited with code ${code}`);
    }
  });
}

// Get local IP address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  udpClient.close(() => {
    console.log("\n👋 Server shutting down...");
    process.exit(0);
  });
});

// Start server
app.listen(PORT, () => {
  const ipAddress = getLocalIpAddress();
  console.log("\n==============================================");
  console.log("Image Upload Server with UDP Audio Streaming");
  console.log("==============================================");
  console.log(`HTTP Server: http://${ipAddress}:${PORT}`);
  console.log(`Upload endpoint: http://${ipAddress}:${PORT}/upload`);
  console.log(`UDP Port: ${UDP_PORT}`);
  console.log(`Packet size: ${PACKET_SIZE} bytes`);
  console.log("==============================================\n");
});
