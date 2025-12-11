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
