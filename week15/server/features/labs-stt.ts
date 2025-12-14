import { AudioFormat, CommitStrategy, RealtimeEvents, Scribe } from "@elevenlabs/client";
import { Subject } from "rxjs";

export interface TranscriptEvent {
  type: "partial" | "committed";
  text: string;
  words?: unknown[];
}

export interface ScribeTranscriberOptions {
  sampleRate?: number;
  includeTimestamps?: boolean;
}

type ScribeConnection = ReturnType<typeof Scribe.connect>;

/**
 * Simple single-use transcriber with its own connection.
 * Create a new instance for each transcription session.
 */
export class ScribeTranscriber {
  private connection: ScribeConnection | null = null;
  private isSessionStarted = false;
  private pendingBuffers: Buffer[] = [];
  private options: ScribeTranscriberOptions;

  public readonly transcript$ = new Subject<TranscriptEvent>();
  public readonly error$ = new Subject<Error>();

  constructor(options: ScribeTranscriberOptions = {}) {
    this.options = options;
  }

  get isConnected(): boolean {
    return this.connection !== null && this.isSessionStarted;
  }

  /**
   * Fetch a single-use token from ElevenLabs API.
   */
  private async fetchToken(): Promise<string> {
    const response = await fetch("https://api.elevenlabs.io/v1/single-use-token/realtime_scribe", {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch token: ${response.statusText}`);
    }

    const data = await response.json();
    return (data as { token: string }).token;
  }

  /**
   * Start the transcription session.
   */
  async start(): Promise<void> {
    if (this.connection) {
      throw new Error("Already started.");
    }

    const token = await this.fetchToken();

    this.connection = Scribe.connect({
      token,
      modelId: "scribe_v2_realtime",
      audioFormat: AudioFormat.PCM_16000,
      sampleRate: this.options.sampleRate ?? 16000,
      commitStrategy: CommitStrategy.MANUAL,
      includeTimestamps: this.options.includeTimestamps ?? false,
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    const conn = this.connection;
    if (!conn) return;

    conn.on(RealtimeEvents.SESSION_STARTED, () => {
      this.isSessionStarted = true;
      this.flushPendingBuffers();
    });

    conn.on(RealtimeEvents.PARTIAL_TRANSCRIPT, (data) => {
      this.transcript$.next({ type: "partial", text: data.text });
    });

    conn.on(RealtimeEvents.COMMITTED_TRANSCRIPT, (data) => {
      this.transcript$.next({ type: "committed", text: data.text });
    });

    conn.on(RealtimeEvents.COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS, (data) => {
      this.transcript$.next({ type: "committed", text: data.text, words: data.words });
    });

    conn.on(RealtimeEvents.ERROR, (error) => {
      this.error$.next(new Error(String(error)));
    });
  }

  private flushPendingBuffers(): void {
    for (const buffer of this.pendingBuffers) {
      this.sendBuffer(buffer);
    }
    this.pendingBuffers = [];
  }

  private sendBuffer(buffer: Buffer): void {
    if (!this.connection) return;
    this.connection.send({
      audioBase64: buffer.toString("base64"),
      sampleRate: this.options.sampleRate ?? 16000,
    });
  }

  appendBuffer(buffer: Buffer): void {
    if (!this.connection) {
      throw new Error("Not started. Call start() first.");
    }

    if (this.isSessionStarted) {
      this.sendBuffer(buffer);
    } else {
      this.pendingBuffers.push(buffer);
    }
  }

  commit(): void {
    if (!this.connection) {
      throw new Error("Not started. Call start() first.");
    }
    this.connection.commit();
  }

  clear(): void {
    this.pendingBuffers = [];
  }

  close(): void {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
    this.pendingBuffers = [];
  }
}
