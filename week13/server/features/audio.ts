import { spawn } from "child_process";

export interface AudioPlayerConfig {
  format: string;
  sampleRate: number;
  channels: number;
}

export class PlayableBuffer {
  private chunks: Buffer[] = [];
  private config: AudioPlayerConfig;

  constructor(config: AudioPlayerConfig = { format: "u16le", sampleRate: 24000, channels: 1 }) {
    this.config = config;
  }

  push(data: Buffer): void {
    this.chunks.push(data);
  }

  clear(): void {
    this.chunks = [];
  }

  isEmpty(): boolean {
    return this.chunks.length === 0;
  }

  getCombinedBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }

  async playAndClear(): Promise<void> {
    if (this.isEmpty()) {
      console.log("⚠️ No audio to play");
      return;
    }

    const combinedBuffer = this.getCombinedBuffer();
    console.log(`🔊 Playing ${combinedBuffer.length} bytes of audio...`);

    await this.playWithFfmpeg(combinedBuffer);
    this.clear();
  }

  private playWithFfmpeg(buffer: Buffer): Promise<void> {
    return new Promise((resolve) => {
      // Use ffmpeg to play raw PCM audio
      const ffmpeg = spawn(
        "ffmpeg",
        [
          "-f",
          this.config.format, // signed 16-bit little-endian
          "-ar",
          this.config.sampleRate.toString(), // sample rate
          "-ac",
          this.config.channels.toString(), // channels (mono)
          "-i",
          "pipe:0", // input from stdin
          "-f",
          "alsa", // Use ALSA for Linux audio output
          "default", // Default audio output device
        ],
        {
          stdio: ["pipe", "ignore", "pipe"],
        },
      );

      ffmpeg.stderr.on("data", (data: Buffer) => {
        const message = data.toString();
        if (message.includes("error") || message.includes("Error")) {
          console.error("FFmpeg error:", message);
        }
      });

      ffmpeg.stdin.write(buffer);
      ffmpeg.stdin.end();

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          console.log("✓ Audio playback complete");
        } else {
          console.error(`❌ ffmpeg exited with code ${code}`);
        }
        resolve();
      });

      ffmpeg.on("error", (error) => {
        console.error("❌ ffmpeg error:", error.message);
        resolve();
      });
    });
  }
}
