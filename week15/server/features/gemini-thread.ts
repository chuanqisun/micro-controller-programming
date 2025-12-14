import { GoogleGenAI } from "@google/genai";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class Generation {
  private ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  private audioBuffers: Buffer[] = [];
  private texts: string[] = [];
  private ac = new AbortController();
  private committed = false;

  abort() {
    this.ac.abort();
  }

  appendAudio(buffer: Buffer) {
    if (this.committed) {
      console.warn("audio dataignored after commit");
      return;
    }
    this.audioBuffers.push(buffer);
    return this;
  }

  appendText(text: string) {
    if (this.committed) {
      console.warn("text data ignored after commit");
      return;
    }
    this.texts.push(text);
    return this;
  }

  async run(options?: { saveAudio?: boolean }) {
    const wavBuffer = this.getWavBuffer();

    if (options?.saveAudio && wavBuffer.length > 44) {
      await this.saveAudioFile(wavBuffer);
    }

    const audioData = wavBuffer.length > 44 ? wavBuffer.toString("base64") : null;

    const result = await this.ai.interactions.create(
      {
        model: "gemini-2.5-flash",
        input: [
          ...(audioData
            ? [
                {
                  type: "audio" as const,
                  data: audioData,
                  mime_type: "audio/wav",
                },
              ]
            : []),
          ...this.texts.map((text) => ({
            type: "text" as const,
            text,
          })),
        ],
      },
      { signal: this.ac.signal }
    );

    const textOutput = result.outputs?.find((output) => output.type === "text")?.text ?? null;
    return textOutput;
  }

  private getWavBuffer(): Buffer {
    const totalLength = this.audioBuffers.reduce((sum, buf) => sum + buf.length, 0);
    const pcmData = Buffer.concat(this.audioBuffers, totalLength);
    return this.createWavBuffer(pcmData);
  }

  private async saveAudioFile(wavBuffer: Buffer): Promise<void> {
    const audioDir = join(__dirname, "../../audio");
    await mkdir(audioDir, { recursive: true });
    const timestamp = Date.now();
    const filePath = join(audioDir, `${timestamp}.wav`);
    await writeFile(filePath, wavBuffer);
    console.log(`Saved audio to ${filePath}`);
  }

  private createWavBuffer(pcmData: Buffer): Buffer {
    const sampleRate = 16000;
    const bitsPerSample = 16;
    const numChannels = 1;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const dataSize = pcmData.length;
    const headerSize = 44;

    const header = Buffer.alloc(headerSize);

    // RIFF header
    header.write("RIFF", 0);
    header.writeUInt32LE(dataSize + headerSize - 8, 4);
    header.write("WAVE", 8);

    // fmt subchunk
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20); // AudioFormat (1 = PCM)
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data subchunk
    header.write("data", 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }
}
