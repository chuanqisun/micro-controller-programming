import { GoogleGenAI } from "@google/genai";
import { JSONParser } from "@streamparser/json";
import OpenAI from "openai";
import { BehaviorSubject, Subject } from "rxjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Handler } from "./http";
import { cancelAllSpeakerPlayback, playPcm16Buffer } from "./speaker";
import { appState$, updateState } from "./state";
import { GenerateOpenAISpeech } from "./tts";

const storyOptionsSchema = z.object({
  storyOptions: z.array(z.string().describe("A story beginning for a text adventure game.")),
});
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const textGenerated$ = new Subject<number>();
export const assignments$ = new BehaviorSubject<
  { index: number; text: string | null; audioBuffer: Promise<Buffer> | null }[]
>([]);

let ongoingTasks = [] as AbortController[];

export async function previewOption(id: number) {
  const assignment = assignments$.value.find((a) => a.index === id);
  if (!assignment || assignment.text === null || assignment.audioBuffer === null) {
    console.error("Assignment not found or not ready");
    return;
  }

  cancelAllSpeakerPlayback();
  playPcm16Buffer(await assignment.audioBuffer);
}

export async function commitOption(id: number) {
  const assignment = assignments$.value.find((a) => a.index === id);
  if (!assignment || assignment.text === null) {
    console.error("Assignment not found or not ready");
    return;
  }

  killAllTasks();
  cancelAllSpeakerPlayback();

  // Commit the option to the story history
  updateState((state) => ({
    ...state,
    storyHistory: [...state.storyHistory, assignment.text!],
  }));

  // reset assignment slots
  assignments$.next(assignments$.value.map((a) => ({ ...a, text: null, audioBuffer: null })));

  const ac = new AbortController();
  ongoingTasks.push(ac);
  try {
    await generateOptionsInternal(ac, id);
  } finally {
    ongoingTasks = ongoingTasks.filter((task) => task !== ac);
  }
}

export function handleStartTextAdventures(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/adventure/start") return false;

    killAllTasks();
    cancelAllSpeakerPlayback();
    assignments$.next([0, 1, 2, 3, 4, 5, 6].map((i) => ({ index: i, text: null, audioBuffer: null })));
    updateState((state) => ({ ...state, storyHistory: [] }));

    const ac = new AbortController();
    ongoingTasks.push(ac);

    try {
      await generateOptionsInternal(ac);
      res.writeHead(200);
      res.end();
    } finally {
      ongoingTasks = ongoingTasks.filter((task) => task !== ac);
    }

    return true;
  };
}

async function generateOptionsInternal(ac: AbortController, escapeIndex?: number) {
  const parser = new JSONParser();

  parser.onValue = (entry) => {
    if (typeof entry.key === "number" && typeof entry.value === "string") {
      console.log("Story option:", entry.value);

      const randomIndex = random(
        new Set(assignments$.value.filter((a) => a.text === null && a.index !== escapeIndex).map((a) => a.index)),
      );
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
                audioBuffer: GenerateOpenAISpeech(entry.value as string, ac.signal),
                visited: false,
              }
            : a,
        ),
      );
    }
  };

  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: appState$.value.storyHistory.length
      ? `Based on the following story so far, generate 3 different story continuations for a text adventure game. Each option should be a one short verbal sentence with only a few words.
          
Story so far:
${appState$.value.storyHistory.join("\n")}
          `.trim()
      : `Generate 3 different story beginnings for a text adventure game. Each option should be a one short verbal sentence with only a few words.`.trim(),
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
