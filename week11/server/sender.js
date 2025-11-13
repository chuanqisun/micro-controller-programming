const dgram = require("dgram");

const client = dgram.createSocket("udp4");

// Configuration
const TARGET_IP = "192.168.41.141"; // Change this to your target IP
const TARGET_PORT = 5005;
const MESSAGE = "hello world";

// Listen for responses
client.on("message", (msg, rinfo) => {
  console.log(`Received: ${msg} from ${rinfo.address}:${rinfo.port}`);
});

// Bind the client to allow receiving messages
client.bind(0, () => {
  console.log(`Client bound to ${client.address().address}:${client.address().port}`);
});

// Send message every second
setInterval(() => {
  client.send(MESSAGE, TARGET_PORT, TARGET_IP, (err) => {
    // if (err) {
    //   console.error("Error sending message:", err);
    // } else {
    //   console.log(`Sent "${MESSAGE}" to ${TARGET_IP}:${TARGET_PORT}`);
    // }
  });
}, 1000);
