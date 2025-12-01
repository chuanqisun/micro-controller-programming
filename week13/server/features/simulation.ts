import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
import type { Handler } from "./http";
import { updateState } from "./state";
import { withTimeout } from "./timeout";

let currentSession: RealtimeSession | null = null;

export function handleConnectSession(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/connect") return false;

    updateState((state) => ({ ...state, aiConnection: "busy" }));
    try {
      currentSession?.close();
      currentSession = await withTimeout(createVoiceAgent(), 5000);
      updateState((state) => ({ ...state, aiConnection: "connected" }));
    } catch (error) {
      updateState((state) => ({ ...state, aiConnection: "disconnected" }));
    }

    res.writeHead(200);
    res.end();

    return true;
  };
}

export function handleDisconnectSession(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/disconnect") return false;

    updateState((state) => ({ ...state, aiConnection: "busy" }));

    try {
      currentSession?.close();
      currentSession = null;
    } catch (error) {
      console.error("Error stopping AI session:", error);
    } finally {
      updateState((state) => ({ ...state, aiConnection: "disconnected" }));
    }

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
