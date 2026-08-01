"use strict";
const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const engine = require("./gameEngine.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

/* ============================================================
   In-memory room store.
   rooms: code -> {
     code, hostSocketId, started,
     players: [{ socketId, id, name, character, connected }],
     gameState: <engine state> | null,
   }
============================================================ */
const rooms = new Map();
const socketToRoom = new Map(); // socket.id -> room code

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
function makeRoomCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function lobbyPayload(room) {
  return {
    code: room.code,
    started: room.started,
    hostSocketId: room.hostSocketId,
    players: room.players.map((p) => ({ id: p.id, name: p.name, character: p.character, connected: p.connected })),
  };
}

function broadcastLobby(room) {
  io.to(room.code).emit("lobby", lobbyPayload(room));
}

function redactForViewer(gameState, viewerId) {
  const clone = structuredClone(gameState);
  clone.players = clone.players.map((p) => {
    if (p.id === viewerId) return p;
    return { ...p, hand: p.hand.map(() => ({ hidden: true })) };
  });
  clone.deckCount = clone.deck ? clone.deck.length : 0;
  clone.discardCount = clone.discard ? clone.discard.length : 0;
  delete clone.deck;
  delete clone.discard;
  return clone;
}

function broadcastState(room) {
  for (const p of room.players) {
    if (!p.connected) continue;
    io.to(p.socketId).emit("state", redactForViewer(room.gameState, p.id));
  }
}

function usedCharacters(room, excludeSocketId) {
  return room.players.filter((p) => p.socketId !== excludeSocketId).map((p) => p.character);
}

function pickDefaultCharacter(room, excludeSocketId) {
  const used = usedCharacters(room, excludeSocketId);
  const free = engine.CHAR_LIST.map((c) => c.key).find((k) => !used.includes(k));
  return free || engine.CHAR_LIST[0].key;
}

/* ---------- server-side authorization: which player may send which action right now ---------- */
function authorize(gs, playerId, action) {
  if (!gs) return false;
  const turnPlayerId = gs.players[gs.currentIndex] && gs.players[gs.currentIndex].id;
  switch (action.type) {
    case "DRAW_ACTION":
    case "REBUILD_HAND":
    case "PLAY_CARD":
    case "MAGE_SUBSTITUTE_ATTACK":
    case "USE_ACTIVE":
    case "END_TURN":
      return playerId === turnPlayerId;
    case "RESOLVE_REACTION":
      return !!gs.currentReaction && gs.currentReaction.kind !== "priestChoice" && playerId === gs.currentReaction.targetId;
    case "RESOLVE_PRIEST_CHOICE":
      return !!gs.currentReaction && gs.currentReaction.kind === "priestChoice" && playerId === gs.currentReaction.playerId;
    case "RESOLVE_HAND_LIMIT":
      return !!gs.pendingHandLimit && playerId === gs.pendingHandLimit.playerId;
    case "RESOLVE_DISCARD_ALL":
      return !!gs.pendingDiscardAll && gs.pendingDiscardAll.length > 0 && gs.pendingDiscardAll[0] === playerId;
    case "MADMAN_FREE_PLAY":
      return !!gs.madmanFreePlay && playerId === gs.madmanFreePlay.playerId;
    case "RESOLVE_STEAL":
      return !!gs.pendingSteal && playerId === gs.pendingSteal.sourceId;
    default:
      return false;
  }
}

// Never trust playerId / raw card identity fields coming from the client for actions
// that name a specific player or hand position - force them to the server-known values.
function sanitizeAction(gs, playerId, action) {
  switch (action.type) {
    case "RESOLVE_HAND_LIMIT":
      return { type: "RESOLVE_HAND_LIMIT", playerId, cardId: action.cardId };
    case "RESOLVE_DISCARD_ALL":
      return { type: "RESOLVE_DISCARD_ALL", playerId, cardId: action.cardId || null };
    case "RESOLVE_PRIEST_CHOICE":
      return { type: "RESOLVE_PRIEST_CHOICE", playerId, choice: action.choice };
    case "RESOLVE_STEAL": {
      const tgt = gs.players.find((p) => p.id === gs.pendingSteal.targetId);
      const idx = Number.isInteger(action.index) ? action.index : -1;
      const real = tgt && tgt.hand[idx];
      return { type: "RESOLVE_STEAL", cardId: real ? real.id : null };
    }
    default:
      return action;
  }
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    const code = makeRoomCode();
    const playerName = (name || "ผู้เล่น 1").slice(0, 20);
    const room = {
      code,
      hostSocketId: socket.id,
      started: false,
      players: [{ socketId: socket.id, id: "p0", name: playerName, character: "viking", connected: true }],
      gameState: null,
    };
    rooms.set(code, room);
    socketToRoom.set(socket.id, code);
    socket.join(code);
    socket.emit("joined", { roomCode: code, playerId: "p0", isHost: true });
    broadcastLobby(room);
  });

  socket.on("joinRoom", ({ roomCode, name }) => {
    const room = rooms.get((roomCode || "").toUpperCase());
    if (!room) return socket.emit("errorMsg", "ไม่พบห้องนี้ ตรวจสอบรหัสห้องอีกครั้ง");
    if (room.started) return socket.emit("errorMsg", "ห้องนี้เริ่มเกมไปแล้ว");
    if (room.players.length >= 6) return socket.emit("errorMsg", "ห้องเต็มแล้ว (สูงสุด 6 คน)");
    const id = `p${room.players.length}`;
    const character = pickDefaultCharacter(room, null);
    room.players.push({ socketId: socket.id, id, name: (name || `ผู้เล่น ${room.players.length + 1}`).slice(0, 20), character, connected: true });
    socketToRoom.set(socket.id, room.code);
    socket.join(room.code);
    socket.emit("joined", { roomCode: room.code, playerId: id, isHost: false });
    broadcastLobby(room);
  });

  socket.on("chooseCharacter", ({ character }) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room || room.started) return;
    const me = room.players.find((p) => p.socketId === socket.id);
    if (!me) return;
    if (!engine.CHARS[character]) return;
    if (usedCharacters(room, socket.id).includes(character)) {
      return socket.emit("errorMsg", "อาชีพนี้ถูกเลือกไปแล้ว");
    }
    me.character = character;
    broadcastLobby(room);
  });

  socket.on("startGame", () => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room || room.started) return;
    if (room.hostSocketId !== socket.id) return socket.emit("errorMsg", "ให้เจ้าของห้องเป็นคนกดเริ่มเกม");
    if (room.players.length < 2) return socket.emit("errorMsg", "ต้องมีผู้เล่นอย่างน้อย 2 คน");
    const chars = room.players.map((p) => p.character);
    if (new Set(chars).size !== chars.length) return socket.emit("errorMsg", "มีผู้เล่นเลือกอาชีพซ้ำกัน");
    room.started = true;
    room.gameState = engine.reducer(engine.initialState, {
      type: "INIT_GAME",
      setups: room.players.map((p) => ({ name: p.name, character: p.character })),
    });
    broadcastLobby(room);
    broadcastState(room);
  });

  socket.on("action", (action) => {
    const code = socketToRoom.get(socket.id);
    const room = rooms.get(code);
    if (!room || !room.started || !room.gameState) return;
    const me = room.players.find((p) => p.socketId === socket.id);
    if (!me) return;
    if (!action || typeof action.type !== "string") return;
    if (!authorize(room.gameState, me.id, action)) {
      return socket.emit("errorMsg", "ยังไม่ถึงตาคุณ หรือการกระทำนี้ไม่ถูกต้องในตอนนี้");
    }
    const safeAction = sanitizeAction(room.gameState, me.id, action);
    room.gameState = engine.reducer(room.gameState, safeAction);
    broadcastState(room);
  });

  socket.on("disconnect", () => {
    const code = socketToRoom.get(socket.id);
    socketToRoom.delete(socket.id);
    const room = rooms.get(code);
    if (!room) return;
    const me = room.players.find((p) => p.socketId === socket.id);
    if (!me) return;
    me.connected = false;
    if (!room.started) {
      // in the lobby, a disconnect just drops the seat entirely
      room.players = room.players.filter((p) => p.socketId !== socket.id);
      if (room.players.length === 0) { rooms.delete(code); return; }
      if (room.hostSocketId === socket.id) room.hostSocketId = room.players[0].socketId;
      broadcastLobby(room);
    } else {
      broadcastLobby(room);
      broadcastState(room);
    }
  });

  // allow a disconnected player to resume their seat by rejoining the same room+name
  socket.on("rejoin", ({ roomCode, name }) => {
    const room = rooms.get((roomCode || "").toUpperCase());
    if (!room) return socket.emit("errorMsg", "ไม่พบห้องนี้");
    const me = room.players.find((p) => p.name === name && !p.connected);
    if (!me) return socket.emit("errorMsg", "ไม่พบที่นั่งเดิมของคุณในห้องนี้");
    me.socketId = socket.id;
    me.connected = true;
    socketToRoom.set(socket.id, room.code);
    socket.join(room.code);
    socket.emit("joined", { roomCode: room.code, playerId: me.id, isHost: room.hostSocketId === socket.id });
    broadcastLobby(room);
    if (room.started) broadcastState(room);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Card battle arena server running on http://localhost:${PORT}`);
});
