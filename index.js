const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const { urlencoded } = require("body-parser");
require("dotenv").config();

const app = express();
app.use(urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// ✅ Webhook endpoint for Twilio
app.post("/twilio/voice", (req, res) => {
  const twiml = `
    <Response>
      <Start>
        <Stream url="wss://${req.headers.host}/media-stream" />
      </Start>
    </Response>
  `;
  res.type("text/xml");
  res.send(twiml.trim());
});

// ✅ WebSocket for audio stream
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioWs) => {
  console.log("📞 Twilio call connected");

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
        voice: "echo", // or "breeze", "nova", "shimmer", "fable", "onyx"
        response_format: "audio/pcm",
        interruptible: true,
        transcribe: true,
      },
    };

    openaiWs.send(JSON.stringify(startPayload));
  });

  // 🔄 Twilio → OpenAI
  twilioWs.on("message", (msg) => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.event === "media") {
        const audio = Buffer.from(parsed.media.payload, "base64");
        if (openaiWs.readyState === WebSocket.OPEN) openaiWs.send(audio);
      }
    } catch (err) {
      console.error("❌ Error parsing Twilio message:", err);
    }
  });

  // 🔄 OpenAI → Twilio
  openaiWs.on("message", (data) => {
    const base64 = Buffer.from(data).toString("base64");
    const twPayload = {
      event: "media",
      media: { payload: base64 },
    };

    if (twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.send(JSON.stringify(twPayload));
    }
  });

  // 🔌 Cleanup
  const closeAll = () => {
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
  };

  twilioWs.on("close", () => {
    console.log("📴 Twilio WebSocket closed");
    closeAll();
  });

  openaiWs.on("close", () => {
    console.log("📴 OpenAI WebSocket closed");
    closeAll();
  });

  twilioWs.on("error", (err) => console.error("⚠️ Twilio WS error:", err));
  openaiWs.on("error", (err) => console.error("⚠️ OpenAI WS error:", err));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
