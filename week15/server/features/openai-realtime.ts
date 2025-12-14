import OpenAI from "openai";
import { Subject } from "rxjs";
import { WebSocket } from "ws";
import { openaiTools, toolHandlers, type ToolHandler } from "./game";
import type { Handler } from "./http";
import { getDungeonMasterPrompt } from "./prompt";
import { updateState } from "./state";
import { withTimeout } from "./timeout";

let realtimeWs: WebSocket | null = null;
let sessionReady = false;

export const realtimeOutputAudio$ = new Subject<Buffer>();

export function handleConnectOpenAI(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/connect") return false;

    updateState((state) => ({ ...state, aiConnection: "busy" }));
    try {
      realtimeWs?.close();
      realtimeWs = await withTimeout(createRealtimeConnection(), 5000);
      updateState((state) => ({ ...state, aiConnection: "connected" }));
    } catch (error) {
      updateState((state) => ({ ...state, aiConnection: "disconnected" }));
    }

    res.writeHead(200);
    res.end();

    return true;
  };
}

export function handleDisconnectOpenAI(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/disconnect") return false;

    updateState((state) => ({ ...state, aiConnection: "busy" }));

    try {
      realtimeWs?.close();
      realtimeWs = null;
      sessionReady = false;
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

/**
 * POST /api/ai/send-text
 *
 * payload: { text: string }
 * */
export function handleSendTextOpenAI(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/ai/send-text") return false;

    const payloadText = await new Promise<string>((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed.text);
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", (err) => {
        reject(err);
      });
    });

    if (realtimeWs && sessionReady) {
      sendText(payloadText);
      triggerResponse();
      console.log(`📤 Sent text to AI: ${payloadText}`);
    } else {
      console.warn("⚠️ Cannot send text, AI session not ready");
    }

    res.writeHead(200);
    res.end();
    return true;
  };
}

export function triggerResponse() {
  if (!realtimeWs || realtimeWs.readyState !== WebSocket.OPEN) return;
  realtimeWs.send(JSON.stringify({ type: "response.create" }));
}

export function sendText(text: string) {
  if (!realtimeWs || realtimeWs.readyState !== WebSocket.OPEN || !sessionReady) return;
  const createItem = {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text,
        },
      ],
    },
  };

  realtimeWs.send(JSON.stringify(createItem));
}

export function createRealtimeConnection(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      reject(new Error("OPENAI_API_KEY not set in environment variables"));
      return;
    }

    const url = "wss://api.openai.com/v1/realtime?model=gpt-realtime";
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    ws.on("open", () => {
      console.log("✓ Connected to Realtime API");
    });

    ws.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString());

        switch (event.type) {
          case "session.created":
            console.log("✓ Session created");
            configureSession(ws);
            break;

          case "session.updated":
            console.log("✓ Session configured");
            sessionReady = true;
            resolve(ws);
            break;

          case "response.done":
            console.log("✓ Response complete");
            // Handle function calls from response.done
            handleFunctionCalls(event, ws);
            break;

          case "response.output_audio.delta":
            const audioChunk = Buffer.from(event.delta, "base64");
            realtimeOutputAudio$.next(audioChunk);
            break;

          case "response.function_call_arguments.delta":
            // Streaming function call arguments - can be used for progress UI
            break;

          case "error":
            console.error("❌ Realtime API error:", event.error);
            break;
        }
      } catch (error: any) {
        console.error("❌ Error parsing Realtime message:", error.message);
      }
    });

    ws.on("error", (error) => {
      console.error("❌ Realtime WebSocket error:", error.message);
      reject(error);
    });

    ws.on("close", () => {
      console.log("🔌 Realtime connection closed");
      sessionReady = false;
    });
  });
}
function configureSession(ws: WebSocket) {
  const sessionConfig = {
    type: "session.update",
    session: {
      type: "realtime",
      model: "gpt-realtime",
      output_modalities: ["audio"],
      instructions: `
${getDungeonMasterPrompt()},
      `,
      tools: openaiTools,
      tool_choice: "auto",
      audio: {
        input: {
          format: {
            type: "audio/pcm",
            rate: 24000,
          },
          turn_detection: null,
        },
      },
    },
  };

  ws.send(JSON.stringify(sessionConfig));
}

/**
 * Handle function calls from OpenAI Realtime API response.done event
 */
function handleFunctionCalls(event: any, ws: WebSocket) {
  const outputs = event.response?.output;
  if (!outputs || !Array.isArray(outputs)) return;

  for (const output of outputs) {
    if (output.type !== "function_call") continue;

    const functionName = output.name;
    const callId = output.call_id;
    let args: Record<string, unknown> = {};

    try {
      args = JSON.parse(output.arguments || "{}");
    } catch (e) {
      console.error(`Failed to parse function arguments for ${functionName}:`, e);
      continue;
    }

    const handler = toolHandlers[functionName] as ToolHandler | undefined;
    if (!handler) {
      console.warn(`⚠️ No handler for tool: ${functionName}`);
      sendFunctionCallResult(ws, callId, { error: `Unknown function: ${functionName}` });
      continue;
    }

    console.log(`🔧 Executing tool "${functionName}" with args:`, args);

    handler(args)
      .then((result) => {
        console.log(`✓ Tool "${functionName}" returned result:`, result);
        sendFunctionCallResult(ws, callId, { output: result });
      })
      .catch((error) => {
        console.error(`Error executing tool "${functionName}":`, error);
        sendFunctionCallResult(ws, callId, { error: `Tool execution failed: ${error.message}` });
      });
  }
}

/**
 * Send function call result back to OpenAI Realtime API and trigger a new response
 */
function sendFunctionCallResult(ws: WebSocket, callId: string, result: { output?: string; error?: string }) {
  if (ws.readyState !== WebSocket.OPEN) return;

  // Create conversation item with function call output
  const functionOutput = {
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: callId,
      output: JSON.stringify(result),
    },
  };

  ws.send(JSON.stringify(functionOutput));

  // Trigger a new response to continue the conversation
  ws.send(JSON.stringify({ type: "response.create" }));
}

const openai = new OpenAI();
openai.realtime;
