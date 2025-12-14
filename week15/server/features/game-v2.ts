import { concatMap, filter, finalize, from, Subject, tap } from "rxjs";
import { Generation } from "./gemini-thread";
import { appState$ } from "./state";
import { streamOpenAISpeech } from "./tts";
import type { UDPHandler } from "./udp";

const threads = new Map<string, Generation>();
let aborts: (() => void)[] = [];

export const generated$ = new Subject<{ address: string; audioBuffer: Buffer }>();

export function handleUserAudioV2(): UDPHandler {
  return (msg) => {
    const buffer = msg.data;
    const address = appState$.getValue().operators.find((op) => op.address.startsWith(`${msg.rinfo.address}`))?.address;
    if (!address) {
      console.warn("Received audio for unknown operator:", msg.rinfo.address);
      return;
    }
    const currentGeneration = getOrCreateGeneration(address);
    currentGeneration.appendAudio(buffer);
  };
}

function getOrCreateGeneration(address: string): Generation {
  if (!threads.has(address)) {
    threads.set(address, new Generation());
  }
  return threads.get(address)!;
}

export function commitGeneration(address: string, options?: { saveAudio?: boolean }) {
  const currentGeneration = threads.get(address);
  if (!currentGeneration) {
    console.warn("No generation found to commit for", address);
    return;
  }

  const ac = new AbortController();
  const aborter = () => ac.abort();
  aborts.push(aborter);

  from(currentGeneration.run(options))
    .pipe(
      tap((text) => console.log("text generated:", text)),
      filter((output) => output !== null),
      concatMap((transcript) => streamOpenAISpeech(transcript)),
      tap((audioBuffer) => generated$.next({ address: address, audioBuffer })),
      finalize(() => (aborts = aborts.filter((a) => a !== aborter)))
    )
    .subscribe();
}
