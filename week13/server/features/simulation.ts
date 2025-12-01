import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import type { Handler } from "./http";

let currentSession: RealtimeSession | null = null;

export function handleStartSession(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/start") return false;

    currentSession?.close();
    currentSession = await createVoiceAgent();

    res.writeHead(200);
    res.end();

    return true;
  };
}

export function handleStopSession(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/stop") return false;

    currentSession?.close();
    currentSession = null;

    res.writeHead(200);
    res.end();

    return true;
  };
}

export async function createVoiceAgent() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set in environment variables");

  const agent = new RealtimeAgent({
    name: "Assistant",
    instructions: "You are a helpful assistant.",
  });

  const session = new RealtimeSession(agent, {
    model: "gpt-realtime-mini",
  });

  await session.connect({ apiKey });
  console.log(`[AI] connected`);

  return session;
}

export interface EphmeralTokenConfig {
  apiKey: string;
  model: string;
  voice: string;
}
