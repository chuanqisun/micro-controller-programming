const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");

const app = express();
const PORT = 8000;

// Handle POST request to /upload
app.post("/upload", express.raw({ type: "*/*", limit: "10mb" }), (req, res) => {
  const boundary = req.headers["content-type"]?.match(/boundary=(.+)$/)?.[1];

  if (!boundary) {
    return res.status(400).json({ error: "No boundary in multipart data" });
  }

  // Extract JPEG data from multipart body
  const body = req.body.toString("binary");
  const parts = body.split("--" + boundary);

  let jpegBuffer = null;
  for (const part of parts) {
    if (part.includes("Content-Type: image/jpeg")) {
      const startMarker = "\r\n\r\n";
      const start = part.indexOf(startMarker) + startMarker.length;
      const end = part.lastIndexOf("\r\n");
      if (start > startMarker.length && end > start) {
        jpegBuffer = Buffer.from(part.substring(start, end), "binary");
        break;
      }
    }
  }

  if (!jpegBuffer) {
    return res.status(400).json({ error: "No image data found" });
  }

  const filePath = path.join(__dirname, "..", "image.jpeg");
  fs.writeFileSync(filePath, jpegBuffer);

  console.log("File uploaded successfully: image.jpeg");
  res.json({
    ok: true,
    message: "File uploaded successfully",
    filename: "image.jpeg",
  });
});

// Get local IP address
function getLocalIpAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

// Start server
app.listen(PORT, () => {
  const ipAddress = getLocalIpAddress();
  console.log(`Server running at http://${ipAddress}:${PORT}`);
  console.log(`Upload endpoint: http://${ipAddress}:${PORT}/upload`);
});
