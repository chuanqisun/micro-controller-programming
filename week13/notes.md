- Revived walkie-talkie code from week 9. Without any UI
- Problem 1: IP discovery.
  - Laptop has hard coded IP address for ESP32
    - Solved by inspecting the `rinfo.address` of incoming UDP packets

```js
import * as dgram from "dgram";

const udpReceiver = dgram.createSocket("udp4");

udpReceiver.bind(8888);

udpReceiver.on("message", (msg, rinfo) => {
  // rinfo contains sender information
  const senderIp = rinfo.address; // Get sender's IP address
  const senderPort = rinfo.port; // Get sender's port

  console.log(`Received from ${senderIp}:${senderPort}`);
  console.log(`Data: ${msg.toString()}`);
});
```

- ESP32 has hard coded IP address for laptop
  - We are able to get laptop's IP address using OS network interface API within node.js
  - Let's build a web UI that allows the user to push the laptop IP address into ESP32

Server

```js
import * as os from "os";
import express from "express";

const app = express();

app.get("/api/origin", (req, res) => {
  const interfaces = os.networkInterfaces();
  const ipv4 = Object.values(interfaces)
    .flat()
    .find((addr) => addr.family === "IPv4" && !addr.internal);

  res.json({ host: ipv4?.address || "localhost" });
});

app.listen(3000);
```

Web UI

```ts
const ipInput = document.getElementById("ipInput") as HTMLInputElement;
const fetchButton = document.getElementById("fetchButton") as HTMLButtonElement;

fetchButton.addEventListener("click", async () => {
  try {
    const response = await fetch("http://localhost:3000/api/origin");
    const data = await response.json();
    ipInput.value = data.host;
  } catch (error) {
    console.error("Failed to fetch origin:", error);
    ipInput.value = "Error fetching origin";
  }
});
```

- Updated solution, an automatd protocol to exchange ip between server and operator
  - A single round of handshake
    - Web -> Server: request server address
    - Server -> Web: send self address
    - Web -> Operator: send server address
    - Operator -> Web: send self address
    - Web -> Server: send operator address
- See screenshot v2

web

```js
// Fetch server IP on page load
const response = await fetch("http://localhost:3000/api/origin");
const data = await response.json();
serverAddressSpan.textContent = data.host;

// After Operator BLE connects, send server address
const message = `server:${url.hostname}:${url.port}`;
sendMessage(message);

// Receive operator address from device
if (message.startsWith("operator:")) {
  const address = message.substring(9);
  operatorAddressSpan.textContent = address;
  fetch(`http://localhost:3000/api/locate-operator?address=${encodeURIComponent(address)}`, {
    method: "POST",
  });
}
```

operator

```cpp
// Receive server address from web
void handleRxMessage(String msg) {
  if (msg.startsWith("server:")) {
    String serverIp = msg.substring(7, msg.lastIndexOf(':'));
    int port = msg.substring(msg.lastIndexOf(':') + 1).toInt();
    // Store and use for UDP
    setupUDP(serverIp.c_str(), port);
  }
}

// Send operator address to web for registration
void sendOperatorAddress() {
  String myIP = WiFi.localIP().toString();
  sendBLE("operator:" + myIP);
}
```

- Added Switchboard UI
  - Basic connection testing features from Networking week
  - See screenshot v3

- Trigger speak from web UI
  - We want the web UI to have the latest speech content
  - Added SSE endpoint on node.js server, so we can push speech content to web with minimum latency
  - Added new endpoints to hande speech content from the web UI

```js
// Server: SSE endpoint for pushing events to web
if (req.url === "/api/events") {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  sseClients.push({ res });
  req.on("close", () => {
    sseClients = sseClients.filter((c) => c.res !== res);
  });
}

// Server: /api/speak endpoint - triggers speech synthesis
else if (req.url === "/api/speak") {
  const { text, voice } = JSON.parse(body);
  await synthesizeAndStreamSpeech(text, voice);
  emitServerEvent(text); // Push to SSE clients
}

// Web: Listen to SSE stream
const eventSource = new EventSource("http://localhost:3000/api/events");
eventSource.onmessage = (event) => {
  logDiv.textContent += `[${timestamp}] SSE: ${event.data}\n`;
};

// Web: Trigger speak from UI
speakBtn.addEventListener("click", async () => {
  const text = speakTextarea.value.trim();
  const response = await fetch("http://localhost:3000/api/speak", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
});
```

- See screenshot v4

- Dealing with complexity, refactored the BLE communication to live within server code, rather than web UI
- The full server code becomes modular and easier to manage

```ts
import { map, tap } from "rxjs";
import { HTTP_PORT, LAPTOP_UDP_RX_PORT } from "./config";
import { BLEDevice, opMac, swMac } from "./features/ble";
import { createButtonStateMachine } from "./features/buttons";
import {
  geminiResponse$,
  geminiTranscript$,
  handleConnectGemini,
  handleDisconnectGemini,
} from "./features/gemini-live";
import { createHttpServer } from "./features/http";
import {
  handleButtonsMessage,
  handleConnectOperator,
  handleDisconnectOperator,
  handleOpAddressMessage,
  handleProbeMessage,
  handleRequestOperatorAddress,
  logOperatorMessage,
  operatorAddress$,
  operatorButtons$,
  operatorProbeNum$,
} from "./features/operator";
import { silence$ } from "./features/silence-detection";
import {
  handleAudio,
  handleConnectSession,
  handleDisconnectSession,
  interrupt,
  triggerResponse,
} from "./features/simulation";
import { broadcast, handleSSE, newSseClient$ } from "./features/sse";
import { appState$, updateState } from "./features/state";
import { handleBlinkLED, handleConnectSwitchboard, handleDisconnectSwitchboard } from "./features/switchboard";
import { createUDPServer } from "./features/udp";

async function main() {
  const operator = new BLEDevice(opMac);
  const switchboard = new BLEDevice(swMac);

  createUDPServer([handleAudio()], LAPTOP_UDP_RX_PORT);

  createHttpServer(
    [
      handleSSE(),
      handleBlinkLED(switchboard),
      handleConnectSwitchboard(switchboard),
      handleDisconnectSwitchboard(switchboard),
      handleConnectOperator(operator),
      handleDisconnectOperator(operator),
      handleRequestOperatorAddress(operator),
      handleConnectSession(),
      handleDisconnectSession(),
      handleConnectGemini(),
      handleDisconnectGemini(),
    ],
    HTTP_PORT,
  );

  appState$
    .pipe(
      map((state) => ({ state })),
      tap(broadcast),
    )
    .subscribe();

  newSseClient$.pipe(tap(() => broadcast({ state: appState$.value }))).subscribe();

  operator.message$
    .pipe(
      tap(logOperatorMessage),
      tap(handleProbeMessage()),
      tap(handleOpAddressMessage()),
      tap(handleButtonsMessage()),
    )
    .subscribe();
  operatorProbeNum$.pipe(tap((num) => updateState((state) => ({ ...state, probeNum: num })))).subscribe();
  operatorAddress$.pipe(tap((address) => updateState((state) => ({ ...state, opAddress: address })))).subscribe();
  operatorButtons$
    .pipe(tap((buttons) => updateState((state) => ({ ...state, btn1: buttons.btn1, btn2: buttons.btn2 }))))
    .subscribe();

  const operataorButtons = createButtonStateMachine(operatorButtons$);

  operataorButtons.leaveIdle$.pipe(tap(interrupt)).subscribe();
  silence$.pipe(tap(triggerResponse)).subscribe();

  // Gemini Live API subscriptions
  geminiTranscript$.pipe(tap((text) => console.log(`🎤 Transcript: ${text}`))).subscribe();
  geminiResponse$.pipe(tap((text) => console.log(`🤖 Gemini: ${text}`))).subscribe();
}

main();
```

Meanwhile, also modularized web ui code

```ts
import { tap } from "rxjs";
import { appendDiagnosticsError, updateDiagnosticsState } from "./features/diagnostics";
import { initOperatorUI, updateOperatorUI } from "./features/operator";
import { initSimulationUI, updateSimulationUI } from "./features/simulation";
import { createSSEObservable } from "./features/sse";
import { state$, stateChange$ } from "./features/state";
import { initSwitchboardUI, updateSwitchboardUI } from "./features/switchboard";
import "./style.css";

initSwitchboardUI();
initOperatorUI();
initSimulationUI();

state$.pipe(tap(updateDiagnosticsState)).subscribe();

stateChange$.pipe(tap(updateSwitchboardUI), tap(updateOperatorUI), tap(updateSimulationUI)).subscribe();

export const sseEvents$ = createSSEObservable("http://localhost:3000/api/events");

sseEvents$.subscribe({
  next: (message) => {
    if (message.state) {
      state$.next(message.state);
    }
  },
  error: (error) => {
    appendDiagnosticsError(error);
  },
});
```

- See screenshot v5

- Final version
  - Audio input and output devices both start to behave erratically
    - Microphone randomly picks up high noice
    - Speaker unstable contact, barely works
  - Supply side time management: no time left to address the flaky audio issues
  - Pivot, let's still use the Operator's probe, and Switchboard's LED, but rely computer's speaker to make an audio version of the text adventure game.
- Thanks to my modular refactor, this was achieved relatively quickly

Key logic in the server main code:

```ts
textGenerated$.pipe(concatMap((index) => turnOnLED(switchboard, index))).subscribe();
operatorProbeNum$
  .pipe(
    filter((num) => num !== 7),
    tap((index) => previewOption(index)),
  )
  .subscribe();
operatorProbeNum$
  .pipe(
    filter((num) => num === 7),
    tap(cancelAllSpeakerPlayback),
  )
  .subscribe();

operataorButtons.someButtonDown$
  .pipe(
    withLatestFrom(operatorProbeNum$),
    tap(cancelAllSpeakerPlayback),
    tap(() => turnOffAllLED(switchboard)),
    tap(([_, index]) => commitOption(index)),
  )
  .subscribe();
```

Added game logic module:

```ts
import { GoogleGenAI } from "@google/genai";
import { JSONParser } from "@streamparser/json";
import { BehaviorSubject, Subject } from "rxjs";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Handler } from "./http";
import { cancelAllSpeakerPlayback, playPcm16Buffer } from "./speaker";
import { appState$, updateState } from "./state";
import { GenerateOpenAISpeech } from "./tts";

const storyOptionsSchema = z.object({
  storyOptions: z.array(z.string().describe("A story beginning for a text adventure game.")),
});
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export const textGenerated$ = new Subject<number>();
export const assignments$ = new BehaviorSubject<
  { index: number; text: string | null; audioBuffer: Promise<Buffer> | null }[]
>([]);

let ongoingTasks = [] as AbortController[];

export async function previewOption(id: number) {
  const assignment = assignments$.value.find((a) => a.index === id);
  if (!assignment || assignment.text === null || assignment.audioBuffer === null) {
    console.error("Assignment not found or not ready");
    return;
  }

  cancelAllSpeakerPlayback();
  playPcm16Buffer(await assignment.audioBuffer);
}

export async function commitOption(id: number) {
  const assignment = assignments$.value.find((a) => a.index === id);
  if (!assignment || assignment.text === null) {
    console.error("Assignment not found or not ready");
    return;
  }

  killAllTasks();
  cancelAllSpeakerPlayback();

  // Commit the option to the story history
  updateState((state) => ({
    ...state,
    storyHistory: [...state.storyHistory, assignment.text!],
  }));

  // reset assignment slots
  assignments$.next(assignments$.value.map((a) => ({ ...a, text: null, audioBuffer: null })));

  const ac = new AbortController();
  ongoingTasks.push(ac);
  try {
    await generateOptionsInternal(ac, id);
  } finally {
    ongoingTasks = ongoingTasks.filter((task) => task !== ac);
  }
}

export function handleStartTextAdventures(): Handler {
  return async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/adventure/start") return false;

    killAllTasks();
    cancelAllSpeakerPlayback();
    assignments$.next([0, 1, 2, 3, 4, 5, 6].map((i) => ({ index: i, text: null, audioBuffer: null })));
    updateState((state) => ({ ...state, storyHistory: [] }));

    const ac = new AbortController();
    ongoingTasks.push(ac);

    try {
      await generateOptionsInternal(ac);
      res.writeHead(200);
      res.end();
    } finally {
      ongoingTasks = ongoingTasks.filter((task) => task !== ac);
    }

    return true;
  };
}

async function generateOptionsInternal(ac: AbortController, escapeIndex?: number) {
  const parser = new JSONParser();

  parser.onValue = (entry) => {
    if (typeof entry.key === "number" && typeof entry.value === "string") {
      console.log("Story option:", entry.value);

      const randomIndex = random(
        new Set(assignments$.value.filter((a) => a.text === null && a.index !== escapeIndex).map((a) => a.index)),
      );
      if (randomIndex === null) {
        console.log("No available assignment slots, skip");
        return;
      }

      textGenerated$.next(randomIndex);
      assignments$.next(
        assignments$.value.map((a) =>
          a.index === randomIndex
            ? {
                ...a,
                text: entry.value as string,
                audioBuffer: GenerateOpenAISpeech(entry.value as string, ac.signal),
                visited: false,
              }
            : a,
        ),
      );
    }
  };

  const response = await ai.models.generateContentStream({
    model: "gemini-2.5-flash",
    contents: appState$.value.storyHistory.length
      ? `Based on the following story so far, generate 3 different story continuations for a text adventure game. Each option should be a one short verbal sentence with only a few words.

Story so far:
${appState$.value.storyHistory.join("\n")}
          `.trim()
      : `Generate 3 different story beginnings for a text adventure game. Each option should be a one short verbal sentence with only a few words.`.trim(),
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: zodToJsonSchema(storyOptionsSchema as any),
      abortSignal: ac.signal,
    },
  });

  for await (const chunk of response) {
    const maybeOutput = chunk.candidates?.at(0)?.content?.parts?.at(0)?.text;
    if (!maybeOutput) continue;
    parser.write(maybeOutput);
  }
}

function killAllTasks() {
  ongoingTasks.forEach((ac) => ac.abort());
  ongoingTasks = [];
}

function random(set: Set<number>): number | null {
  if (set.size === 0) return null;
  const items = Array.from(set);
  return items[Math.floor(Math.random() * items.length)];
}
```

## Appendix
