import http from "http";
import { WebSocketServer } from "ws";
import { URL } from "url";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
  res.end("ok\nWebSocket: /ws?room=ROOM&role=client|esp\n");
});

const wss = new WebSocketServer({ noServer: true });

// room -> { clients:Set, publishers:Set, lastMsg:string }
const rooms = new Map();
const getRoom = (id) => {
  if (!rooms.has(id)) rooms.set(id, { clients: new Set(), publishers: new Set(), lastMsg: "" });
  return rooms.get(id);
};
const safe = (s) => (s || "default").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "default";

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname !== "/ws") return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, url));
});

wss.on("connection", (ws, url) => {
  const roomId = safe(url.searchParams.get("room"));
  const role = (url.searchParams.get("role") || "client").toLowerCase();
  const room = getRoom(roomId);

  if (role === "esp") room.publishers.add(ws);
  else room.clients.add(ws);

  if (role !== "esp" && room.lastMsg) ws.send(room.lastMsg);

  ws.on("message", (data) => {
    if (role !== "esp") return;           // only ESP can publish
    const msg = data.toString();
    room.lastMsg = msg;
    for (const c of room.clients) if (c.readyState === 1) c.send(msg);
  });

  ws.on("close", () => {
    room.clients.delete(ws);
    room.publishers.delete(ws);
    if (room.clients.size === 0 && room.publishers.size === 0) rooms.delete(roomId);
  });
});

// keepalive
setInterval(() => {
  for (const ws of wss.clients) {
    try { ws.ping(); } catch {}
  }
}, 30000);

server.listen(process.env.PORT || 8080, () => console.log("relay up"));
