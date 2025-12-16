import { type ChildProcessWithoutNullStreams, spawn } from "child_process";

export interface AudioPlayerConfig {
  format: string;
  sampleRate: number;
  channels: number;
}

export class StreamingAudioPlayer {
  private ffmpegPlayer: ChildProcessWithoutNullStreams | null = null;
  private config: AudioPlayerConfig;
  private isStopping = false;

  constructor(config: AudioPlayerConfig = { format: "s16le", sampleRate: 24000, channels: 1 }) {
    this.config = config;
  }

  private startAudioPlayer(): void {
    console.log("🔊 Starting audio player...");

    // Use ffmpeg to play raw PCM audio
    this.ffmpegPlayer = spawn("ffmpeg", [
      "-f",
      this.config.format,
      "-ar",
      this.config.sampleRate.toString(),
      "-ac",
      this.config.channels.toString(),
      "-i",
      "pipe:0",
      "-f",
      "alsa",
      "default",
    ]);

    this.ffmpegPlayer.stderr.on("data", (data: Buffer) => {
      const message = data.toString();
      if (message.includes("error") || message.includes("Error")) {
        console.error("FFmpeg error:", message);
      }
    });

    this.ffmpegPlayer.on("error", (err) => {
      console.error("❌ FFmpeg process error:", err);
    });

    this.ffmpegPlayer.on("close", (code) => {
      console.log(`FFmpeg process exited with code ${code}`);
      this.ffmpegPlayer = null;
      this.isStopping = false;
    });

    // Handle stdin errors (e.g., write after end)
    this.ffmpegPlayer.stdin.on("error", (err) => {
      if (this.isStopping) {
        // Ignore errors during shutdown
        return;
      }
      console.error("❌ FFmpeg stdin error:", err);
    });

    console.log("✓ Audio player started");
  }

  push(data: Buffer): void {
    if (this.isStopping) {
      return;
    }

    if (!this.ffmpegPlayer) {
      this.startAudioPlayer();
    }

    if (this.ffmpegPlayer && !this.ffmpegPlayer.killed) {
      this.ffmpegPlayer.stdin.write(data);
    }
  }

  stop(): void {
    if (this.ffmpegPlayer && !this.ffmpegPlayer.killed) {
      this.isStopping = true;
      this.ffmpegPlayer.stdin.end();
      this.ffmpegPlayer.kill("SIGTERM");
      this.ffmpegPlayer = null;
      console.log("✓ Audio player stopped");
    }
  }

  isPlaying(): boolean {
    return this.ffmpegPlayer !== null && !this.ffmpegPlayer.killed;
  }
}

export const audioPlayer = new StreamingAudioPlayer({ format: "s16le", sampleRate: 24000, channels: 1 });

/**
 * Downsample 16-bit PCM audio from one sample rate to another
 * Uses linear interpolation for better quality
 */
export function downsamplePcm16(input: Buffer, fromRate: number, toRate: number): Buffer {
  if (fromRate === toRate) return input;

  const ratio = fromRate / toRate;
  const inputSamples = input.length / 2; // 16-bit = 2 bytes per sample
  const outputSamples = Math.floor(inputSamples / ratio);
  const output = Buffer.alloc(outputSamples * 2);

  for (let i = 0; i < outputSamples; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, inputSamples - 1);
    const fraction = srcIndex - srcIndexFloor;

    // Read 16-bit signed samples
    const sample1 = input.readInt16LE(srcIndexFloor * 2);
    const sample2 = input.readInt16LE(srcIndexCeil * 2);

    // Linear interpolation
    const interpolated = Math.round(sample1 + (sample2 - sample1) * fraction);
    output.writeInt16LE(interpolated, i * 2);
  }

  return output;
}
