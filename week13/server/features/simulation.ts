import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";
// import { OpenAIRealtimeWebSocket } from "@openai/agents/realtime"

import type { Handler } from "./http";
import { updateState } from "./state";
import { withTimeout } from "./timeout";
import type { UDPHandler } from "./udp";

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

export function handleAudio(): UDPHandler {
  return (msg) => {
    const arrayBufferData = msg.data.buffer.slice(
      msg.data.byteOffset,
      msg.data.byteOffset + msg.data.byteLength,
    ) as ArrayBuffer;

    currentSession?.sendAudio(arrayBufferData);
  };
}

export function interrupt() {
  currentSession?.transport.interrupt();
}

export function triggerResponse() {
  currentSession?.transport.sendEvent({ type: "input_audio_buffer.commit" });
  currentSession?.transport.sendEvent({ type: "response.create" });
  currentSession?.transport.sendEvent({ type: "input_audio_buffer.clear" });
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

  await session.transport.updateSessionConfig({
    outputModalities: ["text"],
    audio: {
      input: {
        format: {
          type: "audio/pcm",
          rate: 24_000,
        },
        turnDetection: undefined,
      },
    },
  });

  session.transport.on("*", (event: any) => {
    switch (event.type) {
      case "response.output_text.done":
        console.log(`\n📝 Response text: "${event.text}"`);
        break;
    }
  });

  return session;
}

export interface EphmeralTokenConfig {
  apiKey: string;
  model: string;
  voice: string;
}
