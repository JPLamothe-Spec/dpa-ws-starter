// index.js

const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const urlencoded = require("body-parser");
require("dotenv").config();

const app = express();
app.use(urlencoded.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// ✅ Twilio webhook route with hit log
app.post("/twilio/voice", (req, res) => {
  console.log("🎯 Twilio webhook hit");

  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" track="inbound_track" />
      </Start>
    </Response>
  `;
  res.type("text/xml");
  res.send(twiml.trim());
});

// ✅ Create HTTP server
const server = http.createServer(app);

// ✅ Create WebSocket server (manual upgrade)
const wss = new WebSocket.Server({ noServer: true });

// ✅ Log WebSocket upgrade attempts
server.on("upgrade", (request, socket, head) => {
  console.log("🛠 WebSocket upgrade attempt:", request.url);

  if (request.url === "/media-stream") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ✅ WebSocket connection logic (basic)
wss.on("connection", (ws, request) => {
  console.log("🧩 WebSocket connection established");

  ws.on("message", (message) => {
    console.log("🎧 Received message from Twilio:", message.toString());
    // You’ll stream to OpenAI here in the next step
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket connection closed");
  });

  ws.on("error", (err) => {
    console.error("❌ WebSocket error:", err);
  });
});

// ✅ Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
