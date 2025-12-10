import * as fs from "fs";
import * as path from "path";
import { BITS_PER_SAMPLE, CHANNELS, SAMPLE_RATE } from "../config";
import { isGeminiSessionReady, streamAudioToGemini } from "./gemini-live";

const AUDIO_DIR = "audio";

export class DebugAudioBuffer {
  private chunks: Buffer[] = [];
  private sampleRate: number;
  private channels: number;
  private bitsPerSample: number;

  constructor(sampleRate: number = SAMPLE_RATE, channels: number = CHANNELS, bitsPerSample: number = BITS_PER_SAMPLE) {
    this.sampleRate = sampleRate;
    this.channels = channels;
    this.bitsPerSample = bitsPerSample;
  }

  push(data: Buffer): void {
    this.chunks.push(Buffer.from(data));

    // Stream audio to Gemini if connected
    if (isGeminiSessionReady()) {
      streamAudioToGemini(data);
    }
  }

  clear(): void {
    this.chunks = [];
  }

  get length(): number {
    return this.chunks.length;
  }

  saveAsWav(filename?: string): string | null {
    if (this.chunks.length === 0) return null;

    // Ensure audio directory exists
    if (!fs.existsSync(AUDIO_DIR)) {
      fs.mkdirSync(AUDIO_DIR, { recursive: true });
    }

    const pcmData = Buffer.concat(this.chunks);
    const wavBuffer = this.createWavBuffer(pcmData);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    const outputFilename = path.join(AUDIO_DIR, filename ?? `debug-audio-${timestamp}.wav`);

    fs.writeFileSync(outputFilename, wavBuffer);
    console.log(`📁 Saved debug audio: ${outputFilename} (${pcmData.length} bytes PCM)`);

    this.clear();
    return outputFilename;
  }

  private createWavBuffer(pcmData: Buffer): Buffer {
    const byteRate = this.sampleRate * this.channels * (this.bitsPerSample / 8);
    const blockAlign = this.channels * (this.bitsPerSample / 8);
    const dataSize = pcmData.length;
    const headerSize = 44;

    const header = Buffer.alloc(headerSize);

    // RIFF header
    header.write("RIFF", 0);
    header.writeUInt32LE(dataSize + headerSize - 8, 4);
    header.write("WAVE", 8);

    // fmt chunk
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); // fmt chunk size
    header.writeUInt16LE(1, 20); // audio format (PCM)
    header.writeUInt16LE(this.channels, 22);
    header.writeUInt32LE(this.sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(this.bitsPerSample, 34);

    // data chunk
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }
}
