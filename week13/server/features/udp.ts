import dgram from "dgram";
import { LAPTOP_UDP_RX_PORT } from "../config";

const udpReceiver = dgram.createSocket("udp4");
const udpSender = dgram.createSocket("udp4");

export function setupUDPReceiver() {
  udpReceiver.bind(LAPTOP_UDP_RX_PORT);
  udpReceiver.on("listening", handleReceiverListening);
  udpReceiver.on("message", handleIncomingAudioPacket);
  udpReceiver.on("error", handleReceiverError);
}

function handleReceiverListening() {}

function handleReceiverError(err: any) {
  console.error(`UDP receiver error:\n${err}`);
  udpReceiver.close();
}

function handleIncomingAudioPacket(msg: any, rinfo: any) {}
