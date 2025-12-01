import { networkInterfaces } from "os";

let lastSenderIp = null;

export function getNetworkAddresses() {
  const interfaces = networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  return addresses;
}

export function getLocalNetworkIp() {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

export function getLastSenderIp() {
  return lastSenderIp;
}

export function setLastSenderIp(address) {
  lastSenderIp = address;
}
