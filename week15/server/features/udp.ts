import dgram from "dgram";
import { networkInterfaces } from "os";
import { Subject } from "rxjs";

export interface UDPMessage {
  data: Buffer;
  rinfo: dgram.RemoteInfo;
}

export type UDPHandler = (msg: UDPMessage) => void;

const udpSocket = dgram.createSocket("udp4");
const message$ = new Subject<UDPMessage>();

const MAX_UDP_PAYLOAD = 1400; // Safe size to avoid fragmentation
const SAMPLE_RATE = 24000;
const BYTES_PER_SAMPLE = 2; // 16-bit PCM
const BYTES_PER_SECOND = SAMPLE_RATE * BYTES_PER_SAMPLE;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export async function sendPcm16UDP(data: Buffer, address: string): Promise<void> {
  const [ip, port] = address.split(":");
  const portNum = parseInt(port);

  // Calculate delay per chunk based on audio duration
  const chunkDurationMs = (MAX_UDP_PAYLOAD / BYTES_PER_SECOND) * 1000;
  // Send slightly faster than realtime to keep buffer filled (80% of realtime)
  const delayMs = chunkDurationMs;

  // Split into chunks if data is too large
  for (let offset = 0; offset < data.length; offset += MAX_UDP_PAYLOAD) {
    const chunk = data.subarray(offset, offset + MAX_UDP_PAYLOAD);
    await new Promise<void>((resolve, reject) => {
      udpSocket.send(chunk, portNum, ip, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Throttle to prevent receiver buffer overflow
    if (offset + MAX_UDP_PAYLOAD < data.length) {
      await sleep(delayMs);
    }
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
