import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";
import { Observable } from "rxjs";
import { downsamplePcm16 } from "./audio";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function generateGeminiSpeech(text: string, signal?: AbortSignal) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: "Kore" },
        },
      },
      abortSignal: signal,
    },
  });

  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) throw new Error("No audio data received from TTS model");
  console.log("Generated speech for text:", text);
  const audioBuffer = Buffer.from(data, "base64");
  // Downsample from 24kHz to 16kHz for device playback
  return downsamplePcm16(audioBuffer, 24000, 16000);
}

export async function generateOpenAISpeech(text: string, options?: { signal?: AbortSignal; voice?: string; instructions?: string }) {
  const wave = await openai.audio.speech.create(
    {
      model: "gpt-4o-mini-tts",
      voice: options?.voice ?? "onyx",
      input: text,
      instructions: options?.instructions ?? "Robotic monotone voice.",
      response_format: "pcm",
    },
    {
      signal: options?.signal,
    }
  );

  const buffer = Buffer.from(await wave.arrayBuffer());
  // Downsample from 24kHz to 16kHz for device playback
  return downsamplePcm16(buffer, 24000, 16000);
}

export function streamOpenAISpeech(text: string, options?: { voice?: string; instructions?: string }) {
  return new Observable<Buffer>((subscriber) => {
    const ac = new AbortController();

    openai.audio.speech
      .create(
        {
          model: "gpt-4o-mini-tts",
          voice: options?.voice ?? "onyx",
          stream_format: "audio",
          input: text,
          instructions: options?.instructions,
          response_format: "pcm",
        },
        {
          signal: ac.signal,
        }
      )
      .then(async (wave) => {
        try {
          const reader = (wave.body as ReadableStream).getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            subscriber.next(Buffer.from(value));
          }
          subscriber.complete();
        } catch (error) {
          subscriber.error(error);
        }
      })
      .catch((error) => {
        subscriber.error(error);
      });

    return () => {
      ac.abort();
    };
  });
}

const femaleVoices = ["alloy", "coral", "nova", "sage", "shimmer"];
const maleVoices = ["ash", "ballad", "echo", "fable", "onyx", "verse"];

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => 0.5 - Math.random());
}

export function* getRandomVoiceGenerator() {
  let females = shuffle(femaleVoices);
  let males = shuffle(maleVoices);
  let pickFemale = Math.random() < 0.5; // Random starting gender

  while (true) {
    // Refill if empty
    if (females.length === 0) females = shuffle(femaleVoices);
    if (males.length === 0) males = shuffle(maleVoices);

    if (pickFemale) {
      yield females.pop()!;
    } else {
      yield males.pop()!;
    }
    pickFemale = !pickFemale; // Alternate gender
  }
}
