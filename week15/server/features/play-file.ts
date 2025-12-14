import { spawn } from "child_process";
import { existsSync, statSync } from "fs";
import path from "path";
import { CHANNELS, SAMPLE_RATE } from "../config";
import { audioPlayer } from "./audio";
import type { Handler } from "./http";
import { appState$ } from "./state";
import { sendPcm16UDP, startPcmStream, stopPcmStream } from "./udp";

const WAV_FILE = path.resolve(__dirname, "../sound/audio.wav");
const RAW_FILE = path.resolve(__dirname, "../sound/audio.raw");

// Chunk size for UDP packets (in bytes) - must be small enough for UDP
const UDP_CHUNK_SIZE = 1024;
// Interval between sending chunks (ms) - controls playback speed
const SEND_INTERVAL_MS = Math.floor((UDP_CHUNK_SIZE / (SAMPLE_RATE * CHANNELS * 2)) * 1000);

let isPlaying = false;
let currentPlayingOperatorIndex: number | null = null;

/**
 * Convert WAV to raw PCM using ffmpeg
 */
function convertWavToRaw(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!existsSync(WAV_FILE)) {
      reject(new Error(`WAV file not found at ${WAV_FILE}`));
      return;
    }

    console.log("Converting WAV to raw PCM...");

    const ffmpeg = spawn("ffmpeg", [
      "-y", // overwrite output file
      "-i",
      WAV_FILE,
      "-f",
      "s16le", // signed 16-bit little-endian
      "-acodec",
      "pcm_s16le", // PCM codec
      "-ar",
      SAMPLE_RATE.toString(), // sample rate
      "-ac",
      CHANNELS.toString(), // channels
      RAW_FILE,
    ]);

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        const stats = statSync(RAW_FILE);
        console.log(`✓ Converted to RAW format (${stats.size} bytes)`);
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Stream raw PCM file over UDP in chunks
 */
async function streamRawFileUDP(address: string): Promise<void> {
  const fs = await import("fs");

  if (!existsSync(RAW_FILE)) {
    throw new Error(`RAW file not found at ${RAW_FILE}`);
  }

  const fileBuffer = fs.readFileSync(RAW_FILE);
  const totalChunks = Math.ceil(fileBuffer.length / UDP_CHUNK_SIZE);

  console.log(`Streaming ${fileBuffer.length} bytes in ${totalChunks} chunks to ${address}`);

  return new Promise((resolve) => {
    let chunkIndex = 0;

    const sendNextChunk = () => {
      if (chunkIndex >= totalChunks || !isPlaying) {
        console.log("Playback finished");
        isPlaying = false;
        resolve();
        return;
      }

      const start = chunkIndex * UDP_CHUNK_SIZE;
      const end = Math.min(start + UDP_CHUNK_SIZE, fileBuffer.length);
      const chunk = fileBuffer.subarray(start, end);

      const mode = appState$.value.audioOutputMode;
      if (mode === "controller" || mode === "both") {
        sendPcm16UDP(chunk, address);
      }
      if (mode === "laptop" || mode === "both") {
        audioPlayer.push(chunk);
      }
      chunkIndex++;

      setTimeout(sendNextChunk, SEND_INTERVAL_MS);
    };

    sendNextChunk();
  });
}

/**
 * POST /api/play-file?op=<index>
 * Plays ./sound/audio.wav over UDP to the specified operator
 */
export function handlePlayFile(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/api/play-file")) return false;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const operatorIndex = parseInt(url.searchParams.get("op") ?? "0", 10);

    const operator = appState$.value.operators[operatorIndex];
    const opAddress = operator?.address;

    if (!opAddress) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: `Operator ${operatorIndex} address not set` }));
      return true;
    }

    if (isPlaying) {
      res.writeHead(409);
      res.end(JSON.stringify({ error: "Already playing", currentOperator: currentPlayingOperatorIndex }));
      return true;
    }

    try {
      // Convert WAV to RAW if needed (or reconvert to ensure it's up to date)
      await convertWavToRaw();

      isPlaying = true;
      currentPlayingOperatorIndex = operatorIndex;
      res.writeHead(200);
      res.end(JSON.stringify({ status: "playing", operator: operatorIndex }));

      startPcmStream(opAddress);
      // Stream audio in background (don't await)
      streamRawFileUDP(opAddress).catch((err) => {
        console.error("Error streaming audio:", err);
        isPlaying = false;
        currentPlayingOperatorIndex = null;
      });
    } catch (error) {
      isPlaying = false;
      currentPlayingOperatorIndex = null;
      res.writeHead(500);
      res.end(JSON.stringify({ error: (error as Error).message }));
    }

    return true;
  };
}

/**
 * POST /api/stop-playback?op=<index>
 * Stops the current file playback (optionally for a specific operator)
 */
export function handleStopPlayback(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith("/api/stop-playback")) return false;

    const url = new URL(req.url, `http://${req.headers.host}`);
    const requestedOperator = url.searchParams.get("op");

    // If a specific operator is requested, only stop if it matches
    if (requestedOperator !== null) {
      const operatorIndex = parseInt(requestedOperator, 10);
      if (currentPlayingOperatorIndex !== null && currentPlayingOperatorIndex !== operatorIndex) {
        res.writeHead(200);
        res.end(JSON.stringify({ status: "not-playing-on-this-operator", currentOperator: currentPlayingOperatorIndex }));
        return true;
      }
    }

    isPlaying = false;
    currentPlayingOperatorIndex = null;
    stopPcmStream();
    res.writeHead(200);
    res.end(JSON.stringify({ status: "stopped" }));

    return true;
  };
}
