interface AzureSttConfig {
  speechKey: string;
  speechRegion: string;
  locale?: string;
  profanityFilterMode?: "None" | "Masked" | "Removed" | "Tags";
}

interface AzureTranscriptionResult {
  combinedPhrases: Array<{
    channel: number;
    text: string;
  }>;
  duration: number;
}

export class AzureSpeechToText {
  private readonly config: Required<AzureSttConfig>;
  private currentAbortController: AbortController | null = null;
  private audioBuffers: Buffer[] = [];
  private requestController: ReadableStreamDefaultController<Uint8Array> | null = null;
  private requestPromise: Promise<Response> | null = null;
  private requestStarted: boolean = false;
  private streamClosed: boolean = false;
  private boundary: string = "";
  private paused: boolean = false;

  static create() {
    return new AzureSpeechToText({
      speechKey: process.env.AZURE_SPEECH_KEY!,
      speechRegion: process.env.AZURE_SPEECH_REGION!,
    });
  }

  constructor(config: AzureSttConfig) {
    this.config = {
      locale: "en-US",
      profanityFilterMode: "None",
      ...config,
    };
  }

  append(buffer: Buffer): void {
    if (this.streamClosed || this.paused) return;

    this.audioBuffers.push(buffer);

    if (!this.requestStarted) {
      this.startStreamingRequest();
    } else if (this.requestController) {
      // Stream the new buffer to the ongoing request
      this.requestController.enqueue(new Uint8Array(buffer));
    }
  }

  pause() {
    this.audioBuffers = [];
    this.paused = true;
    return this;
  }

  resume() {
    this.paused = false;
    return this;
  }

  async commit(): Promise<string> {
    if (this.audioBuffers.length === 0) {
      throw new Error("No audio buffers to transcribe. Call appendAudioBuffer() first.");
    }

    if (!this.requestStarted || !this.requestController || !this.requestPromise) {
      throw new Error("Request not started. This should not happen.");
    }

    try {
      // Close the audio stream
      this.requestController.enqueue(new TextEncoder().encode(`\r\n--${this.boundary}--\r\n`));
      this.streamClosed = true;
      this.requestController.close();

      // Wait for the response
      const response = await this.requestPromise;
      const result = await response.json();

      if (!response.ok) {
        throw new Error(`Azure STT API error: ${JSON.stringify(result)}`);
      }

      console.log("Azure STT transcription result:", result);
      return this.extractFinalTranscriptionText(result as AzureTranscriptionResult);
    } finally {
      this.resetState();
    }
  }

  private startStreamingRequest(): void {
    this.currentAbortController = new AbortController();
    this.requestStarted = true;

    this.boundary = this.generateMultipartBoundary();
    const requestDefinition = this.createRequestDefinition();
    const headerParts = this.buildMultipartHeaders(this.boundary, requestDefinition);

    const multipartBody = new ReadableStream<Uint8Array>({
      start: (controller) => {
        this.requestController = controller;

        // Send headers first
        for (const headerPart of headerParts) {
          controller.enqueue(new TextEncoder().encode(headerPart));
        }

        // Send WAV header (44 bytes) - we'll use a large size placeholder
        const wavHeader = this.createWavHeader(0x7fffffff); // Max size placeholder
        controller.enqueue(wavHeader);

        // Send any existing buffers
        for (const buffer of this.audioBuffers) {
          controller.enqueue(new Uint8Array(buffer));
        }
      },
    });

    // Start the request
    this.requestPromise = this.sendStreamingRequest(multipartBody, this.boundary);
  }

  private async sendStreamingRequest(body: ReadableStream<Uint8Array>, boundary: string): Promise<Response> {
    const apiEndpoint = `https://${this.config.speechRegion}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2025-10-15`;

    return fetch(apiEndpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "ocp-apim-subscription-key": this.config.speechKey,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      duplex: "half",
      body,
      signal: this.currentAbortController?.signal,
    });
  }

  private resetState(): void {
    this.currentAbortController?.abort();
    this.currentAbortController = null;
    this.requestController = null;
    this.requestPromise = null;
    this.requestStarted = false;
    this.streamClosed = false;
    this.boundary = "";
  }

  private extractFinalTranscriptionText(result: AzureTranscriptionResult): string {
    return result.combinedPhrases[0]?.text ?? "";
  }

  private generateMultipartBoundary(): string {
    return "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
  }

  private createRequestDefinition(): string {
    return JSON.stringify({
      locales: [this.config.locale],
      profanityFilterMode: this.config.profanityFilterMode,
    });
  }

  private buildMultipartHeaders(boundary: string, definition: string): string[] {
    return [
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="definition"\r\n',
      "Content-Type: application/json\r\n\r\n",
      definition + "\r\n",
      `--${boundary}\r\n`,
      'Content-Disposition: form-data; name="audio"; filename="audio.wav"\r\n',
      "Content-Type: audio/wav\r\n\r\n",
    ];
  }

  private createWavHeader(dataSize: number): Uint8Array {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);

    const sampleRate = 16000;
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);

    // RIFF chunk
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dataSize, true); // file size - 8
    view.setUint32(8, 0x57415645, false); // "WAVE"

    // fmt sub-chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // sub-chunk size
    view.setUint16(20, 1, true); // audio format (PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true);

    return new Uint8Array(header);
  }
}

export const transcriber = AzureSpeechToText.create();
