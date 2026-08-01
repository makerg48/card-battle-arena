import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";

/* ============================================================
   Online multiplayer client for the 6-class card battle game.
   The server holds the authoritative game state (see gameEngine.js
   on the server side, which is the same rules engine used by the
   original single-device "hotseat" build). This file only renders
   whatever state the server pushes down, and sends the player's
   intended actions back over socket.io. No game logic is decided
   here on the client.
============================================================ */

const CHARS = {
  viking: {
    key: "viking", name: "ไวกิ้ง", hp: 13, activeCost: 1,
    passive: "เมื่อ HP ลดลง ได้โบนัสโจมตี +1/+2/+3/+4 ตามช่วง HP ปัจจุบัน",
    active: "(1 Action) เลือก 1: ฮีลตัวเอง 2 หรือ ลด HP ตัวเอง 2",
    color: "viking",
  },
  priest: {
    key: "priest", name: "นักบวช", hp: 10, activeCost: 3,
    passive: "เมื่อป้องกันสำเร็จ เลือก 1: ฮีล 1 หรือสะท้อนผลกลับผู้ใช้",
    active: "(3 Action) หยิบการ์ดป้องกัน 2 ใบจากกองทิ้งขึ้นมือ",
    color: "priest",
  },
  ninja: {
    key: "ninja", name: "นินจา", hp: 10, activeCost: 3,
    passive: "โจมตีสำเร็จ: เป้าหมายติด Bleeding และจั่วการ์ด 1 ใบ",
    active: "(3 Action) เลือกผู้เล่น 2 คน ทำให้ติด Bleeding",
    color: "ninja",
  },
  assassin: {
    key: "assassin", name: "นักฆ่า", hp: 10, activeCost: 2,
    passive: "โจมตีผู้เล่นที่ HP ≤ 4 เป้าหมายป้องกันไม่ได้",
    active: "(2 Action) เทิร์นนี้: ป้องกันตัวเองไม่ได้จนเทิร์นหน้า, โจมตี +4 และกลายเป็นวงกว้าง, ถ้าสังหารได้รับการ์ดคืน+1 Action",
    color: "assassin",
  },
  madman: {
    key: "madman", name: "คนบ้า", hp: 10, activeCost: 3,
    passive: "เมื่อจั่วได้การ์ดโจมตี ใช้ได้ทันทีโดยไม่เสีย Action",
    active: "(3 Action) เลือก 1: รีเซ็ตมือทุกคน (3 ใบ) หรือ ส่งมือทั้งหมดให้คนถัดไป",
    color: "madman",
  },
  mage: {
    key: "mage", name: "นักมายากล", hp: 10, activeCost: 1,
    passive: "ใช้การ์ด Magic ใบใดก็ได้แทนการ์ดโจมตี 3",
    active: "(1 Action) เปลี่ยนการ์ด 2 ใบในมือให้เป็นการ์ด Magic",
    color: "mage",
  },
};

const CHAR_LIST = Object.values(CHARS);

const CARD_STYLE = { attack: "card-atk", defense: "card-def", heal: "card-heal", magic: "card-magic" };
const CARD_ICON_EMOJI = { attack: "⚔️", defense: "🛡️", heal: "❤️", magic: "✨" };

function vikingBonus(hp) {
  if (hp >= 13) return 0;
  if (hp >= 11) return 1;
  if (hp >= 8) return 2;
  if (hp >= 6) return 3;
  if (hp >= 1) return 4;
  return 4;
}

const MAGIC_SUBTYPE_LABEL = {
  discardAll: "ทุกคนทิ้งการ์ด 1 ใบ", swapHand: "สลับมือกับผู้เล่น 1 คน", stealCard: "ดึงการ์ดจากผู้เล่น 1 คน",
  drawTwo: "จั่วการ์ด 2 ใบ", banActive: "แบน Active 1 เทิร์น", cannotAttack: "ห้ามโจมตี 1 เทิร์น",
};
function cardSubtypeLabel(s) {
  return { swapHand: "สลับมือ", stealCard: "ดึงการ์ด", banActive: "แบน Active", cannotAttack: "ห้ามโจมตี" }[s] || s;
}

function CardView({ card, onClick, disabled, small }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`card-face ${CARD_STYLE[card.type]} ${small ? "card-sm" : ""} ${disabled ? "card-disabled" : ""}`}
    >
      <span className="card-icon-emoji">{CARD_ICON_EMOJI[card.type]}</span>
      <span className="card-label">{card.label}</span>
    </button>
  );
}

function HpBar({ hp, maxHp }) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  return (
    <div className="hp-track">
      <div className="hp-fill" style={{ width: `${pct}%` }} />
      <span className="hp-text">{hp}/{maxHp}</span>
    </div>
  );
}

function PlayerBadge({ p, isTurn, isMe, onClick, selectable, selected }) {
  const def = CHARS[p.character];
  return (
    <div
      onClick={selectable ? onClick : undefined}
      className={`player-badge char-${def.color} ${isTurn ? "player-current" : ""} ${!p.alive ? "player-dead" : ""} ${selectable ? "player-selectable" : ""} ${selected ? "player-selected" : ""}`}
    >
      <div className="player-badge-top">
        <span className="player-name">{p.name}{isMe ? " (คุณ)" : ""}</span>
        <span className="player-char">{def.name}</span>
      </div>
      <HpBar hp={p.hp} maxHp={p.maxHp} />
      {p.character === "viking" && p.alive && (
        <div className="viking-bonus-chip">⚔️ โบนัสโจมตี +{vikingBonus(p.hp)}</div>
      )}
      <div className="hand-count-row">🗂️ การ์ดในมือ: {p.hand.length}/5</div>
      <div className="status-row">
        {p.bleeding && <span className="status-chip status-bleed">🩸 Bleeding</span>}
        {p.banActiveTurns > 0 && <span className="status-chip status-ban">🚫 No Active</span>}
        {p.cannotAttackTurns > 0 && <span className="status-chip status-ban">⚔️ No Attack</span>}
        {p.cannotDefendSelf && <span className="status-chip status-ban">🛡️ No Defend</span>}
        {!p.alive && <span className="status-chip status-dead">💀 Out</span>}
        {!p.connected && p.alive && <span className="status-chip status-ban">📴 หลุดการเชื่อมต่อ</span>}
      </div>
    </div>
  );
}

function useSocketGame() {
  const socketRef = useRef(null);
  const [connStatus, setConnStatus] = useState("connecting"); // connecting | connected | disconnected
  const [myId, setMyId] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [lobby, setLobby] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [myName, setMyName] = useState("");

  useEffect(() => {
    const socket = io();
    socketRef.current = socket;
    socket.on("connect", () => setConnStatus("connected"));
    socket.on("disconnect", () => setConnStatus("disconnected"));
    socket.on("joined", ({ roomCode, playerId, isHost }) => {
      setRoomCode(roomCode);
      setMyId(playerId);
      setIsHost(isHost);
      try {
        localStorage.setItem("cba_room", roomCode);
        localStorage.setItem("cba_name", myNameRef.current);
      } catch (e) {}
    });
    socket.on("lobby", (l) => setLobby(l));
    socket.on("state", (s) => setGameState(s));
    socket.on("errorMsg", (m) => setErrorMsg(m));
    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myNameRef = useRef("");
  useEffect(() => { myNameRef.current = myName; }, [myName]);

  function createRoom(name) {
    setMyName(name);
    socketRef.current.emit("createRoom", { name });
  }
  function joinRoom(roomCode, name) {
    setMyName(name);
    socketRef.current.emit("joinRoom", { roomCode: roomCode.toUpperCase(), name });
  }
  function chooseCharacter(character) {
    socketRef.current.emit("chooseCharacter", { character });
  }
  function startGame() {
    socketRef.current.emit("startGame");
  }
  function dispatch(action) {
    socketRef.current.emit("action", action);
  }

  return { connStatus, myId, roomCode, isHost, lobby, gameState, errorMsg, setErrorMsg, createRoom, joinRoom, chooseCharacter, startGame, dispatch };
}

function HomeScreen({ onCreate, onJoin, errorMsg, clearError }) {
  const [name, setName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState("create"); // create | join
  return (
    <div className="app-bg">
      <StyleBlock />
      <div className="setup-wrap">
        <h1 className="title-font hero-title">สนามประลอง 6 อาชีพ</h1>
        <p className="hero-sub">เวอร์ชันออนไลน์ — เล่นข้ามเครื่องได้จริง</p>

        <div className="home-tabs">
          <button className={`home-tab ${mode === "create" ? "home-tab-active" : ""}`} onClick={() => setMode("create")}>สร้างห้องใหม่</button>
          <button className={`home-tab ${mode === "join" ? "home-tab-active" : ""}`} onClick={() => setMode("join")}>เข้าร่วมห้อง</button>
        </div>

        <div className="setup-list">
          <div className="setup-row">
            <span className="setup-idx">👤</span>
            <input className="setup-input" placeholder="ชื่อของคุณ" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {mode === "join" && (
            <div className="setup-row">
              <span className="setup-idx">#</span>
              <input className="setup-input" placeholder="รหัสห้อง เช่น A3F9" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} maxLength={4} />
            </div>
          )}
        </div>

        {errorMsg && <p className="home-error" onClick={clearError}>⚠️ {errorMsg}</p>}

        <div className="setup-actions">
          {mode === "create" ? (
            <button className="btn-primary" disabled={!name.trim()} onClick={() => onCreate(name.trim())}>สร้างห้อง →</button>
          ) : (
            <button className="btn-primary" disabled={!name.trim() || joinCode.length !== 4} onClick={() => onJoin(joinCode.trim(), name.trim())}>เข้าร่วมห้อง →</button>
          )}
        </div>
        <div className="rules-mini">
          <p>ℹ️ รองรับ 2–6 คน ต่อห้อง · แต่ละคนเล่นจากเครื่อง/มือถือของตัวเอง</p>
        </div>
      </div>
    </div>
  );
}

function LobbyScreen({ lobby, myId, isHost, onChooseCharacter, onStart, errorMsg, clearError }) {
  const me = lobby.players.find((p) => p.id === myId);
  const usedByOthers = lobby.players.filter((p) => p.id !== myId).map((p) => p.character);
  const chars = lobby.players.map((p) => p.character);
  const allDistinct = new Set(chars).size === chars.length;
  return (
    <div className="app-bg">
      <StyleBlock />
      <div className="setup-wrap">
        <h1 className="title-font hero-title">ห้อง {lobby.code}</h1>
        <p className="hero-sub">แชร์รหัสห้องนี้ให้เพื่อนเพื่อเข้าร่วม ({lobby.players.length}/6 คน)</p>

        <div className="setup-list">
          {lobby.players.map((p) => (
            <div className="setup-row" key={p.id}>
              <span className="setup-idx">{p.connected ? "🟢" : "⚪"}</span>
              <span className="lobby-player-name">{p.name}{p.id === myId ? " (คุณ)" : ""}</span>
              {p.id === myId ? (
                <select className="setup-select" value={p.character} onChange={(e) => onChooseCharacter(e.target.value)}>
                  {CHAR_LIST.map((c) => (
                    <option key={c.key} value={c.key} disabled={usedByOthers.includes(c.key) && c.key !== p.character}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <span className="lobby-player-char">{CHARS[p.character].name}</span>
              )}
            </div>
          ))}
        </div>

        {errorMsg && <p className="home-error" onClick={clearError}>⚠️ {errorMsg}</p>}

        <div className="setup-actions">
          {isHost ? (
            <button className="btn-primary" disabled={lobby.players.length < 2 || !allDistinct} onClick={onStart}>เริ่มเกม →</button>
          ) : (
            <p className="hero-sub">รอเจ้าของห้องกดเริ่มเกม...</p>
          )}
        </div>
        {!allDistinct && <p className="home-error">⚠️ มีผู้เล่นเลือกอาชีพซ้ำกัน กรุณาเลือกใหม่</p>}
      </div>
    </div>
  );
}

function pendingActorId(state) {
  if (state.currentReaction) {
    if (state.currentReaction.kind === "priestChoice") return state.currentReaction.playerId;
    return state.currentReaction.targetId;
  }
  if (state.pendingHandLimit) return state.pendingHandLimit.playerId;
  if (state.pendingDiscardAll && state.pendingDiscardAll.length) return state.pendingDiscardAll[0];
  if (state.madmanFreePlay) return state.madmanFreePlay.playerId;
  if (state.pendingSteal) return state.pendingSteal.sourceId;
  return null;
}

function WaitingBanner({ state, myId }) {
  const actorId = pendingActorId(state);
  if (!actorId || actorId === myId) return null;
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return null;
  return <div className="waiting-banner">⏳ กำลังรอ {actor.name} ตัดสินใจ...</div>;
}

function ActiveSkillButton({ current, state, dispatch, selectTargetMode, mageStep, setMageStep, interactive }) {
  const def = CHARS[current.character];
  const disabled = !interactive || current.banActiveTurns > 0 || current.usedActiveThisTurn || state.actionsLeft < def.activeCost;
  const label = current.usedActiveThisTurn ? "ใช้ Active แล้ว" : `Active (${def.activeCost})`;
  const [showVikingChoice, setShowVikingChoice] = useState(false);
  const [showMadmanChoice, setShowMadmanChoice] = useState(false);

  if (current.character === "viking") {
    return (
      <div className="active-wrap">
        <button className="btn-action btn-active" disabled={disabled} onClick={() => setShowVikingChoice(true)}>🔥 {label}</button>
        {showVikingChoice && (
          <div className="mini-choice">
            <button className="btn-secondary-sm" onClick={() => { dispatch({ type: "USE_ACTIVE", choice: "heal" }); setShowVikingChoice(false); }}>ฮีล +2</button>
            <button className="btn-secondary-sm" onClick={() => { dispatch({ type: "USE_ACTIVE", choice: "damage" }); setShowVikingChoice(false); }}>-2 HP (สะสมโบนัส)</button>
            <button className="btn-ghost-sm" onClick={() => setShowVikingChoice(false)}>ยกเลิก</button>
          </div>
        )}
      </div>
    );
  }
  if (current.character === "ninja") {
    return <button className="btn-action btn-active" disabled={disabled} onClick={() => selectTargetMode("ninjaActive", 2, { min: 1 })}>🩸 {label}</button>;
  }
  if (current.character === "assassin") {
    return <button className="btn-action btn-active" disabled={disabled} onClick={() => dispatch({ type: "USE_ACTIVE" })}>💀 {label}</button>;
  }
  if (current.character === "priest") {
    return <button className="btn-action btn-active" disabled={disabled} onClick={() => dispatch({ type: "USE_ACTIVE" })}>🛡️ {label}</button>;
  }
  if (current.character === "madman") {
    return (
      <div className="active-wrap">
        <button className="btn-action btn-active" disabled={disabled} onClick={() => setShowMadmanChoice(true)}>🤚 {label}</button>
        {showMadmanChoice && (
          <div className="mini-choice">
            <button className="btn-secondary-sm" onClick={() => { dispatch({ type: "USE_ACTIVE", choice: "reset" }); setShowMadmanChoice(false); }}>รีเซ็ตมือทุกคน</button>
            <button className="btn-secondary-sm" onClick={() => { dispatch({ type: "USE_ACTIVE", choice: "pass" }); setShowMadmanChoice(false); }}>ส่งมือให้คนถัดไป</button>
            <button className="btn-ghost-sm" onClick={() => setShowMadmanChoice(false)}>ยกเลิก</button>
          </div>
        )}
      </div>
    );
  }
  if (current.character === "mage") {
    return <button className="btn-action btn-active" disabled={disabled || !!mageStep} onClick={() => setMageStep({ chosen: [] })}>🔄 {label}</button>;
  }
  return null;
}

function MageTransformPanel({ current, mageStep, setMageStep, dispatch }) {
  const subtypes = [
    { k: "discardAll", n: "ทุกคนทิ้งการ์ด" }, { k: "swapHand", n: "สลับมือ" }, { k: "stealCard", n: "ดึงการ์ด" },
    { k: "drawTwo", n: "จั่ว 2" }, { k: "banActive", n: "แบน Active" }, { k: "cannotAttack", n: "ห้ามโจมตี" },
  ];
  const assign = mageStep.assign || {};
  const bothAssigned = mageStep.chosen.length === 2 && mageStep.chosen.every((id) => assign[id]);
  return (
    <div className="mage-panel">
      <div className="mage-panel-title">เลือกการ์ด 2 ใบเพื่อแปลงเป็น Magic ({mageStep.chosen.length}/2)</div>
      <div className="hand-row">
        {current.hand.map((c) => (
          <CardView key={c.id} card={c} small
            disabled={mageStep.chosen.includes(c.id) === false && mageStep.chosen.length >= 2}
            onClick={() => {
              const chosen = mageStep.chosen.includes(c.id) ? mageStep.chosen.filter((x) => x !== c.id) : [...mageStep.chosen, c.id].slice(-2);
              const newAssign = { ...assign };
              if (!chosen.includes(c.id)) delete newAssign[c.id];
              setMageStep({ ...mageStep, chosen, assign: newAssign });
            }} />
        ))}
      </div>
      {mageStep.chosen.map((cid, idx) => {
        const origCard = current.hand.find((c) => c.id === cid);
        return (
          <div key={cid} className="mage-subtype-row">
            <span>ใบที่ {idx + 1} ({origCard ? origCard.label : "?"}) แปลงเป็น:</span>
            {subtypes.map((s) => (
              <button key={s.k} className={`btn-secondary-sm ${assign[cid] === s.k ? "btn-mage-picked" : ""}`}
                onClick={() => setMageStep({ ...mageStep, assign: { ...assign, [cid]: s.k } })}>{s.n}</button>
            ))}
          </div>
        );
      })}
      {bothAssigned && (
        <button className="btn-primary" onClick={() => { dispatch({ type: "USE_ACTIVE", cardIds: mageStep.chosen, subtypes: assign }); setMageStep(null); }}>ยืนยันการแปลง</button>
      )}
      <button className="btn-ghost-sm" onClick={() => setMageStep(null)}>ยกเลิก</button>
    </div>
  );
}

function ReactionModal({ state, dispatch }) {
  const r = state.currentReaction;
  const attacker = state.players.find((x) => x.id === r.attackerId);
  const defender = state.players.find((x) => x.id === r.targetId);
  const label = r.kind === "attack"
    ? `${attacker.name} โจมตี ${defender.name} (${r.amount} ดาเมจ)`
    : `${attacker.name} ใช้ ${cardSubtypeLabel(r.subtype)} เป้าหมาย ${defender.name}`;
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-icon">🛡️</div>
        <h3 className="modal-title">{defender.name}: จะป้องกันไหม?</h3>
        <p className="modal-desc">{label}</p>
        <div className="modal-actions">
          <button className="btn-primary" disabled={!r.canDefend} onClick={() => dispatch({ type: "RESOLVE_REACTION", useDefense: true })}>🛡️ ใช้การ์ดป้องกัน</button>
          <button className="btn-secondary" onClick={() => dispatch({ type: "RESOLVE_REACTION", useDefense: false })}>ไม่ป้องกัน / รับผล</button>
        </div>
        {!r.canDefend && <p className="modal-note">⚠️ ไม่สามารถป้องกันได้ในสถานการณ์นี้</p>}
      </div>
    </div>
  );
}

function PriestChoiceModal({ state, dispatch }) {
  const cr = state.currentReaction;
  const p = state.players.find((x) => x.id === cr.playerId);
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-icon">✨</div>
        <h3 className="modal-title">Passive นักบวช: {p.name}</h3>
        <p className="modal-desc">ป้องกันสำเร็จ — เลือก 1 อย่าง</p>
        <div className="modal-actions">
          <button className="btn-primary" onClick={() => dispatch({ type: "RESOLVE_PRIEST_CHOICE", choice: "heal" })}>ฮีล +1</button>
          <button className="btn-secondary" onClick={() => dispatch({ type: "RESOLVE_PRIEST_CHOICE", choice: "reflect" })}>สะท้อนผลกลับ</button>
        </div>
      </div>
    </div>
  );
}

function HandLimitModal({ state, dispatch, myPlayer }) {
  const { need } = state.pendingHandLimit;
  return (
    <div className="modal-overlay">
      <div className="modal-box modal-wide">
        <h3 className="modal-title">มือคุณเกิน 5 ใบ — เลือกทิ้ง ({need})</h3>
        <div className="hand-row">
          {myPlayer.hand.map((c) => (
            <CardView key={c.id} card={c} onClick={() => dispatch({ type: "RESOLVE_HAND_LIMIT", cardId: c.id })} />
          ))}
        </div>
      </div>
    </div>
  );
}

function DiscardAllModal({ dispatch, myPlayer }) {
  return (
    <div className="modal-overlay">
      <div className="modal-box modal-wide">
        <h3 className="modal-title">เลือกทิ้งการ์ด 1 ใบ (Magic)</h3>
        <div className="hand-row">
          {myPlayer.hand.map((c) => (
            <CardView key={c.id} card={c} onClick={() => dispatch({ type: "RESOLVE_DISCARD_ALL", cardId: c.id })} />
          ))}
          {myPlayer.hand.length === 0 && (
            <button className="btn-secondary" onClick={() => dispatch({ type: "RESOLVE_DISCARD_ALL", cardId: null })}>ไม่มีการ์ด — ข้าม</button>
          )}
        </div>
      </div>
    </div>
  );
}

function MadmanFreePlayModal({ state, dispatch, selectTargetMode, myPlayer }) {
  const { queue, playedCount } = state.madmanFreePlay;
  const card = myPlayer.hand.find((c) => c.id === queue[0]);
  if (!card) return null;
  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-icon">🤚</div>
        <h3 className="modal-title">Passive คนบ้า: {myPlayer.name}</h3>
        <p className="modal-desc">
          จั่วได้การ์ดโจมตี ({card.label}) — เล่นทันทีฟรีไหม?
          <br />เล่นฟรีไปแล้ว {playedCount}/2 · เหลือให้เลือกอีก {queue.length} ใบ
        </p>
        <div className="modal-actions">
          <button className="btn-primary" onClick={() => {
            if (card.subtype === "all") dispatch({ type: "MADMAN_FREE_PLAY", play: true, targetIds: [] });
            else selectTargetMode("madmanFreePlayAttack", 1, { excludeSelf: true });
          }}>เล่นทันที (ฟรี)</button>
          <button className="btn-secondary" onClick={() => dispatch({ type: "MADMAN_FREE_PLAY", play: false })}>เก็บไว้ในมือ</button>
        </div>
      </div>
    </div>
  );
}

function StealModal({ state, dispatch, myPlayer }) {
  const { targetId } = state.pendingSteal;
  const tgt = state.players.find((x) => x.id === targetId);
  return (
    <div className="modal-overlay">
      <div className="modal-box modal-wide">
        <div className="modal-icon">🤚</div>
        <h3 className="modal-title">{myPlayer.name}: เลือกใบที่จะดึงจาก {tgt.name}</h3>
        <p className="modal-desc">ห้ามดูว่าเป็นการ์ดอะไร — เลือกจากตำแหน่งเท่านั้นเพื่อความแฟร์</p>
        <div className="hand-row">
          {tgt.hand.map((_, i) => (
            <button key={i} className="card-face card-back" onClick={() => dispatch({ type: "RESOLVE_STEAL", index: i })}>
              <span className="card-icon-emoji">🗂️</span>
              <span className="card-label">ใบที่ {i + 1}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RulesModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3 className="modal-title">อาชีพทั้ง 6</h3>
        <div className="rules-char-grid">
          {CHAR_LIST.map((c) => (
            <div key={c.key} className={`rules-char-card char-${c.color}`}>
              <div className="rules-char-name">{c.name} (HP {c.hp})</div>
              <div className="rules-char-line"><b>P:</b> {c.passive}</div>
              <div className="rules-char-line"><b>A:</b> {c.active}</div>
            </div>
          ))}
        </div>
        <button className="btn-primary" onClick={onClose}>ปิด</button>
      </div>
    </div>
  );
}

function GameScreen({ state, myId, dispatch, roomCode }) {
  const [selecting, setSelecting] = useState(null);
  const [mageStep, setMageStep] = useState(null);
  const [showRules, setShowRules] = useState(false);

  const myPlayer = state.players.find((p) => p.id === myId);
  const turnPlayer = state.players[state.currentIndex];
  const isMyTurn = !!myPlayer && !!turnPlayer && myPlayer.id === turnPlayer.id;
  const noPendingAtAll = !state.currentReaction && !state.pendingHandLimit && !state.pendingDiscardAll && !state.madmanFreePlay && !state.pendingSteal;
  const actorId = pendingActorId(state);
  const isMyPending = actorId === myId;
  const def = myPlayer ? CHARS[myPlayer.character] : null;
  const canAct = isMyTurn && noPendingAtAll && !selecting;

  function selectTargetMode(kind, need, extra = {}) {
    setSelecting({ kind, need, min: extra.min ?? need, chosen: [], ...extra });
  }
  function toggleTarget(pid) {
    if (!selecting) return;
    let chosen = selecting.chosen.includes(pid) ? selecting.chosen.filter((x) => x !== pid) : [...selecting.chosen, pid];
    if (chosen.length > selecting.need) chosen = chosen.slice(-selecting.need);
    setSelecting({ ...selecting, chosen });
  }
  function confirmTargets() {
    if (!selecting) return;
    const { kind, chosen, cardId } = selecting;
    if (kind === "attack" || kind === "heal" || kind === "swapHand" || kind === "stealCard" || kind === "banActive" || kind === "cannotAttack") {
      dispatch({ type: "PLAY_CARD", cardId, targetIds: chosen });
    } else if (kind === "ninjaActive") {
      dispatch({ type: "USE_ACTIVE", targetIds: chosen });
    } else if (kind === "mageSubstitute") {
      dispatch({ type: "MAGE_SUBSTITUTE_ATTACK", cardId, targetIds: chosen });
    } else if (kind === "madmanFreePlayAttack") {
      dispatch({ type: "MADMAN_FREE_PLAY", play: true, targetIds: chosen });
    }
    setSelecting(null);
  }

  function handleCardClick(card) {
    if (!canAct) return;
    if (card.type === "defense") return;
    if (card.type === "attack") {
      if (myPlayer.cannotAttackTurns > 0) return;
      if (card.subtype === "all") { dispatch({ type: "PLAY_CARD", cardId: card.id, targetIds: [] }); return; }
      selectTargetMode("attack", 1, { cardId: card.id, excludeSelf: true });
      return;
    }
    if (card.type === "heal") { dispatch({ type: "PLAY_CARD", cardId: card.id, targetIds: [myPlayer.id] }); return; }
    if (card.type === "magic") {
      if (["swapHand", "stealCard", "banActive", "cannotAttack"].includes(card.subtype)) {
        selectTargetMode(card.subtype, 1, { cardId: card.id, excludeSelf: true });
      } else {
        dispatch({ type: "PLAY_CARD", cardId: card.id, targetIds: [] });
      }
    }
  }

  const validTargetIds = selecting
    ? state.players.filter((p) => p.alive && !(selecting.excludeSelf && p.id === myPlayer.id)).map((p) => p.id)
    : (state.madmanFreePlay && isMyPending ? state.players.filter((p) => p.alive && p.id !== myPlayer.id).map((p) => p.id) : []);

  if (!myPlayer) return <div className="app-bg"><StyleBlock /><div className="setup-wrap"><p className="hero-sub">กำลังโหลด...</p></div></div>;

  return (
    <div className="app-bg">
      <StyleBlock />
      <div className="game-shell">
        <div className="scroll-banner">
          <div className="scroll-left">
            <span className="scroll-turn-label">เทิร์นของ</span>
            <span className="scroll-turn-name">{turnPlayer.name}</span>
            <span className="scroll-turn-char">({CHARS[turnPlayer.character].name})</span>
          </div>
          <div className="rune-row">
            {[0, 1, 2].map((i) => <span key={i} className={`rune ${i < state.actionsLeft ? "rune-lit" : ""}`} />)}
          </div>
          <div className="scroll-right">
            <span className="room-code-badge">ห้อง {roomCode}</span>
            <button className="btn-ghost-sm" onClick={() => setShowRules(true)}>ℹ️ กติกา</button>
          </div>
        </div>

        <WaitingBanner state={state} myId={myId} />
        {!isMyTurn && noPendingAtAll && <div className="waiting-banner">⏳ รอเทิร์นของ {turnPlayer.name}...</div>}

        <div className="players-grid">
          {state.players.map((p) => (
            <PlayerBadge key={p.id} p={p} isTurn={p.id === turnPlayer.id} isMe={p.id === myId}
              selectable={!!selecting && validTargetIds.includes(p.id) && p.alive}
              selected={selecting?.chosen.includes(p.id)}
              onClick={() => toggleTarget(p.id)} />
          ))}
        </div>

        <div className={`skill-reminder char-${def.color}`}>
          <div className="pass-skill-title">{def.name} (คุณ) <span className="pass-skill-hp">HP {myPlayer.maxHp}</span></div>
          {myPlayer.character === "viking" && (
            <div className="pass-skill-line viking-bonus-line">⚔️ <b>โบนัสโจมตีตอนนี้:</b> +{vikingBonus(myPlayer.hp)} (จาก HP {myPlayer.hp}/{myPlayer.maxHp})</div>
          )}
          <div className="pass-skill-line">✨ <b>Passive:</b> {def.passive}</div>
          <div className="pass-skill-line">🔥 <b>Active:</b> {def.active}</div>
        </div>

        <div className="center-row">
          <div className="deck-info">🗂️ กองการ์ด: {state.deckCount} · กองทิ้ง: {state.discardCount}
            {state.jokerRemoved && <span className="joker-used-tag"> · 🃏 Joker ถูกใช้แล้ว</span>}
          </div>
          {selecting && (
            <div className="selecting-bar">
              เลือกเป้าหมาย {selecting.chosen.length}/{selecting.need}{selecting.min < selecting.need ? ` (อย่างน้อย ${selecting.min})` : ""}
              <button className="btn-secondary-sm" onClick={() => setSelecting(null)}>ยกเลิก</button>
              <button className="btn-primary-sm" disabled={selecting.chosen.length < selecting.min} onClick={confirmTargets}>ยืนยัน</button>
            </div>
          )}
        </div>

        {state.actionsLeft <= 0 && isMyTurn && noPendingAtAll && (
          <div className="end-turn-hint">⏳ Action หมดแล้ว — กด "จบเทิร์น" เพื่อไปยังผู้เล่นถัดไป</div>
        )}
        <div className="action-bar">
          <button className="btn-action" disabled={!canAct || state.actionsLeft < 1} onClick={() => dispatch({ type: "DRAW_ACTION" })}>🗂️ จั่วการ์ด (1)</button>
          <button className="btn-action" disabled={!canAct || state.actionsLeft < 3} onClick={() => dispatch({ type: "REBUILD_HAND" })}>♻️ รีมือ (3)</button>
          <ActiveSkillButton current={myPlayer} state={state} dispatch={dispatch} selectTargetMode={selectTargetMode} mageStep={mageStep} setMageStep={setMageStep} interactive={canAct} />
          <button className={`btn-action ${state.actionsLeft <= 0 && isMyTurn ? "btn-end-turn-glow" : ""}`} disabled={!canAct} onClick={() => dispatch({ type: "END_TURN" })}>จบเทิร์น ▶</button>
        </div>

        {mageStep && isMyTurn && <MageTransformPanel current={myPlayer} mageStep={mageStep} setMageStep={setMageStep} dispatch={dispatch} />}

        {myPlayer.character === "mage" && (
          <div className="mage-alt-row">
            <span className="mage-alt-label">✨ Passive: ใช้การ์ด Magic แทนโจมตี 3</span>
            <div className="hand-row">
              {myPlayer.hand.filter((c) => c.type === "magic").map((c) => (
                <CardView key={c.id} card={{ ...c, label: `${c.label} → โจมตี 3` }} small
                  disabled={!canAct || myPlayer.cannotAttackTurns > 0}
                  onClick={() => selectTargetMode("mageSubstitute", 1, { cardId: c.id, excludeSelf: true })} />
              ))}
            </div>
          </div>
        )}

        <div className="hand-wrap">
          <div className="hand-title">มือของคุณ ({myPlayer.hand.length}/5)</div>
          <div className="hand-row">
            {myPlayer.hand.map((c) => (
              <CardView key={c.id} card={c} disabled={c.type === "defense" || !canAct} onClick={() => handleCardClick(c)} />
            ))}
            {myPlayer.hand.length === 0 && <div className="hand-empty">— ไม่มีการ์ดในมือ —</div>}
          </div>
          <p className="hand-hint">* การ์ดป้องกันใช้เป็นการรีแอคชันเท่านั้น จะขึ้นให้เลือกอัตโนมัติเมื่อถูกโจมตี/เวทมนตร์เป้าหมายคุณ</p>
        </div>

        <div className="log-panel">
          <div className="log-title">📜 บันทึกการต่อสู้</div>
          <div className="log-list">{state.log.map((l, i) => <div key={i} className="log-line">{l}</div>)}</div>
        </div>
      </div>

      {isMyPending && state.currentReaction && state.currentReaction.kind !== "priestChoice" && <ReactionModal state={state} dispatch={dispatch} />}
      {isMyPending && state.currentReaction && state.currentReaction.kind === "priestChoice" && <PriestChoiceModal state={state} dispatch={dispatch} />}
      {isMyPending && state.pendingHandLimit && <HandLimitModal state={state} dispatch={dispatch} myPlayer={myPlayer} />}
      {isMyPending && state.pendingDiscardAll && <DiscardAllModal dispatch={dispatch} myPlayer={myPlayer} />}
      {isMyPending && state.madmanFreePlay && !selecting && <MadmanFreePlayModal state={state} dispatch={dispatch} selectTargetMode={selectTargetMode} myPlayer={myPlayer} />}
      {isMyPending && state.pendingSteal && <StealModal state={state} dispatch={dispatch} myPlayer={myPlayer} />}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}

function GameOverScreen({ state, onRestart }) {
  return (
    <div className="app-bg">
      <StyleBlock />
      <div className="setup-wrap gameover-wrap">
        <div className="crown-icon">👑</div>
        <h1 className="title-font hero-title">{state.winner ? `${state.winner.name} ชนะ!` : "เกมจบแบบไม่มีผู้ชนะ"}</h1>
        {state.winner && <p className="hero-sub">อาชีพ: {CHARS[state.winner.character].name}</p>}
        <p className="hero-sub">รีเฟรชหน้านี้เพื่อกลับไปสร้าง/เข้าห้องใหม่</p>
      </div>
    </div>
  );
}

function App() {
  const g = useSocketGame();

  if (!g.roomCode) {
    return <HomeScreen onCreate={g.createRoom} onJoin={g.joinRoom} errorMsg={g.errorMsg} clearError={() => g.setErrorMsg(null)} />;
  }
  if (g.lobby && !g.lobby.started) {
    return <LobbyScreen lobby={g.lobby} myId={g.myId} isHost={g.isHost} onChooseCharacter={g.chooseCharacter} onStart={g.startGame} errorMsg={g.errorMsg} clearError={() => g.setErrorMsg(null)} />;
  }
  if (g.gameState && g.gameState.phase === "gameover") {
    return <GameOverScreen state={g.gameState} />;
  }
  if (g.gameState && g.gameState.phase === "playing") {
    return <GameScreen state={g.gameState} myId={g.myId} dispatch={g.dispatch} roomCode={g.roomCode} />;
  }
  return (
    <div className="app-bg">
      <StyleBlock />
      <div className="setup-wrap"><p className="hero-sub">กำลังเข้าสู่เกม...</p></div>
    </div>
  );
}

const root = createRoot(document.getElementById("root"));
root.render(<App />);

function StyleBlock() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Thai:wght@600;800&family=Noto+Sans+Thai:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      .app-bg { min-height: 100vh; background: radial-gradient(ellipse at top, #221a12 0%, #0d0b09 60%); font-family: 'Noto Sans Thai', sans-serif; color: #ece3d2; padding: 16px; }
      .title-font { font-family: 'Noto Serif Thai', serif; }

      .setup-wrap { max-width: 560px; margin: 40px auto; background: #1a1410; border: 1px solid #3a2f22; border-radius: 16px; padding: 28px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
      .hero-title { font-size: 28px; color: #d9b968; margin: 0 0 6px; text-align: center; }
      .hero-sub { text-align: center; color: #a89a80; margin: 0 0 20px; font-size: 13px; }
      .setup-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
      .setup-row { display: flex; gap: 8px; align-items: center; }
      .setup-idx { width: 22px; height: 22px; border-radius: 50%; background: #3a2f22; display: flex; align-items: center; justify-content: center; font-size: 12px; color: #d9b968; flex-shrink: 0; }
      .setup-input { flex: 1; background: #241c15; border: 1px solid #3a2f22; border-radius: 8px; padding: 8px 10px; color: #ece3d2; font-size: 13px; }
      .setup-select { background: #241c15; border: 1px solid #3a2f22; border-radius: 8px; padding: 8px 10px; color: #ece3d2; font-size: 13px; }
      .setup-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 8px; }
      .rules-mini { margin-top: 18px; font-size: 11px; color: #7d7161; }
      .inline-icon { vertical-align: -2px; margin-right: 2px; }

      .btn-primary { background: linear-gradient(180deg,#d9b968,#b3873a); color: #241c0a; border: none; border-radius: 10px; padding: 10px 18px; font-weight: 700; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
      .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }
      .btn-secondary { background: #2a2116; color: #d9b968; border: 1px solid #4a3c26; border-radius: 10px; padding: 10px 16px; font-size: 14px; cursor: pointer; }
      .btn-secondary-sm { background: #2a2116; color: #d9b968; border: 1px solid #4a3c26; border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
      .btn-primary-sm { background: linear-gradient(180deg,#d9b968,#b3873a); color: #241c0a; border: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 700; cursor: pointer; }
      .btn-primary-sm:disabled { opacity: 0.4; }
      .btn-ghost-sm { background: transparent; color: #a89a80; border: 1px solid #3a2f22; border-radius: 8px; padding: 6px 10px; font-size: 12px; cursor: pointer; display: inline-flex; align-items:center; gap:4px; }

      .game-shell { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
      .scroll-banner { background: linear-gradient(180deg,#2a2015,#1a140d); border: 1px solid #4a3c26; border-radius: 14px; padding: 12px 18px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .scroll-left { display: flex; align-items: baseline; gap: 8px; }
      .scroll-turn-label { font-size: 11px; color: #a89a80; }
      .scroll-turn-name { font-family:'Noto Serif Thai',serif; font-size: 20px; color: #f0d99a; }
      .scroll-turn-char { font-size: 12px; color: #d9b968; }
      .rune-row { display: flex; gap: 6px; }
      .rune { width: 14px; height: 14px; border-radius: 50%; background: #3a2f22; border: 1px solid #5a4a30; }
      .rune-lit { background: #e8c05e; box-shadow: 0 0 8px #e8c05e; }

      .pass-cover { text-align: center; padding: 60px 20px; background: #1a1410; border: 1px dashed #4a3c26; border-radius: 16px; }
      .crown-icon { color: #d9b968; margin: 0 auto 10px; display: block; }
      .pass-text { font-size: 18px; margin: 6px 0; }
      .pass-sub { font-size: 12px; color: #a89a80; margin-bottom: 16px; }
      .pass-skill-card { text-align: left; background: #241c15; border: 1px solid #4a3c26; border-radius: 12px; padding: 12px 14px; margin: 0 auto 18px; max-width: 420px; }
      .pass-skill-title { font-family:'Noto Serif Thai',serif; font-size: 15px; color: #f0d99a; margin-bottom: 6px; }
      .pass-skill-hp { font-family:'Noto Sans Thai',sans-serif; font-size: 11px; color: #a89a80; margin-left: 6px; }
      .pass-skill-line { font-size: 12px; color: #cfc4ae; margin-bottom: 4px; line-height: 1.4; }
      .skill-reminder { text-align: left; background: #1a1410; border: 1px solid #3a2f22; border-radius: 12px; padding: 10px 14px; }

      .players-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gap: 10px; }
      .player-badge { background: #1a1410; border: 1px solid #3a2f22; border-radius: 12px; padding: 10px; position: relative; }
      .player-current { border-color: #d9b968; box-shadow: 0 0 0 1px #d9b968 inset; }
      .player-dead { opacity: 0.35; }
      .player-selectable { cursor: pointer; border-color: #7a9c6e; }
      .player-selected { border-color: #e8c05e; box-shadow: 0 0 0 2px #e8c05e inset; }
      .player-badge-top { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
      .player-name { font-size: 13px; font-weight: 700; }
      .player-char { font-size: 11px; color: #a89a80; }
      .hp-track { position: relative; height: 14px; background: #241c15; border-radius: 7px; overflow: hidden; border: 1px solid #3a2f22; }
      .hp-fill { height: 100%; background: linear-gradient(90deg,#8f2626,#c23a3a); }
      .hp-text { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #ece3d2; font-weight: 700; }
      .status-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
      .hand-count-row { font-size: 10px; color: #a89a80; display: flex; align-items: center; gap: 4px; margin-top: 4px; }
      .viking-bonus-chip { font-size: 10px; color: #e07850; font-weight: 700; margin-top: 4px; }
      .viking-bonus-line { color: #e07850; font-weight: 600; }
      .status-chip { font-size: 9px; background: #2a2116; border: 1px solid #4a3c26; border-radius: 6px; padding: 2px 5px; display: inline-flex; align-items: center; gap: 3px; }
      .status-bleed { color: #d9534f; }
      .status-ban { color: #c9a227; }
      .status-dead { color: #888; }

      .center-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; font-size: 12px; color: #a89a80; }
      .deck-info { display: flex; align-items: center; gap: 6px; }
      .joker-used-tag { color: #d9b968; }
      .selecting-bar { background: #241c15; border: 1px solid #4a3c26; border-radius: 10px; padding: 6px 10px; display: flex; align-items: center; gap: 8px; }

      .action-bar { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-start; }
      .end-turn-hint { font-size: 12px; color: #e8c05e; background: #2a2116; border: 1px solid #6e5a2a; border-radius: 10px; padding: 6px 12px; }
      .btn-end-turn-glow { border-color: #e8c05e; box-shadow: 0 0 10px rgba(232,192,94,0.5); color: #f0d99a; }
      .btn-action { background: #241c15; border: 1px solid #4a3c26; color: #ece3d2; border-radius: 10px; padding: 9px 14px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
      .btn-action:disabled { opacity: 0.35; cursor: not-allowed; }
      .btn-active { border-color: #6e5aa0; color: #cabbe9; }
      .active-wrap { position: relative; }
      .mini-choice { position: absolute; top: 105%; left: 0; background: #1a1410; border: 1px solid #4a3c26; border-radius: 10px; padding: 8px; display: flex; gap: 6px; z-index: 20; white-space: nowrap; }

      .mage-panel { background: #241c15; border: 1px solid #6e5aa0; border-radius: 12px; padding: 10px; }
      .mage-panel-title { font-size: 12px; color: #cabbe9; margin-bottom: 8px; }
      .mage-subtype-row { display: flex; gap: 6px; align-items: center; margin-top: 8px; flex-wrap: wrap; font-size: 12px; }
      .btn-mage-picked { border-color: #e8c05e; color: #f0d99a; box-shadow: 0 0 6px rgba(232,192,94,0.4); }
      .mage-alt-row { background: #241c15; border: 1px dashed #6e5aa0; border-radius: 10px; padding: 8px; }
      .mage-alt-label { font-size: 11px; color: #cabbe9; display: flex; align-items: center; gap: 4px; margin-bottom: 6px; }

      .hand-wrap { background: #1a1410; border: 1px solid #3a2f22; border-radius: 14px; padding: 12px; }
      .hand-title { font-size: 12px; color: #a89a80; margin-bottom: 8px; }
      .hand-row { display: flex; gap: 8px; flex-wrap: wrap; }
      .hand-empty { font-size: 12px; color: #7d7161; padding: 10px; }
      .hand-hint { font-size: 10px; color: #7d7161; margin-top: 8px; }

      .card-face { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; width: 86px; height: 76px; border-radius: 10px; border: 1px solid; cursor: pointer; font-size: 10px; text-align: center; padding: 6px 4px; line-height: 1.2; }
      .card-sm { width: 72px; height: 64px; font-size: 9px; }
      .card-disabled { opacity: 0.35; cursor: not-allowed; }
      .card-label { font-weight: 600; }
      .card-atk { background: #2a1616; border-color: #8f2626; color: #f0b0b0; }
      .card-def { background: #16241f; border-color: #2f6f63; color: #a8e0d0; }
      .card-heal { background: #16241a; border-color: #3a7d3a; color: #b6e0b0; }
      .card-magic { background: #201a2a; border-color: #6e5aa0; color: #cabbe9; }
      .card-has-img { background-size: cover; background-position: center; justify-content: flex-end; }
      .card-label-img { background: rgba(10,8,5,0.78); border-radius: 6px; padding: 3px 4px; width: 100%; }
      .card-back { background: repeating-linear-gradient(45deg, #241c15, #241c15 6px, #2d2318 6px, #2d2318 12px); border-color: #4a3c26; color: #a89a80; cursor: pointer; }

      .char-viking .player-name { color: #e07850; }
      .char-priest .player-name { color: #d9b968; }
      .char-ninja .player-name { color: #7a9c6e; }
      .char-assassin .player-name { color: #c23a3a; }
      .char-madman .player-name { color: #b45fc2; }
      .char-mage .player-name { color: #6e9ac2; }

      .log-panel { background: #14100c; border: 1px solid #3a2f22; border-radius: 14px; padding: 10px 14px; max-height: 160px; overflow-y: auto; }
      .log-title { font-size: 11px; color: #a89a80; margin-bottom: 6px; }
      .log-list { display: flex; flex-direction: column-reverse; gap: 3px; }
      .log-line { font-size: 11px; color: #cfc4ae; }

      .modal-overlay { position: fixed; inset: 0; background: rgba(10,8,5,0.75); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
      .modal-box { background: #1a1410; border: 1px solid #4a3c26; border-radius: 16px; padding: 22px; max-width: 380px; width: 100%; text-align: center; }
      .modal-wide { max-width: 640px; }
      .modal-icon { color: #d9b968; margin: 0 auto 8px; display: block; }
      .modal-title { font-size: 16px; margin: 0 0 8px; }
      .modal-desc { font-size: 13px; color: #a89a80; margin-bottom: 16px; }
      .modal-note { font-size: 11px; color: #c23a3a; margin-top: 10px; }
      .modal-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }

      .rules-char-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px,1fr)); gap: 10px; margin-bottom: 16px; text-align: left; }
      .rules-char-card { border: 1px solid #3a2f22; border-radius: 10px; padding: 10px; background: #241c15; }
      .rules-char-name { font-weight: 700; margin-bottom: 4px; }
      .rules-char-line { font-size: 11px; color: #cfc4ae; margin-bottom: 3px; }

      .gameover-wrap { text-align: center; }

      .home-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
      .home-tab { flex: 1; background: #241c15; border: 1px solid #3a2f22; color: #a89a80; border-radius: 10px; padding: 8px; font-size: 13px; cursor: pointer; }
      .home-tab-active { border-color: #d9b968; color: #d9b968; }
      .home-error { color: #e08a8a; font-size: 12px; background: #2a1616; border: 1px solid #6b2a2a; border-radius: 8px; padding: 8px 10px; margin-top: 4px; cursor: pointer; }
      .lobby-player-name { flex: 1; font-size: 13px; }
      .lobby-player-char { font-size: 12px; color: #a89a80; }
      .waiting-banner { background: #241c15; border: 1px dashed #4a3c26; border-radius: 10px; padding: 8px 12px; font-size: 12px; color: #d9b968; text-align: center; }
      .room-code-badge { font-size: 11px; color: #a89a80; background: #241c15; border: 1px solid #3a2f22; border-radius: 8px; padding: 4px 8px; margin-right: 6px; }
    `}</style>
  );
}
