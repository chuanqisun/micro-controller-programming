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

export function sendUDP(data: Buffer, port: number, address: string): Promise<void> {
  return new Promise((resolve, reject) => {
    udpSocket.send(data, port, address, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
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
