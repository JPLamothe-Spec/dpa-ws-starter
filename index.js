const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer();

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  console.log("✅ Client connected:", req.socket.remoteAddress);

  ws.on("message", (message) => {
    console.log("📨 Received message:", message.length, "bytes");
  });

  ws.on("close", () => {
    fetch("https://hook.eu2.make.com/d03awrvfm3n5zuzykja2zcv5f75vkusqc", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        status: "call_ended",
        timestamp: new Date().toISOString()
      })
    })
    .then(res => console.log("✅ Webhook sent to Make:", res.status))
    .catch(err => console.error("❌ Webhook error:", err));

    console.log("❌ Client disconnected");
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
  });
});

server.listen(PORT, () => {
  console.log(`🔈 WebSocket server listening on port ${PORT}`);
});
