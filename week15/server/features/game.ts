import { BehaviorSubject, filter, Subject } from "rxjs";
import type { Handler } from "./http";

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
