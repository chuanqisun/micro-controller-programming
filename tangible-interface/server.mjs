import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import dgram from "dgram";
import express from "express";
import fs from "fs";
import { mkdir } from "fs/promises";
import OpenAI from "openai";
import os from "os";

const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

const app = express();
const PORT = 8000;
const UDP_PORT = 8888;
const PACKET_SIZE = 1024; // bytes per UDP packet

// Audio parameters must match the microcontroller
const SAMPLE_RATE = 22050; // Hz
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

  await fs.promises.mkdir("output/", { recursive: true });
  const filePath = `output/image-${Date.now()}.jpeg`;
  fs.writeFileSync(filePath, jpegBuffer);

  console.log("File uploaded successfully");

  // Generate caption for the image
  console.log("🤖 Generating caption...");
  const caption = await generateImageCaption(jpegBuffer);
  console.log(`📝 Caption: ${caption}`);

  // Get client IP from request
  const clientIP = req.ip.replace(/^::ffff:/, ""); // Remove IPv6 prefix if present

  // Generate sound from caption and stream via UDP
  console.log("🔊 Generating sound from caption and streaming...");
  await streamCaptionAudioToClient(caption, clientIP);

  // Log client IP and response
  console.log(`Streaming PCM audio to client IP: ${clientIP}:${UDP_PORT}`);

  res.json({
    ok: true,
    message: "File uploaded successfully",
    filename: "image.jpeg",
    caption: caption,
  });
});

// Convert 16-bit PCM stereo buffer to mono
function stereoToMono(buffer) {
  if (buffer.length % 4 !== 0) {
    console.warn("Stereo buffer length is not a multiple of 4 (2 channels x 2 bytes)");
  }
  const monoBuffer = Buffer.alloc(Math.floor(buffer.length / 2));
  for (let i = 0, j = 0; i + 3 < buffer.length; i += 4, j += 2) {
    // Read left and right samples
    const left = buffer.readInt16LE(i);
    const right = buffer.readInt16LE(i + 2);
    // Average and write as mono
    const mono = Math.floor((left + right) / 2);
    monoBuffer.writeInt16LE(mono, j);
  }
  return monoBuffer;
}

// Generate sound from caption and stream PCM audio via UDP
async function streamCaptionAudioToClient(caption, targetIP) {
  console.log("🔊 Requesting ElevenLabs sound for caption:", caption);

  try {
    const audio = await elevenlabs.textToSoundEffects.convert({
      outputFormat: "pcm_22050", // Match microcontroller sample rate
      text: caption,
    });

    const [playbackStream, saveStream] = audio.tee();

    // Save audio to file
    saveAudioToFile(saveStream, `output/sound-${Date.now()}.wav`);

    // Read playback stream
    let audioBuffer = Buffer.alloc(0);
    const reader = playbackStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      audioBuffer = Buffer.concat([audioBuffer, Buffer.from(value)]);
    }
    console.log(`✅ Audio loaded: ${audioBuffer.length} bytes`);
    // If stereo, convert to mono
    if (audioBuffer.length % 4 === 0) {
      console.log("Converting stereo to mono...");
      audioBuffer = stereoToMono(audioBuffer);
      console.log(`✅ Converted to mono: ${audioBuffer.length} bytes`);
    }
  } catch (error) {
    console.error("❌ Error loading/generating audio:", error.message);
    return;
  }

  // Stream audio over UDP
  let packetIndex = 0;
  let buffer = Buffer.from(audioBuffer);
  try {
    while (buffer.length >= PACKET_SIZE) {
      const packet = buffer.subarray(0, PACKET_SIZE);
      buffer = buffer.subarray(PACKET_SIZE);
      await new Promise((resolve) => {
        udpClient.send(packet, UDP_PORT, targetIP, (err) => {
          if (err) {
            console.error(`❌ Error sending packet ${packetIndex}:`, err.message);
          }
          resolve();
        });
      });
      await new Promise((resolve) => setTimeout(resolve, MS_PER_PACKET));
      packetIndex++;
      if (packetIndex % 100 === 0) {
        const seconds = (packetIndex * MS_PER_PACKET) / 1000;
        console.log(`📦 Sent ${packetIndex} packets (${seconds.toFixed(1)}s of audio)`);
      }
    }
    // Send any remaining data
    if (buffer.length > 0) {
      await new Promise((resolve) => {
        udpClient.send(buffer, UDP_PORT, targetIP, (err) => {
          if (err) {
            console.error(`❌ Error sending final packet:`, err.message);
          }
          resolve();
        });
      });
      packetIndex++;
    }
    console.log(`✅ PCM streaming completed (${packetIndex} packets total)`);
  } catch (error) {
    console.error("❌ Error streaming audio:", error.message);
  }
}

// Create WAV buffer from PCM data
function createWavBuffer(pcmBuffer, sampleRate, channels, bitsPerSample) {
  const dataSize = pcmBuffer.length;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4); // file size - 8
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // audio format PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28); // byte rate
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32); // block align
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmBuffer]);
}

// Save audio from stream to WAV file
async function saveAudioToFile(saveStream, filename = `sound-${Date.now()}.wav`) {
  await mkdir("output", { recursive: true });
  const saveReader = saveStream.getReader();
  let saveBuffer = Buffer.alloc(0);
  try {
    while (true) {
      const { done, value } = await saveReader.read();
      if (done) break;
      saveBuffer = Buffer.concat([saveBuffer, Buffer.from(value)]);
    }
    console.log(`✅ Save buffer loaded: ${saveBuffer.length} bytes\n`);

    // Convert save buffer to mono if stereo
    if (saveBuffer.length % 4 === 0) {
      saveBuffer = stereoToMono(saveBuffer);
    }

    // Create WAV buffer and save to file
    const wavBuffer = createWavBuffer(saveBuffer, SAMPLE_RATE, 1, BITS_PER_SAMPLE);
    fs.writeFileSync(filename, wavBuffer);
    console.log(`✅ Saved ${filename}\n`);
  } catch (error) {
    console.error("❌ Error loading save buffer:", error.message);
  }
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
