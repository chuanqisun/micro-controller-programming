import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { Subject } from "rxjs";

export interface AudioChunkEvent {
  /** Raw audio buffer chunk */
  buffer: Buffer;
}

export interface SpeakerOptions {
  /** Voice ID to use for TTS */
  voiceId?: string;
  /** Model ID to use (default: eleven_turbo_v2_5) */
  modelId?: string;
  /** Output format (default: pcm_16000) */
  outputFormat?: "pcm_16000" | "pcm_22050" | "pcm_24000" | "pcm_44100" | "mp3_44100_128";
}

/**
 * Simple TTS speaker.
 *
 * API:
 * - submit(text): Start TTS for the given text
 * - audio$: Stream of audio buffer chunks
 * - abort(): Cancel the current TTS operation
 */
export class Speaker {
  private static client: ElevenLabsClient | null = null;

  private options: SpeakerOptions;
  private abortController: AbortController | null = null;

  public readonly audio$ = new Subject<AudioChunkEvent>();
  public readonly error$ = new Subject<Error>();

  constructor(options: SpeakerOptions = {}) {
    this.options = options;
  }

  private static ensureClient(): ElevenLabsClient {
    if (!Speaker.client) {
      Speaker.client = new ElevenLabsClient({
        apiKey: process.env.ELEVENLABS_API_KEY,
      });
    }
    return Speaker.client;
  }

  /**
   * Submit text to be converted to speech.
   * Audio chunks will be emitted via the audio$ observable.
   * After all audio is emitted, the observable completes.
   */
  async submit(text: string): Promise<void> {
    const client = Speaker.ensureClient();
    this.abortController = new AbortController();

    try {
      const audioStream = await client.textToSpeech.stream(
        this.options.voiceId ?? "JBFqnCBsd6RMkjVDRZzb",
        {
          text,
          modelId: this.options.modelId ?? "eleven_turbo_v2_5",
          outputFormat: this.options.outputFormat ?? "pcm_16000",
        },
        {
          abortSignal: this.abortController.signal,
        }
      );

      const reader = audioStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          if (value) {
            this.audio$.next({
              buffer: Buffer.from(value),
            });
          }
        }
      } finally {
        reader.releaseLock();
      }

      this.audio$.complete();
      this.error$.complete();
    } catch (error) {
      if (this.abortController?.signal.aborted) {
        return;
      }

      this.error$.next(error instanceof Error ? error : new Error(String(error)));
      this.audio$.complete();
      this.error$.complete();
    }
  }

  /**
   * Abort the current TTS operation.
   */
  abort(): void {
    this.abortController?.abort();
    this.audio$.complete();
    this.error$.complete();
  }
}
