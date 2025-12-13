import { GoogleGenAI } from "@google/genai";
import { OpenAI } from "openai";

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
  return audioBuffer;
}

export async function GenerateOpenAISpeech(text: string, options?: { signal?: AbortSignal; voice?: string; instructions?: string }) {
  const wave = await openai.audio.speech.create(
    {
      model: "gpt-4o-mini-tts",
      voice: options?.voice ?? "onyx",
      input: text,
      instructions: options?.instructions ?? "Robotic monotone voice.",
      response_format: "wav",
    },
    {
      signal: options?.signal,
    }
  );

  const buffer = Buffer.from(await wave.arrayBuffer());
  return buffer;
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
