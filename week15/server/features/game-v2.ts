import { AzureSpeechToText, transcriber } from "./azure-stt";
import type { UDPHandler } from "./udp";

export interface VoiceModels {
  transcriber: AzureSpeechToText | null;
}
export const voiceModels: VoiceModels = {
  transcriber: null,
};

export function handleUserAudioV2(): UDPHandler {
  return async (msg) => {
    if (msg.data.length === 0) return;
    transcriber.append(Buffer.from(msg.data));
  };
}
