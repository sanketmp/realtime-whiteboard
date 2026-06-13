const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const PENCIL_COLOR = "#1f2328";
const PENCIL_WIDTH = 3;

const socket = io();

// DOM refs
const canvas = document.getElementById("whiteboard");
const boardWrap = canvas.closest(".board-wrap");
const cursorLayer = document.getElementById("cursorLayer");
const clearButton = document.getElementById("clearButton");
const connectionStatus = document.getElementById("connectionStatus");
const roomBadge = document.getElementById("roomBadge");
const roomIdDisplay = document.getElementById("roomIdDisplay");
const copyRoomId = document.getElementById("copyRoomId");

// Modal steps
const nameOverlay = document.getElementById("nameOverlay");
const stepName = document.getElementById("stepName");
const stepAction = document.getElementById("stepAction");
const stepJoin = document.getElementById("stepJoin");
const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("nameInput");
const btnCreate = document.getElementById("btnCreate");
const btnJoin = document.getElementById("btnJoin");
const joinForm = document.getElementById("joinForm");
const roomIdInput = document.getElementById("roomIdInput");
const joinError = document.getElementById("joinError");
const btnBack = document.getElementById("btnBack");

const ctx = canvas.getContext("2d");

let isDrawing = false;
let lastPoint = null;
let activePointerId = null;
let lines = [];
let joined = false;
let userName = "";

const remoteCursors = new Map();

ctx.lineCap = "round";
ctx.lineJoin = "round";
ctx.strokeStyle = PENCIL_COLOR;
ctx.lineWidth = PENCIL_WIDTH;

// ── Canvas helpers ────────────────────────────────────────────────────────────

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
  };
}

function drawSegment(segment) {
  ctx.beginPath();
  ctx.moveTo(segment.from.x, segment.from.y);
  ctx.lineTo(segment.to.x, segment.to.y);
  ctx.stroke();
}

function redrawCanvas() {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  lines.forEach(drawSegment);
}

// ── Remote cursors ────────────────────────────────────────────────────────────

function renderCursor(cursor) {
  const rect = canvas.getBoundingClientRect();
  const x = (cursor.x / CANVAS_WIDTH) * rect.width;
  const y = (cursor.y / CANVAS_HEIGHT) * rect.height;
  cursor.element.style.transform = `translate(${x}px, ${y}px)`;
}

function getRemoteCursor(id, name, color) {
  const existing = remoteCursors.get(id);
  if (existing) {
    if (name) existing.label.textContent = name;
    if (color) existing.element.style.setProperty("--cursor-color", color);
    return existing;
  }

  const element = document.createElement("div");
  element.className = "remote-cursor";
  element.style.setProperty("--cursor-color", color || "#e05252");

  const label = document.createElement("span");
  label.className = "cursor-name";
  label.textContent = name || "";
  element.appendChild(label);
  cursorLayer.appendChild(element);

  const cursor = { element, label, x: 0, y: 0 };
  remoteCursors.set(id, cursor);
  return cursor;
}

// ── Status ────────────────────────────────────────────────────────────────────

function setConnectionStatus(text, stateClass) {
  connectionStatus.textContent = text;
  connectionStatus.classList.remove("is-online", "is-offline");
  if (stateClass) connectionStatus.classList.add(stateClass);
}

// ── Modal flow ────────────────────────────────────────────────────────────────

function showStep(step) {
  [stepName, stepAction, stepJoin].forEach((s) => (s.style.display = "none"));
  step.style.display = "block";
}

// Step 1 → Step 2
nameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  userName = name;
  showStep(stepAction);
});

// Step 2 → Create
btnCreate.addEventListener("click", () => {
  socket.emit("create-room", { name: userName });
});

// Step 2 → Step 3 (join)
btnJoin.addEventListener("click", () => {
  joinError.textContent = "";
  roomIdInput.value = "";
  showStep(stepJoin);
  roomIdInput.focus();
});

// Step 3 → join
joinForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const roomId = roomIdInput.value.trim();
  if (!/^\d{6}$/.test(roomId)) {
    joinError.textContent = "Please enter a valid 6-digit ID.";
    return;
  }
  joinError.textContent = "";
  socket.emit("join-room", { name: userName, roomId });
});

// Step 3 → back to Step 2
btnBack.addEventListener("click", () => showStep(stepAction));

// Copy room ID
copyRoomId.addEventListener("click", () => {
  navigator.clipboard.writeText(roomIdDisplay.textContent).then(() => {
    copyRoomId.textContent = "Copied!";
    setTimeout(() => (copyRoomId.textContent = "Copy"), 1500);
  });
});

// ── Socket events ─────────────────────────────────────────────────────────────

socket.on("connect", () => setConnectionStatus("Connected", "is-online"));
socket.on("disconnect", () => setConnectionStatus("Disconnected", "is-offline"));

socket.on("room-joined", ({ roomId, lines: serverLines }) => {
  joined = true;
  nameOverlay.classList.add("hidden");

  roomIdDisplay.textContent = roomId;
  roomBadge.hidden = false;

  lines = Array.isArray(serverLines) ? serverLines : [];
  redrawCanvas();
});

socket.on("room-error", ({ message }) => {
  joinError.textContent = message;
});

socket.on("draw-line", (segment) => {
  lines.push(segment);
  drawSegment(segment);
});

socket.on("clear-canvas", () => {
  lines = [];
  redrawCanvas();
});

socket.on("cursor-move", ({ id, x, y, name, color }) => {
  const cursor = getRemoteCursor(id, name, color);
  cursor.x = x;
  cursor.y = y;
  renderCursor(cursor);
});

socket.on("cursor-remove", (id) => {
  const cursor = remoteCursors.get(id);
  if (!cursor) return;
  cursor.element.remove();
  remoteCursors.delete(id);
});

window.addEventListener("resize", () => remoteCursors.forEach(renderCursor));

// ── Drawing ───────────────────────────────────────────────────────────────────

boardWrap.addEventListener("pointermove", (event) => {
  if (!joined) return;
  socket.emit("cursor-move", getCanvasPoint(event));
});

canvas.addEventListener("pointerdown", (event) => {
  if (!joined) return;
  isDrawing = true;
  activePointerId = event.pointerId;
  lastPoint = getCanvasPoint(event);
  canvas.setPointerCapture(activePointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (!isDrawing || event.pointerId !== activePointerId || !lastPoint) return;

  const currentPoint = getCanvasPoint(event);
  const segment = { from: lastPoint, to: currentPoint };

  lines.push(segment);
  drawSegment(segment);
  socket.emit("draw-line", segment);
  lastPoint = currentPoint;
});

function stopDrawing(event) {
  if (event.pointerId !== activePointerId) return;
  isDrawing = false;
  lastPoint = null;
  activePointerId = null;
}

canvas.addEventListener("pointerup", stopDrawing);
canvas.addEventListener("pointercancel", stopDrawing);
canvas.addEventListener("pointerleave", stopDrawing);

clearButton.addEventListener("click", () => {
  if (joined) socket.emit("clear-canvas");
});
