const WebSocket = require("ws");
const http = require("http");
const express = require("express");
const { urlencoded } = require("body-parser");
const twilio = require("twilio");
const fetch = require("node-fetch");

const PORT = process.env.PORT || 3000;
const app = express();
app.use(urlencoded({ extended: false }));

// Twilio webhook: returns TwiML to start ConversationRelay
app.post("/twilio/voice", (req, res) => {
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.start().stream({
    url: "wss://voice-dpa-service.onrender.com/media-stream",
  });

  twiml.say(
    { voice: "Polly.Joanna" },
    "Hi, this is Anna, JP's digital personal assistant. Would you like me to pass on a message?"
  );

  res.type("text/xml");
  res.send(twiml.toString());
});

// Create the HTTP server
const server = http.createServer(app);

// Attach WebSocket to the same server
const wss = new WebSocket.Server({ server });

// Handle WebSocket connections
wss.on("connection", (ws, req) => {
  console.log("🔌 Client connected:", req.socket.remoteAddress);

  ws.on("message", (message) => {
    console.log("📥 Received message:", message.length, "bytes");
    // TODO: Decode and stream to Whisper + GPT pipeline
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
    fetch("https://hook.eu2.make.com/d03awrvfm3n5uzykja2zcvsf75vkusqc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "call_ended",
        timestamp: new Date().toISOString(),
      }),
    })
      .then((res) => console.log("✅ Webhook sent to Make:", res.status))
      .catch((err) => console.error("❌ Webhook error:", err));
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket server error:", err);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`🚀 WebSocket + HTTP server listening on port ${PORT}`);
});
