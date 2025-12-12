import { BehaviorSubject, filter, Subject, tap } from "rxjs";
import { BLEDevice } from "./ble";
import { sendAIText, startAIAudio, stopAIAudio } from "./gemini-live";
import type { Handler } from "./http";
import { operatorProbeNum$ } from "./operator";
import { appState$ } from "./state";
import { turnOffAllLED, turnOnLED } from "./switchboard";

export function handleNewGame(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/game/new") return false;

    // Start a new game session

    phase$.next("exploration");

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
    name: "start_action",
    description: "transition the game from exploration to action phase",
    parameters: {},
  },
  {
    name: "start_exploration",
    description: "transition the game from action to exploration phase",
    parameters: {},
  },
];

export type ToolHandler = (params?: Record<string, unknown>) => Promise<string>;

export const toolHandlers: Record<string, ToolHandler> = {
  start_action: async () => {
    phase$.next("action");
    return "Game phase changed to action. Wait for user to engage in the action scene. Don't say anything else.";
  },
  start_exploration: async () => {
    phase$.next("exploration");
    return "Game phase changed to exploration. Describe the new scene briefly and allow players to explore.";
  },
};

export function getDungeonMasterPrompt(): string {
  return `
# Role & Objective
You are an expert Dungeon Master for Dungeons & Dragons 5th Edition.

## Style
You only respond only in very short verbal utterance, typically just a few words to a half sentence. The minimalist leaves room fo players to imagine the scene.

## Hints
You will receive [GM HINT] messages that are only visit to you. You must follow the [GM HINT] instruction to master the game without revealing the hints to the players.

## Game format
Loop: player exploration -> Player action -> Repeat

## Tools
Follow the [GM HINT] to use the right tool at the right time. Do NOT use any tool unless instructed by the [GM HINT].
`;
}

export const gmHint$ = new Subject<string>();
export const phase$ = new BehaviorSubject<Phase>("idle");

export const sceneObjects = new BehaviorSubject<number[]>([]);

export const enterExploration$ = phase$.pipe(filter((phase) => phase === "exploration"));
export const enterAction$ = phase$.pipe(filter((phase) => phase === "action"));

let explorationRound = 0;

export function startGameLoop(switchboard: BLEDevice) {
  /** Game logic */
  gmHint$.pipe(tap((hint) => sendAIText(`[GM HINT] ${hint}`))).subscribe();

  enterExploration$
    .pipe(
      tap(async () => {
        gmHint$.next(
          "Describe the sentence in one short sentence. Allow the players to explore the details. When user decides to take an action, use start_action tool to transition into action phase."
        );
        explorationRound++;
        await turnOffAllLED(switchboard);
        const currentProbe = appState$.value.probeNum;
        const availableProbes = [0, 1, 2, 3, 4, 5, 6].filter((p) => p !== currentProbe);
        const threeRandomProbes = availableProbes.sort(() => 0.5 - Math.random()).slice(0, 3);
        sceneObjects.next(threeRandomProbes);
        threeRandomProbes.forEach((probe) => setTimeout(() => turnOnLED(switchboard, probe), 1000 + Math.random() * 2000));
      })
    )
    .subscribe();

  enterAction$
    .pipe(
      tap(async () => {
        await turnOffAllLED(switchboard);
        turnOnLED(switchboard, appState$.value.probeNum); // turn on center LED for action
      })
    )
    .subscribe();

  operatorProbeNum$
    .pipe(
      tap((num) => {
        if (num === 7) {
          stopAIAudio();
          return;
        }

        startAIAudio();

        if (phase$.value === "exploration") {
          if (!sceneObjects.value.includes(num)) {
            gmHint$.next(`Player investigated the wrong thing. Tell them there is nothing there.`);
          } else {
            gmHint$.next(
              `Player investigated element (id=${explorationRound + num}) in the scene. Use your imagination to describe the element. Be consistent if user investigated the same id again. It could an object, place, character, etc.`
            );
          }
        }

        if (phase$.value === "action") {
          if (num === 3) {
            gmHint$.next(
              `Player started the action. Wait for player to finish the action, then summarize the output. When players are done with the action, use start_exploration to start the next turn.`
            );
          } else {
            gmHint$.next(`Player tried to leave the action. Warn them to not leave the action until it's over.`);
          }
        }
      })
    )
    .subscribe();
}
