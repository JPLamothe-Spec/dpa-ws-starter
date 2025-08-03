const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const { urlencoded } = require("body-parser");
require("dotenv").config();

const app = express();
app.use(urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// Twilio Webhook: returns TwiML with <Stream>
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

// WebSocket Server
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioWs) => {
  console.log("📞 Twilio call connected");

  const openaiWs = new WebSocket(`wss://api.openai.com/v1/assistants/asst_cxSP6hPSbkjKsM0wvz2D1o5x/rt`, {
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
        voice: "echo", // or "nova", "shimmer", etc.
        response_format: "audio/pcm",
        interruptible: true,
        transcribe: true,
      },
    };

    openaiWs.send(JSON.stringify(startPayload));
  });

  // Twilio → OpenAI
  twilioWs.on("message", (msg) => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.event === "media") {
        const audioBytes = Buffer.from(parsed.media.payload, "base64");
        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(audioBytes);
        }
      }
    } catch (err) {
      console.error("❌ Error parsing Twilio message:", err);
    }
  });

  // OpenAI → Twilio
  openaiWs.on("message", (data) => {
    if (typeof data === "string") {
      const parsed = JSON.parse(data);
      if (parsed.type === "error") {
        console.error("⚠️ OpenAI error:", parsed);
        return;
      }

      const base64Audio = Buffer.from(data).toString("base64");
      const twilioPayload = {
        event: "media",
        media: { payload: base64Audio },
      };

      if (twilioWs.readyState === WebSocket.OPEN) {
        twilioWs.send(JSON.stringify(twilioPayload));
      }
    }
  });

  // Cleanup
  const closeBoth = () => {
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
  };

  twilioWs.on("close", () => {
    console.log("📴 Twilio WebSocket closed");
    closeBoth();
  });

  openaiWs.on("close", () => {
    console.log("🧠 OpenAI WebSocket closed");
    closeBoth();
  });

  twilioWs.on("error", (err) => console.error("⚠️ Twilio WS error:", err));
  openaiWs.on("error", (err) => console.error("⚠️ OpenAI WS error:", err));
});

// Start Server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
