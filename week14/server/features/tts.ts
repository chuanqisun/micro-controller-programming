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

export async function GenerateOpenAISpeech(text: string, signal?: AbortSignal) {
  const wave = await openai.audio.speech.create(
    {
      model: "gpt-4o-mini-tts",
      voice: "onyx",
      input: text,
      instructions: "Deep coarse male Dungeon master voice with immersive fantasy role-play style",
      response_format: "wav",
    },
    {
      signal,
    },
  );

  const buffer = Buffer.from(await wave.arrayBuffer());
  return buffer;
}
