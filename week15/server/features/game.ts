import { GoogleGenAI } from "@google/genai";
import { JSONParser } from "@streamparser/json";
import { BehaviorSubject, combineLatest, distinctUntilChanged, filter, map, scan, Subject, tap } from "rxjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BLEDevice } from "./ble";
import { sendAIText, startAIAudio, stopAIAudio } from "./gemini-live";
import type { Handler } from "./http";
import { operatorButtons$, operatorProbeNum$ } from "./operator";
import { cancelAllSpeakerPlayback, playAudioThroughSpeakers } from "./speaker";
import { broadcast, newSseClient$ } from "./sse";
import { appState$, getActiveOperator, getActiveOperatorIndices } from "./state";
import { blinkOnLED, pulseOnLED, turnOffAllLED } from "./switchboard";
import { GenerateOpenAISpeech, getRandomVoiceGenerator } from "./tts";
import { startPcmStream } from "./udp";

const characterSchema = z.object({
  trait: z.string().describe("An adjective phrase describing the character's personality or demeanor"),
  profession: z.string().describe("A single noun describing the character's role or occupation"),
  intro: z.string().describe("In only a few words, introduce yourself with 'I am...', including the trait and profession. Remain anonymous."),
  voiceActor: z.string().describe("Description of the voice quality and characteristics"),
  archetype: z
    .enum(["hero", "magician", "lover", "jester", "explorer", "sage", "innocent", "creator", "caregiver", "outlaw", "orphan", "seducer"])
    .describe("Character archetype"),
});

const characterOptionsSchema = z.object({
  characterOptions: z.array(characterSchema).length(7),
});
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface StoryOption {
  probeId: number;
  trait: string | null;
  profession: string | null;
  intro: string | null;
  voiceActor: string | null;
  archetype: string | null;
  voice: string | null;
  audioBuffer: Promise<Buffer> | null;
}

export const storyOptionGenerated$ = new Subject<StoryOption>();
export const characterOptions = new BehaviorSubject<StoryOption[]>([]);

export function handleNewGame(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/game/new") return false;

    // Start a new game session
    phase$.next("setup");
    resetConfirmedOperators();

    // Start PCM stream to the active operator
    const activeOp = getActiveOperator(appState$.value);
    if (activeOp?.address) {
      startPcmStream(activeOp.address);
    }

    // Generate story options
    await generateStoryOptions();

    res.writeHead(200);
    res.end();
    return true;
  };
}

async function generateStoryOptions() {
  // Initialize story options with all 7 probe IDs
  const allProbes = [0, 1, 2, 3, 4, 5, 6];

  characterOptions.next(
    allProbes.map((probeId) => ({
      probeId,
      trait: null,
      profession: null,
      intro: null,
      voiceActor: null,
      archetype: null,
      voice: null,
      audioBuffer: null,
    }))
  );

  // Create a new voice generator for this game session
  const voiceGenerator = getRandomVoiceGenerator();

  const parser = new JSONParser();
  const characters: Partial<StoryOption>[] = [];

  parser.onValue = (entry) => {
    // Handle array elements: characterOptions[0], characterOptions[1], etc.
    if (typeof entry.key === "number" && typeof entry.value === "object" && entry.value !== null) {
      const charData = entry.value as { trait?: string; profession?: string; intro?: string; voiceActor?: string; archetype?: string };
      const probeId = allProbes[entry.key];

      if (charData.trait && charData.profession && charData.intro && charData.voiceActor && charData.archetype) {
        const voice = voiceGenerator.next().value as string;
        console.log("Character generated:", { probeId, voice, ...charData });

        const option: StoryOption = {
          probeId,
          trait: charData.trait,
          profession: charData.profession,
          intro: charData.intro,
          voiceActor: charData.voiceActor,
          archetype: charData.archetype,
          voice,
          audioBuffer: GenerateOpenAISpeech(charData.intro, { voice, instructions: charData.voiceActor }),
        };

        storyOptionGenerated$.next(option);
        characters.push(option);
      }
    }
  };

  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: `Generate exactly seven (7) distinct fantasy game characters for a quest. For each character provide:
- archetype: Choose from hero, magician, lover, jester, explorer, sage, innocent, creator, caregiver, outlaw, orphan, or seducer
- trait: A single adjective describing the character's personality or demeanor (e.g., "cunning", "brave", "mysterious")
- profession: A single noun describing the character's role or occupation (e.g., "blacksmith", "oracle", "hunter")
- intro: A compelling one-sentence intro grounded in archetype, starting with "I am..." that captures their essence using the trait and profession. ONLY a few words.
- voiceActor: A vivid description of their voice quality (e.g., "deep and gravelly", "soft and melodic", "crackling with energy"), grounded in their archetype and intro.

Make sure the characters have synergy with each other and cover diverse archetypes.`,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: zodToJsonSchema(characterOptionsSchema as any),
    },
  });

  for await (const chunk of response) {
    const maybeOutput = chunk.candidates?.at(0)?.content?.parts?.at(0)?.text;
    if (!maybeOutput) continue;
    parser.write(maybeOutput);
  }
}

export type Phase = "setup" | "live";

export interface ToolRegistration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export const tools: ToolRegistration[] = [
  {
    name: "update_leds",
    description:
      "Update the status of all 7 LED lights to communicate game state. Use 'pulsing' for available interactive elements, 'blinking' for intense action moments, and 'off' when nothing is there.",
    parameters: {
      type: "object",
      properties: {
        leds: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: {
                type: "number",
                description: "LED id from 0 to 6",
              },
              status: {
                type: "string",
                enum: ["off", "pulsing", "blinking"],
                description: "off = nothing there, pulsing = available for interaction, blinking = in-action",
              },
            },
            required: ["id", "status"],
          },
          minItems: 7,
          maxItems: 7,
          description: "Array of exactly 7 LED status objects, one for each LED (id 0-6)",
        },
      },
      required: ["leds"],
    },
  },
];

export type ToolHandler = (params?: Record<string, unknown>) => Promise<string>;

let _switchboard: BLEDevice | null = null;

export function setSwitchboardForTools(switchboard: BLEDevice) {
  _switchboard = switchboard;
}

export const toolHandlers: Record<string, ToolHandler> = {
  update_leds: async (params) => {
    if (!_switchboard) {
      return "Switchboard not connected";
    }

    const leds = params?.leds as Array<{ id: number; status: "off" | "pulsing" | "blinking" }> | undefined;
    if (!leds || leds.length !== 7) {
      return "Invalid LED configuration: must provide exactly 7 LED statuses";
    }

    // Update current LED state
    const newState: LedState[] = leds.map((led) => ({
      id: led.id,
      status: led.status,
    }));
    ledState$.next(newState);

    // Apply LED changes to switchboard
    for (const led of leds) {
      switch (led.status) {
        case "off":
          await _switchboard.send(`fadeoff:${led.id}`);
          break;
        case "pulsing":
          await pulseOnLED(_switchboard, led.id);
          break;
        case "blinking":
          await blinkOnLED(_switchboard, led.id);
          break;
      }
    }

    return "LED update success";
  },
};

export interface LedState {
  id: number;
  status: "off" | "pulsing" | "blinking";
}

export const ledState$ = new BehaviorSubject<LedState[]>([0, 1, 2, 3, 4, 5, 6].map((id) => ({ id, status: "off" as const })));

export const gmHint$ = new Subject<string>();
export const phase$ = new BehaviorSubject<Phase>("setup");

// Tracks which operators have confirmed (both buttons pressed at same time)
const confirmedOperators = new Set<number>();

// Maps operator index to their selected character (trait + profession)
const operatorPlayerMap = new Map<number, { trait: string; profession: string }>();

export function resetConfirmedOperators() {
  confirmedOperators.clear();
  operatorPlayerMap.clear();
}

/** Get the player label in "<trait> <profession>" format for an operator */
function getPlayerLabel(operatorIndex: number): string | null {
  const player = operatorPlayerMap.get(operatorIndex);
  if (!player) return null;
  return `${player.trait} ${player.profession}`;
}

/**
 * Gets the probe number of the currently active operator.
 */
function getActiveOperatorProbeNum(): number {
  const activeOp = getActiveOperator(appState$.value);
  return activeOp?.probeNum ?? 7;
}

export function startGameLoop(switchboard: BLEDevice) {
  // Set switchboard reference for tool handlers
  setSwitchboardForTools(switchboard);

  /** Game logic */
  gmHint$.pipe(tap((hint) => sendAIText(`[${hint}]`))).subscribe();

  // Accumulate individual story options into the full list
  storyOptionGenerated$
    .pipe(
      scan((_acc, option) => {
        const currentOptions = characterOptions.value;
        const updatedOptions = currentOptions.map((opt) => (opt.probeId === option.probeId ? option : opt));
        return updatedOptions;
      }, characterOptions.value),
      tap((options) => characterOptions.next(options))
    )
    .subscribe();

  // Broadcast game state on change
  combineLatest([phase$, characterOptions, ledState$])
    .pipe(
      tap(([phase, storyOptions, ledState]) => {
        broadcast({ type: "gameState", phase, storyOptions, ledState });
      })
    )
    .subscribe();

  // Send current state to new clients
  newSseClient$
    .pipe(
      tap((client) => {
        const state = {
          type: "gameState",
          phase: phase$.value,
          storyOptions: characterOptions.value,
          ledState: ledState$.value,
        };
        client.write(`data: ${JSON.stringify(state)}\n\n`);
      })
    )
    .subscribe();

  // Light up LED as each story option becomes available
  storyOptionGenerated$
    .pipe(
      tap(async (option) => {
        if (phase$.value === "setup" && option.intro !== null) {
          setTimeout(() => pulseOnLED(switchboard, option.probeId), Math.random() * 500);
        }
      })
    )
    .subscribe();

  const allOperatorsConfirmed$ = operatorButtons$.pipe(
    tap(({ operatorIndex, btn1, btn2 }) => {
      if (btn1 && btn2) {
        confirmedOperators.add(operatorIndex);
      }
    }),
    map(() => {
      const activeIndices = getActiveOperatorIndices(appState$.value);
      if (activeIndices.length === 0) return false;

      // Check if all active operators have confirmed
      return activeIndices.every((index) => confirmedOperators.has(index));
    }),
    distinctUntilChanged(),
    filter((allConfirmed) => allConfirmed && phase$.value === "setup")
  );

  // Handle character selection confirmation
  allOperatorsConfirmed$
    .pipe(
      tap(async () => {
        console.log("All operators confirmed character selection!");
        cancelAllSpeakerPlayback();

        // Collect selected characters for each operator and build player mapping
        const operators = appState$.value.operators;
        const selectedCharacters: string[] = [];

        operators.forEach((op, operatorIndex) => {
          if (op.probeNum !== 7) {
            const option = characterOptions.value.find((opt) => opt.probeId === op.probeNum);
            if (option && option.trait && option.profession) {
              // Store the operator-to-player mapping
              operatorPlayerMap.set(operatorIndex, { trait: option.trait, profession: option.profession });
              const playerLabel = `${option.trait} ${option.profession}`;
              selectedCharacters.push(playerLabel);
            }
          }
        });

        if (selectedCharacters.length === 0) {
          console.log("No valid character selections found");
          return;
        }

        // Transition to live phase
        phase$.next("live");
        await turnOffAllLED(switchboard);

        // Send GM HINT with selected characters (labeled as <trait> <profession>) and ask for first scene
        const characterList = selectedCharacters.map((label) => `"${label}"`).join(", ");
        gmHint$.next(
          `Players have selected their characters: ${characterList}. Present the opening scene and use update_leds to pulse the LEDs for available story elements.`
        );
      })
    )
    .subscribe();

  operatorProbeNum$
    .pipe(
      tap(async ({ operatorIndex, probeNum }) => {
        // Cancel any ongoing playback when user unplugs or changes probe
        cancelAllSpeakerPlayback();
        stopAIAudio();

        if (probeNum === 7) return;

        if (phase$.value === "setup") {
          // Handle story option probing during setup phase - play pre-generated audio
          const option = characterOptions.value.find((opt) => opt.probeId === probeNum);

          if (option && option.intro !== null && option.audioBuffer !== null) {
            try {
              const audioBuffer = await option.audioBuffer;
              // Check if still on the same probe after async wait
              const currentProbe = getActiveOperatorProbeNum();
              if (currentProbe === probeNum) {
                await playAudioThroughSpeakers(audioBuffer);
              }
            } catch (err) {
              console.error("Failed to play character intro:", err);
            }
          } else {
            console.log("Player probed an option that is not ready yet");
          }
        } else if (phase$.value === "live") {
          startAIAudio();
          const playerLabel = getPlayerLabel(operatorIndex);
          if (playerLabel) {
            gmHint$.next(`"${playerLabel}" is probing LED ${probeNum}.`);
          } else {
            gmHint$.next(`A player is probing LED ${probeNum}.`);
          }
        }
      })
    )
    .subscribe();
}
