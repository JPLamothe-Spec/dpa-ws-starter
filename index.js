const WebSocket = require("ws");
const http = require("http");

const PORT = process.env.PORT || 3000;

const server = http.createServer();

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws, req) => {
  console.log("🔌 Client connected:", req.socket.remoteAddress);

  ws.on("message", (message) => {
    console.log("📥 Received message:", message.length, "bytes");
  });

  ws.on("close", () => {
    console.log("❌ Client disconnected");
  });

  ws.on("error", (err) => {
    console.error("⚠️ WebSocket error:", err);
  });
});

server.listen(PORT, () => {
  console.log(`✅ WebSocket server listening on port ${PORT}`);
});
