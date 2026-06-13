# Realtime Whiteboard

A collaborative drawing app where multiple users share a live canvas, see each other's cursors with name labels, and draw together in real time — all over WebSockets with zero framework overhead.

---

## Features

- **Whiteboard Rooms** — Create a room and get a 6-digit ID to share, or join an existing room by ID
- **Freehand Drawing** — Smooth pencil strokes synced instantly to every participant in the room
- **Named Cursors** — Every user gets a unique color; their name floats next to their cursor in real time
- **State Replay** — Late joiners receive the full drawing history so they see what was drawn before they arrived
- **Clear Canvas** — One click wipes the board for everyone in the room
- **Responsive** — Works on desktop and touch devices (uses Pointer Events API)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Drawing | HTML5 Canvas API |
| Real-time | Socket.IO v4 |
| Server | Node.js + Express |
| Transport | WebSocket (with long-polling fallback) |

---

## Architecture

### System Components

```mermaid
graph TB
    subgraph Browser["Browser (per user)"]
        UI["Modal UI\n(name → create/join)"]
        Canvas["HTML5 Canvas\n(drawing surface)"]
        CursorLayer["Cursor Layer\n(remote pointers)"]
        SocketClient["Socket.IO Client"]
        UI --> SocketClient
        Canvas --> SocketClient
        SocketClient --> Canvas
        SocketClient --> CursorLayer
    end

    subgraph Server["Node.js Server (localhost:3000)"]
        Express["Express\n(serves static files)"]
        SocketServer["Socket.IO Server\n(event bus)"]

        subgraph Memory["In-Memory Store"]
            Rooms["rooms Map\nroomId → { lines[], colorIndex }"]
            Sessions["sessions Map\nsocketId → { name, color, roomId }"]
        end

        SocketServer --> Rooms
        SocketServer --> Sessions
    end

    Browser -- "HTTP GET /" --> Express
    Express -- "index.html + app.js" --> Browser
    SocketClient -- "WebSocket" --> SocketServer
```

---

### Room Lifecycle

```mermaid
sequenceDiagram
    actor A as User A (Creator)
    actor B as User B (Joiner)
    participant S as Server

    A->>S: create-room { name }
    S->>S: generateRoomId() → "482917"
    S->>S: rooms.set("482917", { lines:[], colorIndex:0 })
    S->>A: room-joined { roomId: "482917", color, lines:[] }
    Note over A: Canvas opens, Room ID shown in header

    B->>S: join-room { name, roomId: "482917" }
    S->>S: rooms.get("482917") → found
    S->>B: room-joined { roomId, color, lines: [...] }
    Note over B: Canvas opens with full drawing history
```

---

### Real-Time Event Flow

```mermaid
sequenceDiagram
    actor A as User A
    actor B as User B
    participant S as Server

    Note over A,B: Both in room "482917"

    A->>S: draw-line { from: {x,y}, to: {x,y} }
    S->>S: room.lines.push(segment)
    S->>B: draw-line { from, to }
    Note over B: Segment rendered on canvas

    A->>S: cursor-move { x, y }
    S->>S: Attach name + color from sessions
    S->>B: cursor-move { id, x, y, name, color }
    Note over B: Named cursor repositioned

    A->>S: clear-canvas
    S->>S: room.lines = []
    S->>A: clear-canvas
    S->>B: clear-canvas
    Note over A,B: Both canvases wiped

    A-->>S: disconnect
    S->>S: sessions.delete(socketId)
    S->>B: cursor-remove { id }
    Note over B: User A's cursor removed
```

---

### Frontend State Machine

```mermaid
stateDiagram-v2
    [*] --> StepName : page load
    StepName --> StepAction : name submitted
    StepAction --> Canvas : "Create" clicked → room-joined
    StepAction --> StepJoin : "Join" clicked
    StepJoin --> StepAction : Back
    StepJoin --> Canvas : valid ID → room-joined
    StepJoin --> StepJoin : room-error (invalid ID)
    Canvas --> Canvas : draw / cursor-move / clear
```

---

## Project Structure

```
realtime-whiteboard/
├── server.js           # Express + Socket.IO server, room + session management
├── package.json
└── public/
    ├── index.html      # App shell + multi-step modal markup
    ├── app.js          # Canvas drawing, cursor rendering, socket event handlers
    └── styles.css      # Layout, modal, action cards, remote cursor styles
```

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
# Install dependencies
npm install

# Start the server
npm start
```

Open [http://localhost:3000](http://localhost:3000) in two browser tabs to test collaboration.

---

## How to Collaborate

1. **Tab 1** — Enter your name → click **Create a whiteboard** → note the 6-digit Room ID shown in the header
2. **Tab 2** (or share with someone else) — Enter your name → click **Join a whiteboard** → enter the Room ID
3. Draw on either canvas — strokes and cursors sync in real time

---

## Socket.IO Event Reference

| Event | Direction | Payload | Description |
|---|---|---|---|
| `create-room` | Client → Server | `{ name }` | Create a new room |
| `join-room` | Client → Server | `{ name, roomId }` | Join existing room |
| `room-joined` | Server → Client | `{ roomId, color, lines }` | Confirm join, send history |
| `room-error` | Server → Client | `{ message }` | Room not found |
| `draw-line` | Both | `{ from: {x,y}, to: {x,y} }` | Draw a line segment |
| `cursor-move` | Both | `{ id, x, y, name, color }` | Update cursor position |
| `cursor-remove` | Server → Client | `socketId` | User disconnected |
| `clear-canvas` | Both | — | Wipe the board |
