const WebSocket = require("ws");
const express = require("express");
const http = require("http");
const { urlencoded } = require("body-parser");
require("dotenv").config();

const app = express();
app.use(urlencoded({ extended: false }));

const PORT = process.env.PORT || 3000;

// Twilio webhook handler
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
        model: "gpt-4o-realtime-preview",
        voice: "coral", // updated voice
        response_format: "audio/pcm",
        i
