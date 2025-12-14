import { BehaviorSubject, Subject } from "rxjs";
import { AzureSpeechToText, transcriber } from "./azure-stt";
import type { BLEDevice } from "./ble";
import { DebugAudioBuffer } from "./debug-audio";
import { recordAudioActivity, startSilenceDetection } from "./silence-detection";
import { blinkOnLED, pulseOnLED } from "./switchboard";
import type { UDPHandler } from "./udp";

const debugBuffer = new DebugAudioBuffer(24000, 1, 16);

export interface VoiceModels {
  transcriber: AzureSpeechToText | null;
}
export const voiceModels: VoiceModels = {
  transcriber: null,
};

startSilenceDetection();

export function handleUserAudioV2(): UDPHandler {
  return async (msg) => {
    if (msg.data.length === 0) return;
    transcriber.append(msg.data);
    recordAudioActivity();
    debugBuffer.push(msg.data);
  };
}

export function saveDebugBuffer() {
  debugBuffer.saveAsWav(`${Date.now()}.wav`);
  debugBuffer.clear();
}

export const userMessage$ = new Subject<{ address: string; message: string }>();

// OpenAI Realtime API compatible tool definitions
export interface OpenAITool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const openaiTools: OpenAITool[] = [
  {
    type: "function",
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

export function setSwitchboardForToolsV2(switchboard: BLEDevice) {
  _switchboard = switchboard;
}

export interface LedState {
  id: number;
  status: "off" | "pulsing" | "blinking";
}

export const ledStateV2$ = new BehaviorSubject<LedState[]>(
  [0, 1, 2, 3, 4, 5, 6].map((id) => ({ id, status: "off" as const }))
);

export const openaiToolHandlers: Record<string, ToolHandler> = {
  update_leds: async (params) => {
    console.log(`Update LED called with params:`, params);

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
    ledStateV2$.next(newState);

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
