import { BehaviorSubject, combineLatest, filter, Subject, tap } from "rxjs";
import { BLEDevice } from "./ble";
import { sendAIText, startAIAudio, stopAIAudio } from "./gemini-live";
import type { Handler } from "./http";
import { operatorProbeNum$ } from "./operator";
import { broadcast, newSseClient$ } from "./sse";
import { appState$ } from "./state";
import { blinkOnLED, turnOffAllLED, turnOnLED } from "./switchboard";
import { startPcmStream } from "./udp";

export function handleNewGame(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/game/new") return false;

    // Start a new game session
    startPcmStream(appState$.value.opAddress);
    gmHint$.next("Ask player to choose a location to start their adventure. Offer a few random options, one word each.");

    res.writeHead(200);
    res.end();
    return true;
  };
}

export type Phase = "idle" | "exploration" | "action";

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
    return "Transitioned to action phase";
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

    return "Transitioned to exploration phase";
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
Loop: Player exploration -> Player action -> Repeat

### Exploration
One or more turns of investigation, ending with action.
Player can ask questions about the environment
They can investigate up to 3 elements in the scene
Do NOT trigger an action when Player can ask about the scene and elements
To exit, they must explicitly take an action related to the scene 

### Action
**Single** turn of choice.
Player can interact with the elements they investigated
Once entered action phase, offer player choice A and choice B. Player cannot refuse to choose
The action options must lead to outcome that drives the story
Player must make a choice in one turn. You will describe the outcome, advance the plot, and immediately transition to exploration using start_exploration tool.

## Tools
Follow the [GM HINT] to use the right tool at the right time. Do NOT use any tool unless instructed by the [GM HINT].

### start_exploration tool
Set the scene and up to three interactive elements in the scene
Make sure each scene element can lead to plot development
As story advances, scene and elements should change accordingly to offer new paths of exploration
After calling this tool, you must describe the scene in just short sentence, but you must NOT reveal the interactive elements. 
The player will discover the elements by explicitly explorating the scene.

### start_action tool
Call this tool when player explicitly acts on the scene element
You must plan ahead the two options the player has to carry out this action, and succinctly announce it to the player
The two options are only visible to you as GM. You must reveal to the player without assuming they know what the options are.
Player cannot refuse to choose one of the options
As soon as player speaks, you must summarize outcome and use start_exploration tool to transition to exploration.
You must record the specific action option taken by the player in the previousActionChoice parameter of start_exploration tool
`;
}

export const gmHint$ = new Subject<string>();
export const phase$ = new BehaviorSubject<Phase>("idle");

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

export function startGameLoop(switchboard: BLEDevice) {
  /** Game logic */
  gmHint$.pipe(tap((hint) => sendAIText(`[GM HINT] ${hint}`))).subscribe();

  // Broadcast game state on change
  combineLatest([phase$, sceneElements$, sceneName$, lastActionChoice$, actionOptions$])
    .pipe(
      tap(([phase, elements, sceneName, lastActionChoice, actionOptions]) => {
        broadcast({ type: "gameState", phase, elements, sceneName, lastActionChoice, actionOptions });
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
        };
        client.write(`data: ${JSON.stringify(state)}\n\n`);
      })
    )
    .subscribe();

  // Note: Removed enterExploration$ gmHint$ since the DM prompt already instructs
  // Gemini what to do after calling start_exploration tool. Sending another hint
  // here causes double responses.

  setupScene$
    .pipe(
      tap(async ({ elements }) => {
        explorationRound++;
        await turnOffAllLED(switchboard);
        const currentProbe = appState$.value.probeNum;
        const availableProbes = [0, 1, 2, 3, 4, 5, 6].filter((p) => p !== currentProbe);
        const threeRandomProbes = availableProbes.sort(() => 0.5 - Math.random()).slice(0, 3);
        sceneObjects.next(threeRandomProbes);

        const newSceneElements: SceneElementState[] = [];
        for (let i = 0; i < Math.min(elements.length, threeRandomProbes.length); i++) {
          newSceneElements.push({
            probeId: threeRandomProbes[i],
            name: elements[i],
            status: threeRandomProbes[i] === currentProbe ? "exploring" : "unexplored",
          });
        }
        sceneElements$.next(newSceneElements);

        threeRandomProbes.forEach((probe) => setTimeout(() => turnOnLED(switchboard, probe), 1000 + Math.random() * 2000));
      })
    )
    .subscribe();

  enterAction$
    .pipe(
      tap(async () => {
        await turnOffAllLED(switchboard);
        const currentProbe = appState$.value.probeNum;
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
      tap((num) => {
        stopAIAudio();
        if (num === 7) return;

        startAIAudio();

        if (phase$.value === "exploration") {
          const elements = sceneElements$.value;
          const targetElement = elements.find((e) => e.probeId === num);

          let updated = false;
          const newElements = elements.map((e) => {
            if (e.probeId === num) {
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

          if (!sceneObjects.value.includes(num)) {
            gmHint$.next(`Player investigated the wrong thing. Tell them there is nothing there.`);
          } else {
            const elementName = targetElement ? targetElement.name : `element (id=${explorationRound + num})`;
            gmHint$.next(
              `Player investigated ${elementName} in the scene. Name it and imply possible actions for the player. Player revisits the same id, be consistent with what you said before.`
            );
          }
        }
      })
    )
    .subscribe();
}
