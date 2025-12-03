import { GoogleGenAI } from "@google/genai";
import { JSONParser } from "@streamparser/json";
import { BehaviorSubject, Subject } from "rxjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Handler } from "./http";
import { cancelAllSpeakerPlayback, playPcm16Buffer } from "./speaker";
import { updateState } from "./state";

const storyOptionsSchema = z.object({
  storyOptions: z.array(z.string().describe("A story beginning for a text adventure game.")),
});
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const textGenerated$ = new Subject<number>();
export const assignments$ = new BehaviorSubject<
  { index: number; text: string | null; audioBuffer: Promise<Buffer> | null }[]
>([]);

let ongoingTasks = [] as AbortController[];

/**
 * /api/adventure/preview?index=NUMBER
 */
export function handlePreviewOption(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/adventure/preview") return false;
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const indexParam = url.searchParams.get("index");
    const index = indexParam ? parseInt(indexParam, 10) : NaN;

    if (isNaN(index)) {
      res.writeHead(400);
      res.end("Invalid index parameter");
      return true;
    }

    const assignment = assignments$.value.find((a) => a.index === index);
    if (!assignment || assignment.text === null || assignment.audioBuffer === null) {
      res.writeHead(404);
      res.end("Assignment not found");
      return true;
    }

    cancelAllSpeakerPlayback();
    const audioBuffer = await assignment.audioBuffer;
    try {
      playPcm16Buffer(audioBuffer);
    } catch (error) {
      console.error("Error playing audio buffer:", error);
    }
    return true;
  };
}

export async function previewOption(id: number) {
  const assignment = assignments$.value.find((a) => a.index === id);
  if (!assignment || assignment.text === null || assignment.audioBuffer === null) {
    console.error("Assignment not found or not ready");
    return;
  }

  cancelAllSpeakerPlayback();
  playPcm16Buffer(await assignment.audioBuffer);
}

export function handleCommitOption(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/adventure/commit") return false;
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const indexParam = url.searchParams.get("index");
    const index = indexParam ? parseInt(indexParam, 10) : NaN;

    if (isNaN(index)) {
      res.writeHead(400);
      res.end("Invalid index parameter");
      return true;
    }

    const assignment = assignments$.value.find((a) => a.index === index);
    if (!assignment || assignment.text === null) {
      res.writeHead(404);
      res.end("Assignment not found");
      return true;
    }

    return true;
  };
}

export function handleStartTextAdventures(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/adventure/start") return false;

    killAllTasks();
    cancelAllSpeakerPlayback();
    assignments$.next([0, 1, 2, 3, 4, 5, 6].map((i) => ({ index: i, text: null, audioBuffer: null })));

    const ac = new AbortController();
    ongoingTasks.push(ac);

    try {
      updateState((state) => ({ ...state, storyHistory: [], storyOptions: {} }));

      const parser = new JSONParser();

      parser.onValue = (entry) => {
        if (typeof entry.key === "number" && typeof entry.value === "string") {
          console.log("Story option:", entry.value);

          const randomIndex = random(new Set(assignments$.value.filter((a) => a.text === null).map((a) => a.index)));
          if (randomIndex === null) {
            console.log("No available assignment slots, skip");
            return;
          }

          textGenerated$.next(randomIndex);
          assignments$.next(
            assignments$.value.map((a) =>
              a.index === randomIndex
                ? {
                    ...a,
                    text: entry.value as string,
                    audioBuffer: generateSpeech(entry.value as string, ac.signal),
                    visited: false,
                  }
                : a,
            ),
          );
        }
      };

      const response = await ai.models.generateContentStream({
        model: "gemini-2.5-flash",
        contents:
          `Generate 3 different story beginnings for a text adventure game. Each option should be a one verbal sentence.`.trim(),
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: zodToJsonSchema(storyOptionsSchema as any),
          abortSignal: ac.signal,
        },
      });

      for await (const chunk of response) {
        const maybeOutput = chunk.candidates?.at(0)?.content?.parts?.at(0)?.text;
        if (!maybeOutput) continue;
        parser.write(maybeOutput);
      }

      res.writeHead(200);
      res.end();
    } finally {
      ongoingTasks = ongoingTasks.filter((task) => task !== ac);
    }

    return true;
  };
}

function killAllTasks() {
  ongoingTasks.forEach((ac) => ac.abort());
  ongoingTasks = [];
}

function random(set: Set<number>): number | null {
  if (set.size === 0) return null;
  const items = Array.from(set);
  return items[Math.floor(Math.random() * items.length)];
}

async function generateSpeech(text: string, signal?: AbortSignal) {
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
