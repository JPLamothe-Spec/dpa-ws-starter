const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const { urlencoded } = require("body-parser");
require("dotenv").config();

const app = express();
app.use(urlencoded({ extended: false }));
const PORT = process.env.PORT || 3000;

// Twilio webhook returns TwiML with <Stream>
app.post("/twilio/voice", (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" />
      </Start>
      <Say voice="Polly.Joanna">
        Hi, this is Anna, JP's digital personal assistant. Would you like to leave a message?
      </Say>
    </Response>
  `;
  res.type("text/xml");
  res.send(twiml.trim());
});

// Start WebSocket server for audio stream
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioWs) => {
  console.log("📞 Twilio call connected");

  // Correct connection to Realtime API endpoint
  const openaiWs = new WebSocket("wss://api.openai.com/v1/assistants/rt", {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  openaiWs.on("open", () => {
    console.log("🧠 Connected to OpenAI Realtime API");

    const startPayload = {
      type: "session_start",
      config: {
        model: "gpt-4o",
        voice: "echo", // try "breeze", "nova", "shimmer"
        response_format: "audio/pcm",
        interruptible: true,
        transcribe: true,
      },
    };

    openaiWs.send(JSON.stringify(startPayload));
  });

  // Forward Twilio audio → OpenAI
  twilioWs.on("message", (msg) => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.event === "media") {
        const audio = Buffer.from(parsed.media.payload, "base64");
        if (openaiWs.readyState === WebSocket.OPEN) openaiWs.send(audio);
      }
    } catch (err) {
      console.error("❌ Twilio message parse error:", err);
    }
  });

  // Forward OpenAI audio → Twilio
  openaiWs.on("message", (data) => {
    const base64 = Buffer.from(data).toString("base64");
    const twPayload = { event: "media", media: { payload: base64 } };
    if (twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.send(JSON.stringify(twPayload));
    }
  });

  // Close connection cleanup
  const cleanup = () => {
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
  };
  twilioWs.on("close", () => { console.log("📴 Twilio WebSocket closed"); cleanup(); });
  openaiWs.on("close", () => { console.log("📴 OpenAI WebSocket closed"); cleanup(); });
  twilioWs.on("error", (err) => console.error("⚠️ Twilio WS error:", err));
  openaiWs.on("error", (err) => console.error("⚠️ OpenAI WS error:", err));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
