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
import { appState$, getActiveOperator } from "./state";
import { blinkOnLED, pulseOnLED, turnOffAllLED } from "./switchboard";
import { GenerateOpenAISpeech } from "./tts";
import { startPcmStream } from "./udp";

const characterSchema = z.object({
  intro: z.string().describe("In only a few words, introduce yourself with 'I am...', including profession and trait. Remain anonymous"),
  voiceActor: z.string().describe("Description of the voice quality and characteristics"),
  archetype: z
    .enum(["hero", "magician", "lover", "jester", "explorer", "sage", "innocent", "creator", "caregiver", "outlaw", "orphan", "seducer"])
    .describe("Character archetype"),
  gender: z.enum(["M", "F"]).describe("Character gender: M for male, F for female"),
});

const characterOptionsSchema = z.object({
  characterOptions: z.array(characterSchema).length(7),
});
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface StoryOption {
  probeId: number;
  intro: string | null;
  voiceActor: string | null;
  archetype: string | null;
  gender: string | null;
  audioBuffer: Promise<Buffer> | null;
}

export const storyOptionGenerated$ = new Subject<StoryOption>();
export const characterOptions = new BehaviorSubject<StoryOption[]>([]);

export function handleNewGame(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/game/new") return false;

    // Start a new game session
    phase$.next("setup");

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
      intro: null,
      voiceActor: null,
      archetype: null,
      gender: null,
      audioBuffer: null,
    }))
  );

  const parser = new JSONParser();
  const characters: Partial<StoryOption>[] = [];

  parser.onValue = (entry) => {
    // Handle array elements: characterOptions[0], characterOptions[1], etc.
    if (typeof entry.key === "number" && typeof entry.value === "object" && entry.value !== null) {
      const charData = entry.value as { intro?: string; voiceActor?: string; archetype?: string; gender?: string };
      const probeId = allProbes[entry.key];

      if (charData.intro && charData.voiceActor && charData.archetype && charData.gender) {
        console.log("Character generated:", { probeId, ...charData });

        const option: StoryOption = {
          probeId,
          intro: charData.intro,
          voiceActor: charData.voiceActor,
          archetype: charData.archetype,
          gender: charData.gender,
          audioBuffer: GenerateOpenAISpeech(charData.intro),
        };

        storyOptionGenerated$.next(option);
        characters.push(option);
      }
    }
  };

  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: `Generate exactly seven (7) distinct fantasy game characters for a quest. For each character provide:
- intro: A compelling one-sentence introduction starting with "I am..." that captures their essence. ONLY a few words.
- voiceActor: A vivid description of their voice quality (e.g., "deep and gravelly", "soft and melodic", "crackling with energy")
- archetype: Choose from hero, magician, lover, jester, explorer, sage, innocent, creator, caregiver, outlaw, orphan, or seducer
- gender: Either "M" for male or "F" for female

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

export type Phase = "setup" | "exploration" | "action";

export interface ToolRegistration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

export const tools: ToolRegistration[] = [
  {
    name: "transition_to_exploration",
    description: "transition the game from action to exploration phase",
    parameters: {
      type: "object",
      properties: {
        scene: {
          type: "string",
          description: "a short name for the scene",
        },
        elements: {
          type: "array",
          items: {
            type: "string",
          },
          description: "list exactly three elements that can be investigated by the player, each one is a short name",
        },
        previousActionChoice: {
          type: "string",
          description: "description of the action option the player took in the previous action phase, if any",
        },
      },
      required: ["scene", "elements"],
    },
  },
  {
    name: "transition_to_action",
    description: "transition the game from exploration to action phase",
    parameters: {
      type: "object",
      properties: {
        optionA: {
          type: "string",
          description: "description one option to take the action",
        },
        optionB: {
          type: "string",
          description: "description of the other option to take the action",
        },
      },
      required: ["optionA", "optionB"],
    },
  },
];

export type ToolHandler = (params?: Record<string, unknown>) => Promise<string>;

export const toolHandlers: Record<string, ToolHandler> = {
  transition_to_action: async (params) => {
    phase$.next("action");
    const optionA = (params?.optionA as string) || "";
    const optionB = (params?.optionB as string) || "";
    actionOptions$.next({ a: optionA, b: optionB });
    return "Transitioned to action phase, ask player to choose an option";
  },
  transition_to_exploration: async (params) => {
    if (phase$.value !== "exploration") {
      phase$.next("exploration");
    }

    const scene = (params?.scene as string) || "";
    const elements = (params?.elements as string[]) || [];
    const previousActionChoice = (params?.previousActionChoice as string) || "";

    sceneName$.next(scene);
    if (previousActionChoice) {
      lastActionChoice$.next(previousActionChoice);
    }

    setupScene$.next({ elements });

    return "Transitioned to exploration phase, ask player to explore.";
  },
};

export const gmHint$ = new Subject<string>();
export const phase$ = new BehaviorSubject<Phase>("setup");

export const sceneObjects = new BehaviorSubject<number[]>([]);
export const sceneName$ = new BehaviorSubject<string>("");
export const lastActionChoice$ = new BehaviorSubject<string>("");
export const actionOptions$ = new BehaviorSubject<{ a: string; b: string } | null>(null);
export const setupScene$ = new Subject<{ elements: string[] }>();

export type ElementStatus = "unexplored" | "exploring" | "explored" | "acted";

export interface SceneElementState {
  probeId: number;
  name: string;
  status: ElementStatus;
}

export const sceneElements$ = new BehaviorSubject<SceneElementState[]>([]);

export const enterExploration$ = phase$.pipe(filter((phase) => phase === "exploration"));
export const enterAction$ = phase$.pipe(filter((phase) => phase === "action"));

let explorationRound = 0;

/**
 * Gets all probe numbers currently in use by any connected operator.
 * Excludes probe 7 (unplugged).
 */
function getActiveProbeNums(): number[] {
  return appState$.value.operators.map((op) => op.probeNum).filter((num) => num !== 7);
}

/**
 * Gets the probe number of the currently active operator.
 */
function getActiveOperatorProbeNum(): number {
  const activeOp = getActiveOperator(appState$.value);
  return activeOp?.probeNum ?? 7;
}

export function startGameLoop(switchboard: BLEDevice) {
  /** Game logic */
  gmHint$.pipe(tap((hint) => sendAIText(`[GM HINT] ${hint}`))).subscribe();

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
  combineLatest([phase$, sceneElements$, sceneName$, lastActionChoice$, actionOptions$, characterOptions])
    .pipe(
      tap(([phase, elements, sceneName, lastActionChoice, actionOptions, storyOptions]) => {
        broadcast({ type: "gameState", phase, elements, sceneName, lastActionChoice, actionOptions, storyOptions });
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
          elements: sceneElements$.value,
          sceneName: sceneName$.value,
          lastActionChoice: lastActionChoice$.value,
          actionOptions: actionOptions$.value,
          storyOptions: characterOptions.value,
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

  setupScene$
    .pipe(
      tap(async ({ elements }) => {
        explorationRound++;
        await turnOffAllLED(switchboard);

        // Exclude all probes currently in use by any operator
        const activeProbes = getActiveProbeNums();
        const availableProbes = [0, 1, 2, 3, 4, 5, 6].filter((p) => !activeProbes.includes(p));
        const threeRandomProbes = availableProbes.sort(() => 0.5 - Math.random()).slice(0, 3);
        sceneObjects.next(threeRandomProbes);

        // Check if any active probe is exploring
        const currentProbe = getActiveOperatorProbeNum();
        const newSceneElements: SceneElementState[] = [];
        for (let i = 0; i < Math.min(elements.length, threeRandomProbes.length); i++) {
          newSceneElements.push({
            probeId: threeRandomProbes[i],
            name: elements[i],
            status: threeRandomProbes[i] === currentProbe ? "exploring" : "unexplored",
          });
        }
        sceneElements$.next(newSceneElements);

        threeRandomProbes.forEach((probe) => setTimeout(() => pulseOnLED(switchboard, probe), 1000 + Math.random() * 2000));
      })
    )
    .subscribe();

  enterAction$
    .pipe(
      tap(async () => {
        await turnOffAllLED(switchboard);
        const currentProbe = getActiveOperatorProbeNum();
        blinkOnLED(switchboard, currentProbe); // turn on center LED for action

        const elements = sceneElements$.value;
        const newElements = elements.map((e) => {
          if (e.probeId === currentProbe) {
            return { ...e, status: "acted" as ElementStatus };
          }
          return e;
        });
        sceneElements$.next(newElements);
      })
    )
    .subscribe();

  // Character selection confirmation: all operators must have both buttons pressed
  // Track when all operators have both buttons down
  const allOperatorsConfirmed$ = operatorButtons$.pipe(
    // Map each button event to update an accumulated state of all operators
    scan((acc, { operatorIndex, btn1, btn2 }) => {
      const newAcc = new Map(acc);
      newAcc.set(operatorIndex, btn1 && btn2);
      return newAcc;
    }, new Map<number, boolean>()),
    // Check if all connected operators have both buttons pressed
    map((buttonStates) => {
      const operators = appState$.value.operators;
      if (operators.length === 0) return false;

      // All operators must have both buttons down
      for (let i = 0; i < operators.length; i++) {
        const confirmed = buttonStates.get(i) ?? false;
        if (!confirmed) return false;
      }
      return true;
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

        // Collect selected characters for each operator
        const operators = appState$.value.operators;
        const selectedCharacters: string[] = [];

        for (const op of operators) {
          if (op.probeNum !== 7) {
            const option = characterOptions.value.find((opt) => opt.probeId === op.probeNum);
            if (option && option.intro) {
              selectedCharacters.push(option.intro);
            }
          }
        }

        if (selectedCharacters.length === 0) {
          console.log("No valid character selections found");
          return;
        }

        // Transition to exploration phase
        phase$.next("exploration");
        await turnOffAllLED(switchboard);

        // Send GM HINT with selected characters and ask for first scene
        const characterList = selectedCharacters.map((intro, i) => `Player ${i + 1}: "${intro}"`).join(", ");
        gmHint$.next(`Players have selected their characters. ${characterList}. Call transition_to_exploration to begin the adventure with the first scene.`);
      })
    )
    .subscribe();

  operatorProbeNum$
    .pipe(
      tap(async ({ operatorIndex: _operatorIndex, probeNum }) => {
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
        } else if (phase$.value === "exploration") {
          startAIAudio();
          const elements = sceneElements$.value;
          const targetElement = elements.find((e) => e.probeId === probeNum);

          let updated = false;
          const newElements = elements.map((e) => {
            if (e.probeId === probeNum) {
              if (e.status === "unexplored" || e.status === "explored") {
                updated = true;
                return { ...e, status: "exploring" as ElementStatus };
              }
            } else {
              if (e.status === "exploring") {
                updated = true;
                return { ...e, status: "explored" as ElementStatus };
              }
            }
            return e;
          });

          if (updated) {
            sceneElements$.next(newElements);
          }

          if (!sceneObjects.value.includes(probeNum)) {
            gmHint$.next(`Player investigated the wrong thing. Tell them there is nothing there.`);
          } else {
            const elementName = targetElement ? targetElement.name : `element (id=${explorationRound}-${probeNum})`;
            gmHint$.next(
              `Player is investigating "${elementName}". Reveal possible actions to the player. When player revisits the same element, be consistent with what you said before.`
            );
          }
        }
      })
    )
    .subscribe();
}
