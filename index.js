const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const urlencoded = require("body-parser");
require("dotenv").config();

const app = express();
app.use(urlencoded.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

//
// ✅ Block 1: Twilio Webhook endpoint
//
app.post("/twilio/voice", (req, res) => {
  const twiml = `
  <Response>
    <Say voice="Polly.Joanna">Hi, this is Anna, JP’s assistant. Please hold while I connect you.</Say>
    <Start>
      <Stream url="wss://${req.headers.host}/media-stream" />
    </Start>
  </Response>
`;

  res.type("text/xml");
  res.send(twiml.trim());
});

//
// ✅ Block 2: WebSocket server (Twilio Media Streams)
//
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/media-stream" });

wss.on("connection", (twilioWs) => {
  console.log("📞 Twilio call connected");

  //
  // ✅ Block 3: OpenAI Realtime WebSocket connection
  //
  const openaiWsUrl = 'wss://api.openai.com/v1/assistants/asst_cxS9PhP5bkjKsM0wzv2D1o5x/rt';
  const openaiWs = new WebSocket(openaiWsUrl, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  openaiWs.on("open", () => {
    console.log("✅ Connected to OpenAI Realtime API");

    const startPayload = {
      type: "session_start",
      config: {
        model: "gpt-4o",
        voice: "echo", // or "nova", "shimmer", "fable", "onyx", etc
        response_format: "audio/pcm",
        interruptible: true,
        transcribe: true,
      },
    };

    openaiWs.send(JSON.stringify(startPayload));
  });

  openaiWs.on("message", (data) => {
    console.log("📥 OpenAI message:", data.toString());

    const base64 = Buffer.from(data).toString("base64");
    const twilioPayload = {
      event: "media",
      media: {
        payload: base64,
      },
    };

    if (twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.send(JSON.stringify(twilioPayload));
    }
  });

  openaiWs.on("error", (err) => {
    console.error("❌ OpenAI WS error:", err);
  });

  openaiWs.on("close", (code, reason) => {
    console.warn(`🔌 OpenAI WS closed | Code: ${code} | Reason: ${reason}`);
    closeAll();
  });

  //
  // 🔁 Stream Twilio → OpenAI
  //
  twilioWs.on("message", (msg) => {
    try {
      const parsed = JSON.parse(msg);
      if (parsed.event === "media") {
        const audio = Buffer.from(parsed.media.payload, "base64");
        if (openaiWs.readyState === WebSocket.OPEN) {
          openaiWs.send(audio);
        }
      }
    } catch (err) {
      console.error("❌ Error parsing Twilio message:", err);
    }
  });

  twilioWs.on("close", () => {
    console.log("🔌 Twilio WebSocket closed");
    closeAll();
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Twilio WS error:", err);
  });

  //
  // 🔒 Cleanup
  //
  const closeAll = () => {
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
  };
});

//
// ✅ Server Start
//
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
