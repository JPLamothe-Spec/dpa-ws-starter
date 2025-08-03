// index.js

const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const urlencoded = require("body-parser");
require("dotenv").config();

const app = express();
app.use(urlencoded.urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// ✅ Block 1: Twilio webhook
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

// ✅ Create HTTP server
const server = http.createServer(app);

// ✅ Manually bind WebSocket upgrade
const wss = new WebSocket.Server({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/media-stream") {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ✅ Global
let streamSid = null;

// ✅ Twilio WS incoming
wss.on("connection", (twilioWs) => {
  console.log("📞 Twilio call connected");

  // ✅ OpenAI WS
  const openaiWsUrl = `wss://api.openai.com/v1/assistants/${process.env.OPENAI_ASSISTANT_ID}/rt`;
  console.log("🔍 Assistant ID:", process.env.OPENAI_ASSISTANT_ID);
  console.log("🔍 API Key starts with:", process.env.OPENAI_API_KEY?.slice(0, 6));

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
        voice: "echo",
        response_format: "audio/pcm",
        interruptible: true,
        transcribe: true,
      },
    };

    openaiWs.send(JSON.stringify(startPayload));
  });

  // 🧠 OpenAI → Twilio
  openaiWs.on("message", (data) => {
    console.log("📤 OpenAI message:", data.toString());
    const base64 = Buffer.from(data).toString("base64");

    const twilioPayload = {
      event: "media",
      media: { payload: base64 },
    };

    if (twilioWs.readyState === WebSocket.OPEN) {
      twilioWs.send(JSON.stringify(twilioPayload));

      // ✅ Send "mark" to confirm
      const markPayload = {
        event: "mark",
        streamSid,
        mark: { name: "openai_audio_chunk" },
      };
      twilioWs.send(JSON.stringify(markPayload));
    }
  });

  // 🧠 Twilio → OpenAI
  twilioWs.on("message", (msg) => {
    try {
      const parsed = JSON.parse(msg);

      if (parsed.event === "start") {
        streamSid = parsed.start?.streamSid;
        console.log("📍 Captured streamSid:", streamSid);
      }

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

  // Error and cleanup handlers
  openaiWs.on("error", (err) => {
    console.error("❌ OpenAI WS error:", err);
  });

  twilioWs.on("error", (err) => {
    console.error("❌ Twilio WS error:", err);
  });

  openaiWs.on("close", (code, reason) => {
    console.warn(`📉 OpenAI WS closed | Code: ${code} | Reason: ${reason}`);
    closeAll();
  });

  twilioWs.on("close", () => {
    console.log("📉 Twilio WebSocket closed");
    closeAll();
  });

  function closeAll() {
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close();
    if (openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
  }
});

// ✅ Start server
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
