import { GoogleGenAI } from "@google/genai";
import { JSONParser } from "@streamparser/json";
import { BehaviorSubject, combineLatest, filter, scan, Subject, tap } from "rxjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { BLEDevice } from "./ble";
import { sendAIText, startAIAudio, stopAIAudio } from "./gemini-live";
import type { Handler } from "./http";
import { operatorProbeNum$ } from "./operator";
import { broadcast, newSseClient$ } from "./sse";
import { appState$, getActiveOperator } from "./state";
import { blinkOnLED, pulseOnLED, turnOffAllLED } from "./switchboard";
import { startPcmStream } from "./udp";

const storyOptionsSchema = z.object({
  storyOptions: z.array(z.string().describe("A story beginning for a text adventure game.")).length(7),
});
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface StoryOption {
  probeId: number;
  text: string | null;
}

export const storyOptionGenerated$ = new Subject<StoryOption>();
export const storyOptions$ = new BehaviorSubject<StoryOption[]>([]);

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

  storyOptions$.next(
    allProbes.map((probeId) => ({
      probeId,
      text: null,
    }))
  );

  const parser = new JSONParser();
  let optionIndex = 0;

  parser.onValue = (entry) => {
    if (typeof entry.key === "number" && typeof entry.value === "string") {
      console.log("Story option:", entry.value);

      if (optionIndex < allProbes.length) {
        const probeId = allProbes[optionIndex];

        // Emit individual option as it becomes available
        storyOptionGenerated$.next({
          probeId,
          text: entry.value as string,
        });

        optionIndex++;
      }
    }
  };

  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: `Generate 7 different story beginnings for a text adventure game quest. Each option should be just a few words to setup scene and mood.`,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: zodToJsonSchema(storyOptionsSchema as any),
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
    name: "start_exploration",
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
          description: "list of elements that can be investigated by the player, each one is a short name",
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
    name: "start_action",
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
  start_action: async (params) => {
    phase$.next("action");
    const optionA = (params?.optionA as string) || "";
    const optionB = (params?.optionB as string) || "";
    actionOptions$.next({ a: optionA, b: optionB });
    return "Transitioned to action phase, ask player to choose an option";
  },
  start_exploration: async (params) => {
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

export function getDungeonMasterPrompt(): string {
  return `
# Role & Objective
You are an expert Dungeon Master for Dungeons & Dragons.
You goal is to create immersive game play and drive the story forward.

## Style
You only respond only in very short verbal utterance, typically just a few words to a half sentence. The minimalist leaves room fo players to imagine the scene.

## Hints
You play close attention is any [GM HINT] messages that are only visible to you.
You must follow the [GM HINT] instruction to master the game without revealing those hints to the players.

## Game format
Setup -> Loop: (Player exploration -> Player action -> Repeat)

### Setup
Initial story selection phase.
Player listens to story options. After announcing each, ask player whether to take on the adventure.
When player explicitly commits, you must immediately call start_exploration tool to begin the game with the chosen story premise.

### Exploration
One or more turns of investigation, ending with action.
Player can ask questions about the environment
Player can explore exactly 3 elements in the scene
Do NOT trigger an action when Player can ask about the scene and elements
Do NOT tell player about the interactive elements in the scene
To exit, they must explicitly take an action related to the scene 

### Action
Only a **single** turn
Player must choose how to interact with the element they were investigating
Once entered action phase, announce choice A and choice B to the player. Player cannot refuse to choose
The action options must lead to outcome that drives the story
Player must make a choice in one turn. You will describe the outcome, advance the plot, and immediately transition to exploration using start_exploration tool.

## Tools
Follow the [GM HINT] to use the right tool at the right time. Do NOT use any tool unless instructed by the [GM HINT].

### start_exploration tool
Set the scene and exactly three interactive elements in the scene
Make sure each scene element can lead to plot development
Depending on the scene and previous action, the elements can be concrete characters, artifacts, places, or abstract ideas, strategies, plans. The key requirement is that they must be investigatable.
As story advances, scene and elements should change accordingly to offer new paths of exploration
After calling this tool, you must describe the scene in just short sentence
You must NOT mention any the interactive elements. 
Leave it to the player to discover the elements as they explicitly explore the scene.

### start_action tool
Call this tool when player explicitly acts on the scene element
You must plan ahead the two options the player has to carry out this action
The player can't read the options. You must immediately announce each option to the player and ask them to choose verbally.
Player cannot refuse to choose one of the options
As soon as player speaks, you must summarize outcome and use start_exploration tool to transition to exploration.
You must record the specific action option taken by the player in the previousActionChoice parameter of start_exploration tool

# IMPORANT

Always use the tool first, then narrate after.
You must transition out from the action phase immediately. If player doesn't make a choice, you will force an action and use start_exploration tool right away.
`;
}

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
        const currentOptions = storyOptions$.value;
        const updatedOptions = currentOptions.map((opt) => (opt.probeId === option.probeId ? option : opt));
        return updatedOptions;
      }, storyOptions$.value),
      tap((options) => storyOptions$.next(options))
    )
    .subscribe();

  // Broadcast game state on change
  combineLatest([phase$, sceneElements$, sceneName$, lastActionChoice$, actionOptions$, storyOptions$])
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
          storyOptions: storyOptions$.value,
        };
        client.write(`data: ${JSON.stringify(state)}\n\n`);
      })
    )
    .subscribe();

  // Light up LED as each story option becomes available
  storyOptionGenerated$
    .pipe(
      tap(async (option) => {
        if (phase$.value === "setup" && option.text !== null) {
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

  operatorProbeNum$
    .pipe(
      tap(({ operatorIndex: _operatorIndex, probeNum }) => {
        stopAIAudio();
        if (probeNum === 7) return;

        startAIAudio();

        if (phase$.value === "setup") {
          // Handle story option probing during setup phase
          const option = storyOptions$.value.find((opt) => opt.probeId === probeNum);

          if (option && option.text !== null) {
            gmHint$.next(
              `Tell player about the quest "${option.text}". Announce this option to the player in your own words, setup the scene and mood in just a few words. Make it an enticing beginning to quest.`
            );
          } else {
            gmHint$.next(`Player probed an invalid option. Tell them to choose one of the available story options.`);
          }
        } else if (phase$.value === "exploration") {
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
              `Player investigated ${elementName} in the scene. Name it and imply possible actions for the player. Player revisits the same id, be consistent with what you said before.`
            );
          }
        }
      })
    )
    .subscribe();
}
