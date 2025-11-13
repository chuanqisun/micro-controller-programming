const dgram = require("dgram");

const server = dgram.createSocket({ type: "udp4", reuseAddr: true });

// Configuration to match Arduino sketch
const MULTICAST_IP = "224.0.0.251";
const MULTICAST_PORT = 41234;

server.on("error", (err) => {
  console.error(`Server error:\n${err.stack}`);
  server.close();
});

server.on("message", (msg, rinfo) => {
  console.log(`Received message: "${msg}" from ${rinfo.address}:${rinfo.port}`);
});

server.on("listening", () => {
  const address = server.address();
  console.log(`Server listening on ${address.address}:${address.port}`);

  // Join multicast group
  server.addMembership(MULTICAST_IP);
  console.log(`Joined multicast group ${MULTICAST_IP}`);
});

server.bind(MULTICAST_PORT);
