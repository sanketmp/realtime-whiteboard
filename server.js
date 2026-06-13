const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

const CURSOR_COLORS = [
  "#e05252", "#4e9af1", "#26a69a", "#f4a261", "#8b5cf6",
  "#e91e8c", "#43a047", "#ff7043", "#00bcd4", "#ffb300",
];

// rooms: Map<roomId, { lines, colorIndex }>
const rooms = new Map();
// sessions: Map<socketId, { color, name, roomId }>
const sessions = new Map();

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_req, res) => res.json({ ok: true }));

function generateRoomId() {
  let id;
  do {
    id = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(id));
  return id;
}

function normalizePoint(point) {
  if (!point || !Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.y))) {
    return null;
  }
  return {
    x: Math.max(0, Math.min(CANVAS_WIDTH, Number(point.x))),
    y: Math.max(0, Math.min(CANVAS_HEIGHT, Number(point.y))),
  };
}

function normalizeSegment(segment) {
  if (!segment) return null;
  const from = normalizePoint(segment.from);
  const to = normalizePoint(segment.to);
  if (!from || !to) return null;
  return { from, to };
}

function sanitizeName(raw) {
  return String(raw || "").trim().slice(0, 24) || "Anonymous";
}

io.on("connection", (socket) => {
  socket.on("create-room", ({ name }) => {
    const roomId = generateRoomId();
    rooms.set(roomId, { lines: [], colorIndex: 0 });

    const room = rooms.get(roomId);
    const color = CURSOR_COLORS[room.colorIndex % CURSOR_COLORS.length];
    room.colorIndex++;

    sessions.set(socket.id, { color, name: sanitizeName(name), roomId });
    socket.join(roomId);
    socket.emit("room-joined", { roomId, color, lines: [] });
  });

  socket.on("join-room", ({ name, roomId }) => {
    const id = String(roomId);
    const room = rooms.get(id);

    if (!room) {
      socket.emit("room-error", { message: "Whiteboard not found. Check the ID and try again." });
      return;
    }

    const color = CURSOR_COLORS[room.colorIndex % CURSOR_COLORS.length];
    room.colorIndex++;

    sessions.set(socket.id, { color, name: sanitizeName(name), roomId: id });
    socket.join(id);
    socket.emit("room-joined", { roomId: id, color, lines: room.lines });
  });

  socket.on("draw-line", (rawSegment) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const segment = normalizeSegment(rawSegment);
    if (!segment) return;

    const room = rooms.get(session.roomId);
    if (!room) return;

    room.lines.push(segment);
    socket.to(session.roomId).emit("draw-line", segment);
  });

  socket.on("clear-canvas", () => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const room = rooms.get(session.roomId);
    if (!room) return;

    room.lines = [];
    io.to(session.roomId).emit("clear-canvas");
  });

  socket.on("cursor-move", (rawPoint) => {
    const session = sessions.get(socket.id);
    if (!session) return;

    const point = normalizePoint(rawPoint);
    if (!point) return;

    socket.to(session.roomId).emit("cursor-move", {
      id: socket.id,
      x: point.x,
      y: point.y,
      name: session.name,
      color: session.color,
    });
  });

  socket.on("disconnect", () => {
    const session = sessions.get(socket.id);
    if (session) {
      socket.to(session.roomId).emit("cursor-remove", socket.id);
      sessions.delete(socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Realtime whiteboard running at http://localhost:${PORT}`);
});
