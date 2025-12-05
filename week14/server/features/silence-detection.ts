import { Subject } from "rxjs";
import { SILENCE_CHECK_INTERVAL_MS, SILENCE_TIMEOUT_MS } from "../config";

const STATE = {
  SILENT: "silent",
  SPEAKING: "speaking",
} as const;

type SpeechState = (typeof STATE)[keyof typeof STATE];

let currentState: SpeechState = STATE.SILENT;
let lastPacketTime: number | null = null;
let silenceCheckInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

const silenceSubject = new Subject<void>();
export const silence$ = silenceSubject.asObservable();

export function startSilenceDetection() {
  stopSilenceDetection();
  silenceCheckInterval = setInterval(detectSilence, SILENCE_CHECK_INTERVAL_MS);
}

export function stopSilenceDetection() {
  if (silenceCheckInterval) {
    clearInterval(silenceCheckInterval);
    silenceCheckInterval = null;
  }
}

export function recordAudioActivity() {
  beginSpeakingStateIfNeeded();
  lastPacketTime = Date.now();
}

export function setIsProcessing(value: boolean) {
  isProcessing = value;
}

export function resetSpeechState() {
  currentState = STATE.SILENT;
  lastPacketTime = null;
  isProcessing = false;
}

function detectSilence() {
  if (currentState === STATE.SPEAKING && lastPacketTime) {
    const timeSinceLastPacket = Date.now() - lastPacketTime;
    if (timeSinceLastPacket > SILENCE_TIMEOUT_MS) {
      transitionToSilentAndProcessAudio();
    }
  }
}

function beginSpeakingStateIfNeeded() {
  if (currentState !== STATE.SPEAKING) {
    currentState = STATE.SPEAKING;
  }
}

function transitionToSilentAndProcessAudio() {
  if (currentState !== STATE.SILENT) {
    currentState = STATE.SILENT;

    if (!isProcessing) {
      silenceSubject.next();
    }
  }
}
