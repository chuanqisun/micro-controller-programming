import dgram from "dgram";
import { networkInterfaces } from "os";
import { Subject } from "rxjs";
import { CHANNELS, SAMPLE_RATE } from "../config";

export interface UDPMessage {
  data: Buffer;
  rinfo: dgram.RemoteInfo;
}

export type UDPHandler = (msg: UDPMessage) => void;

// Chunk size for UDP packets (in bytes) - must be small enough for UDP
const UDP_CHUNK_SIZE = 1024;
// Interval between sending chunks (ms) - controls playback speed
const SEND_INTERVAL_MS = Math.floor((UDP_CHUNK_SIZE / (SAMPLE_RATE * CHANNELS * 2)) * 1000);

const udpSocket = dgram.createSocket("udp4");
const message$ = new Subject<UDPMessage>();

// Server-side buffer for streaming PCM data
let pcmBuffer: Buffer[] = [];
let isStreaming = false;
let currentStreamAddress: string | null = null;

export function createUDPServer(handlers: UDPHandler[], rxPort: number) {
  udpSocket.bind(rxPort);

  udpSocket.on("listening", () => {
    const address = udpSocket.address();
    console.log(`UDP server listening on port ${address.port}`);
  });

  udpSocket.on("message", (data: Buffer, rinfo: dgram.RemoteInfo) => {
    const msg: UDPMessage = { data, rinfo };
    message$.next(msg);
    for (const handler of handlers) {
      handler(msg);
    }
  });

  udpSocket.on("error", (err) => {
    console.error(`UDP server error:\n${err}`);
    udpSocket.close();
  });

  return udpSocket;
}

// Consolidated buffer to avoid frequent concat operations
let consolidatedBuffer = Buffer.alloc(0);

/**
 * Start the streaming loop that drains the buffer at a controlled rate
 * Sends exactly ONE chunk per interval to maintain proper playback timing
 */
function startStreamingLoop(address: string): void {
  if (isStreaming) return;

  isStreaming = true;
  currentStreamAddress = address;

  const [ip, port] = address.split(":");
  const portNum = parseInt(port);

  const sendNextChunk = () => {
    if (!isStreaming) return;

    // Consolidate any new buffered data
    if (pcmBuffer.length > 0) {
      consolidatedBuffer = Buffer.concat([consolidatedBuffer, ...pcmBuffer]);
      pcmBuffer = [];
    }

    // Send exactly ONE chunk per interval (matching play-file.ts behavior)
    if (consolidatedBuffer.length >= UDP_CHUNK_SIZE) {
      const chunk = consolidatedBuffer.subarray(0, UDP_CHUNK_SIZE);
      udpSocket.send(chunk, portNum, ip);
      // Keep the remainder
      consolidatedBuffer = consolidatedBuffer.subarray(UDP_CHUNK_SIZE);
    }

    setTimeout(sendNextChunk, SEND_INTERVAL_MS);
  };

  sendNextChunk();
}

/**
 * Stop the streaming loop
 */
export function stopPcmStream(): void {
  console.log("Stopping PCM stream");
  isStreaming = false;
  currentStreamAddress = null;
  pcmBuffer = [];
  consolidatedBuffer = Buffer.alloc(0);
}

/**
 * Queue PCM data to be streamed over UDP at a controlled rate
 */
export function sendPcm16UDP(data: Buffer, address: string): void {
  if (!address) return;

  // Add data to buffer
  pcmBuffer.push(data);
}

export function startPcmStream(address: string) {
  console.log(`Starting PCM stream to ${address}`);
  // Start streaming loop if not already running
  if (!isStreaming || currentStreamAddress !== address) {
    if (currentStreamAddress !== address) {
      stopPcmStream();
    }
    startStreamingLoop(address);
  }
}

export function getServerAddress(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]!) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return `${iface.address}:${udpSocket.address().port}`;
      }
    }
  }

  throw new Error("No external IPv4 address found");
}

export { message$ as udpMessage$ };
