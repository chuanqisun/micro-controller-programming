import { Subject } from "rxjs";
import { AzureSpeechToText, transcriber } from "./azure-stt";
import { DebugAudioBuffer } from "./debug-audio";
import { recordAudioActivity, startSilenceDetection } from "./silence-detection";
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

export function startGame() {}

export const userMessage$ = new Subject<{ address: string; message: string }>();
