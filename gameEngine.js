// Shared authoritative game logic - used by the server only (no React/UI code here).
"use strict";

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

/* ============================================================
   DATA: deck
============================================================ */
let __cid = 0;
const nc = (o) => ({ id: `c${__cid++}`, ...o });

function buildDeck() {
  const d = [];
  for (let i = 0; i < 6; i++) d.push(nc({ type: "attack", subtype: "single", value: 1, label: "โจมตี 1" }));
  for (let i = 0; i < 5; i++) d.push(nc({ type: "attack", subtype: "single", value: 2, label: "โจมตี 2" }));
  for (let i = 0; i < 4; i++) d.push(nc({ type: "attack", subtype: "single", value: 3, label: "โจมตี 3" }));
  for (let i = 0; i < 5; i++) d.push(nc({ type: "attack", subtype: "all", value: 1, label: "โจมตีทุกคน 1" }));
  for (let i = 0; i < 12; i++) d.push(nc({ type: "defense", subtype: "block", label: "ป้องกันทุกอย่าง" }));
  for (let i = 0; i < 4; i++) d.push(nc({ type: "heal", value: 2, label: "ฮีล 2" }));
  for (let i = 0; i < 4; i++) d.push(nc({ type: "heal", value: 5, label: "ฮีล 5" }));
  for (let i = 0; i < 2; i++) d.push(nc({ type: "magic", subtype: "discardAll", label: "ทุกคนทิ้งการ์ด 1 ใบ" }));
  for (let i = 0; i < 2; i++) d.push(nc({ type: "magic", subtype: "swapHand", label: "สลับมือกับผู้เล่น 1 คน" }));
  for (let i = 0; i < 2; i++) d.push(nc({ type: "magic", subtype: "stealCard", label: "ดึงการ์ดจากผู้เล่น 1 คน" }));
  for (let i = 0; i < 2; i++) d.push(nc({ type: "magic", subtype: "drawTwo", label: "จั่วการ์ด 2 ใบ" }));
  for (let i = 0; i < 2; i++) d.push(nc({ type: "magic", subtype: "banActive", label: "แบน Active 1 เทิร์น" }));
  for (let i = 0; i < 2; i++) d.push(nc({ type: "magic", subtype: "cannotAttack", label: "ห้ามโจมตี 1 เทิร์น" }));
  d.push(nc({ type: "magic", subtype: "joker", label: "🃏 Joker: สลับอาชีพทั้งหมด" }));
  return d;
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function vikingBonus(hp) {
  if (hp >= 13) return 0;
  if (hp >= 11) return 1;
  if (hp >= 8) return 2;
  if (hp >= 6) return 3;
  if (hp >= 1) return 4;
  return 4;
}
function attackBonus(p) {
  let b = 0;
  if (p.character === "viking") b += vikingBonus(p.hp);
  return b;
}
function startingHandSize(n) {
  if (n === 2) return 1;
  if (n === 3) return 2;
  return 3;
}

/* ============================================================
   REDUCER
============================================================ */
const initialState = { phase: "setup" };

function newPlayer(id, name, character) {
  return {
    id, name, character, hp: CHARS[character].hp, maxHp: CHARS[character].hp,
    hand: [], alive: true,
    bleeding: false, banActiveTurns: 0, cannotAttackTurns: 0,
    cannotDefendSelf: false, assassinBuff: false, usedActiveThisTurn: false,
  };
}

function log(state, text) {
  state.log = [text, ...state.log].slice(0, 60);
}

function draw(state, playerId, n = 1) {
  const p = state.players.find((x) => x.id === playerId);
  const drawn = [];
  for (let i = 0; i < n; i++) {
    if (state.deck.length === 0) {
      if (state.discard.length === 0) break;
      state.deck = shuffle(state.discard);
      state.discard = [];
      log(state, "🔄 กองการ์ดหมด — สลับกองทิ้งเป็นกองใหม่");
    }
    const c = state.deck.shift();
    if (c) { p.hand.push(c); drawn.push(c); }
  }
  return drawn;
}

function toDiscard(state, card) {
  if (card.subtype === "joker") { state.jokerRemoved = true; return; }
  state.discard.push(card);
}

function removeFromHand(p, cardId) {
  const idx = p.hand.findIndex((c) => c.id === cardId);
  if (idx >= 0) return p.hand.splice(idx, 1)[0];
  return null;
}

function alivePlayers(state) { return state.players.filter((p) => p.alive); }

function checkWin(state) {
  const alive = alivePlayers(state);
  if (alive.length <= 1) {
    state.phase = "gameover";
    state.winner = alive[0] || null;
  }
}

function enforceHandLimit(state, playerId) {
  const p = state.players.find((x) => x.id === playerId);
  if (p && p.hand.length > 5) {
    state.pendingHandLimit = { playerId, need: p.hand.length - 5 };
  }
}

function killIfDead(state, p, killerId) {
  if (p.hp <= 0 && p.alive) {
    p.alive = false;
    p.hp = 0;
    log(state, `💀 ${p.name} (${CHARS[p.character].name}) ถูกกำจัดออกจากเกม!`);
    checkWin(state);
    return true;
  }
  return false;
}

function healPlayer(state, p, amount) {
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  if (p.bleeding) { p.bleeding = false; log(state, `🩸 ${p.name} หายจาก Bleeding แล้ว`); }
  log(state, `💚 ${p.name} ฟื้นฟู ${p.hp - before} HP (${p.hp}/${p.maxHp})`);
}

// apply raw damage, returns {died, dealt}
function dealDamage(state, target, amount, attacker) {
  const before = target.hp;
  target.hp = Math.max(0, target.hp - amount);
  const dealt = before - target.hp;
  log(state, `⚔️ ${attacker ? attacker.name : "?"} โจมตี ${target.name} ${dealt} ดาเมจ (${target.hp}/${target.maxHp})`);
  const died = killIfDead(state, target, attacker && attacker.id);
  return { died, dealt };
}

function canDefend(state, attacker, target) {
  if (target.cannotDefendSelf) return false;
  if (attacker && attacker.character === "assassin" && target.hp <= 4) return false;
  return target.hand.some((c) => c.type === "defense");
}

// queue a reaction opportunity; processed one at a time via state.currentReaction
function queueReaction(state, item) { state.reactionQueue.push(item); }

function pumpReactionQueue(state) {
  if (!state.currentReaction && state.reactionQueue.length > 0) {
    state.currentReaction = state.reactionQueue.shift();
  }
}

function endActionCheck(state) {
  // Turn advancement is now always explicit via the END_TURN action (see reducer "END_TURN").
  // Running out of actions no longer auto-ends the turn; the player must press "จบเทิร์น".
}

function startOfTurnEffects(state) {
  const p = state.players[state.currentIndex];
  if (!p.alive) return;
  if (p.bleeding) {
    p.hp = Math.max(0, p.hp - 2);
    log(state, `🩸 ${p.name} เสีย 2 HP จาก Bleeding (${p.hp}/${p.maxHp})`);
    killIfDead(state, p);
  }
}

function advanceTurn(state) {
  if (state.phase === "gameover") return;
  // end-of-turn status decay for the player whose turn is ending
  const cur = state.players[state.currentIndex];
  if (cur.banActiveTurns > 0) cur.banActiveTurns -= 1;
  if (cur.cannotAttackTurns > 0) cur.cannotAttackTurns -= 1;
  cur.assassinBuff = false;
  // find next alive player
  let i = state.currentIndex;
  for (let step = 0; step < state.players.length; step++) {
    i = (i + 1) % state.players.length;
    if (state.players[i].alive) break;
  }
  state.currentIndex = i;
  state.actionsLeft = 3;
  const next = state.players[i];
  next.usedActiveThisTurn = false;
  if (next.character === "assassin" && next.cannotDefendSelf) next.cannotDefendSelf = false;
  log(state, `— เทิร์นของ ${next.name} (${CHARS[next.character].name}) —`);
  startOfTurnEffects(state);
  checkWin(state);
}

function madmanCheckOnDraw(state, player, drawnCards) {
  if (player.character !== "madman") return;
  const atkIds = drawnCards
    .filter((c) => c.type === "attack" && player.hand.some((h) => h.id === c.id))
    .map((c) => c.id);
  if (atkIds.length === 0) return;
  if (state.madmanFreePlay && state.madmanFreePlay.playerId === player.id) {
    state.madmanFreePlay.queue.push(...atkIds);
  } else {
    state.madmanFreePlay = { playerId: player.id, queue: atkIds, playedCount: 0 };
  }
}

function reducer(state, action) {
  const s = structuredClone(state);
  switch (action.type) {
    case "INIT_GAME": {
      const { setups } = action; // [{name, character}]
      const players = setups.map((st, idx) => newPlayer(`p${idx}`, st.name || `ผู้เล่น ${idx + 1}`, st.character));
      const deck = shuffle(buildDeck());
      const ns = {
        phase: "playing",
        players, deck, discard: [],
        currentIndex: 0, actionsLeft: 3,
        log: [], reactionQueue: [], currentReaction: null,
        pendingHandLimit: null, pendingDiscardAll: null,
        madmanFreePlay: null, jokerRemoved: false, winner: null, pendingSteal: null,
      };
      const n = players.length;
      players.forEach((p) => draw(ns, p.id, startingHandSize(n)));
      log(ns, `🎮 เริ่มเกม! ${n} ผู้เล่น — เทิร์นของ ${players[0].name} (${CHARS[players[0].character].name})`);
      startOfTurnEffects(ns);
      return ns;
    }

    case "DRAW_ACTION": {
      if (s.actionsLeft < 1) return s;
      const p = s.players[s.currentIndex];
      s.actionsLeft -= 1;
      const drawn = draw(s, p.id, 1);
      log(s, `🃏 ${p.name} จั่วการ์ด 1 ใบ`);
      madmanCheckOnDraw(s, p, drawn);
      if (!s.madmanFreePlay) enforceHandLimit(s, p.id);
      endActionCheck(s);
      return s;
    }

    case "REBUILD_HAND": {
      if (s.actionsLeft < 3) return s;
      const p = s.players[s.currentIndex];
      p.hand.forEach((c) => toDiscard(s, c));
      p.hand = [];
      s.actionsLeft -= 3;
      const drawn = draw(s, p.id, 3);
      log(s, `♻️ ${p.name} รีมือ: ทิ้งการ์ดทั้งหมดและจั่วใหม่ 3 ใบ (จบเทิร์นทันที)`);
      madmanCheckOnDraw(s, p, drawn);
      s.actionsLeft = 0;
      if (!s.madmanFreePlay) advanceTurn(s);
      return s;
    }

    case "PLAY_CARD": {
      const { cardId, targetIds = [] } = action;
      const p = s.players[s.currentIndex];
      const card = p.hand.find((c) => c.id === cardId);
      if (!card) return s;
      if (s.actionsLeft < 1) return s;
      if (card.type === "attack" && p.cannotAttackTurns > 0) { log(s, `🚫 ${p.name} ยังโจมตีไม่ได้ (ติดสถานะ)`); return s; }
      removeFromHand(p, cardId);
      s.actionsLeft -= 1;
      resolvePlayedCard(s, p, card, targetIds);
      pumpReactionQueue(s);
      endActionCheck(s);
      return s;
    }

    case "MAGE_SUBSTITUTE_ATTACK": {
      const { cardId, targetIds } = action;
      const p = s.players[s.currentIndex];
      if (p.character !== "mage") return s;
      const card = p.hand.find((c) => c.id === cardId && c.type === "magic");
      if (!card) return s;
      if (s.actionsLeft < 1) return s;
      if (p.cannotAttackTurns > 0) { log(s, `🚫 ${p.name} ยังโจมตีไม่ได้`); return s; }
      removeFromHand(p, cardId);
      s.actionsLeft -= 1;
      const mt = s.players.find((x) => x.id === targetIds[0]);
      if (mt) queueAttackReaction(s, p, mt, 3 + attackBonus(p), null, false);
      toDiscard(s, card);
      pumpReactionQueue(s);
      endActionCheck(s);
      return s;
    }

    case "USE_ACTIVE": {
      const p = s.players[s.currentIndex];
      const def = CHARS[p.character];
      if (p.banActiveTurns > 0) { log(s, `🚫 ${p.name} ถูกแบน Active เทิร์นนี้`); return s; }
      if (p.usedActiveThisTurn) { log(s, `🚫 ${p.name} ใช้ Active ไปแล้วในเทิร์นนี้`); return s; }
      if (s.actionsLeft < def.activeCost) return s;
      s.actionsLeft -= def.activeCost;
      p.usedActiveThisTurn = true;
      applyActiveSkill(s, p, action);
      pumpReactionQueue(s);
      endActionCheck(s);
      return s;
    }

    case "RESOLVE_REACTION": {
      resolveReaction(s, action);
      pumpReactionQueue(s);
      endActionCheck(s);
      return s;
    }

    case "RESOLVE_PRIEST_CHOICE": {
      const p = s.players.find((x) => x.id === action.playerId);
      if (action.choice === "heal") healPlayer(s, p, 1);
      else if (s.priestReflect) {
        const src = s.players.find((x) => x.id === s.priestReflect.attackerId);
        if (src) applyReflect(s, p, src, s.priestReflect);
      }
      s.priestReflect = null;
      s.currentReaction = null;
      if (s._deferredFinalizeCard) { finalizeAttackCardIfDone(s, s._deferredFinalizeCard); s._deferredFinalizeCard = null; }
      pumpReactionQueue(s);
      endActionCheck(s);
      return s;
    }

    case "RESOLVE_HAND_LIMIT": {
      const { playerId, cardId } = action;
      const p = s.players.find((x) => x.id === playerId);
      const c = removeFromHand(p, cardId);
      if (c) toDiscard(s, c);
      if (p.hand.length <= 5) s.pendingHandLimit = null;
      else s.pendingHandLimit = { playerId, need: p.hand.length - 5 };
      endActionCheck(s);
      return s;
    }

    case "RESOLVE_DISCARD_ALL": {
      const { playerId, cardId } = action;
      const p = s.players.find((x) => x.id === playerId);
      if (cardId) { const c = removeFromHand(p, cardId); if (c) toDiscard(s, c); }
      s.pendingDiscardAll.shift();
      if (s.pendingDiscardAll.length === 0) s.pendingDiscardAll = null;
      endActionCheck(s);
      return s;
    }

    case "MADMAN_FREE_PLAY": {
      const { play, targetIds } = action;
      const mfp = s.madmanFreePlay;
      if (!mfp || mfp.queue.length === 0) return s;
      const p = s.players.find((x) => x.id === mfp.playerId);
      const cardId = mfp.queue.shift();
      const card = p.hand.find((c) => c.id === cardId);
      if (play && card) {
        removeFromHand(p, card.id);
        resolvePlayedCard(s, p, card, targetIds || []);
        mfp.playedCount += 1;
      }
      if (mfp.queue.length === 0 || mfp.playedCount >= 2) {
        s.madmanFreePlay = null;
        enforceHandLimit(s, p.id);
      }
      pumpReactionQueue(s);
      endActionCheck(s);
      return s;
    }

    case "RESOLVE_STEAL": {
      if (!s.pendingSteal) return s;
      const { sourceId, targetId } = s.pendingSteal;
      const src = s.players.find((x) => x.id === sourceId);
      const tgt = s.players.find((x) => x.id === targetId);
      const c = removeFromHand(tgt, action.cardId);
      if (c) {
        src.hand.push(c);
        log(s, `🫳 ${src.name} เลือกดึงการ์ด "${c.label}" จาก ${tgt.name}`);
        enforceHandLimit(s, src.id);
      }
      s.pendingSteal = null;
      endActionCheck(s);
      return s;
    }

    case "END_TURN": {
      if (s.currentReaction || s.reactionQueue.length || s.pendingHandLimit || s.pendingDiscardAll || s.pendingSteal) return s;
      s.actionsLeft = 0;
      advanceTurn(s);
      return s;
    }

    default:
      return s;
  }
}

/* ---------- card resolution ---------- */
function resolvePlayedCard(state, player, card, targetIds) {
  if (card.type === "attack") {
    const buffed = player.character === "assassin" && player.assassinBuff;
    const dmg = card.value + attackBonus(player) + (buffed ? 4 : 0);
    state.pendingAssassinKillCard = buffed ? { card, killed: false } : null;
    let targets;
    if (card.subtype === "all" || buffed) {
      targets = alivePlayers(state).filter((x) => x.id !== player.id);
    } else {
      const t = state.players.find((x) => x.id === targetIds[0]);
      targets = t ? [t] : [];
    }
    targets.forEach((t) => queueAttackReaction(state, player, t, dmg, card, buffed));
    finalizeAttackCardIfDone(state, card);
  } else if (card.type === "heal") {
    healPlayer(state, player, card.value);
    toDiscard(state, card);
  } else if (card.type === "magic") {
    resolveMagic(state, player, card, targetIds);
  }
}

// discardCardAfter: whether to discard the attack card after all reactions resolve (handled at finalize)
function queueAttackReaction(state, attacker, target, dmg, card, isAssassinTracked) {
  queueReaction(state, {
    kind: "attack", attackerId: attacker.id, targetId: target.id, amount: dmg, card,
    canDefend: canDefend(state, attacker, target), trackAssassinKill: !!isAssassinTracked,
  });
}

function finalizeAttackCardIfDone(state, card) {
  if (!card) return;
  // discard the attack card once no more queued/current reactions reference it
  const stillPending = state.currentReaction?.card === card || state.reactionQueue.some((r) => r.card === card);
  if (!stillPending) {
    if (state.pendingAssassinKillCard && state.pendingAssassinKillCard.card === card) {
      if (state.pendingAssassinKillCard.killed) {
        const attacker = state.players[state.currentIndex];
        attacker.hand.push(card);
        state.actionsLeft += 1;
        log(state, `🗡️ ${attacker.name} สังหารสำเร็จ! นำการ์ดกลับมือ +1 Action`);
      } else {
        toDiscard(state, card);
      }
      state.pendingAssassinKillCard = null;
    } else {
      toDiscard(state, card);
    }
  }
}

function resolveMagic(state, player, card, targetIds) {
  switch (card.subtype) {
    case "discardAll": {
      const targets = alivePlayers(state).filter((p) => p.id !== player.id).map((p) => p.id);
      state.pendingDiscardAll = targets;
      toDiscard(state, card);
      break;
    }
    case "drawTwo": {
      const drawn = draw(state, player.id, 2);
      log(state, `🃏 ${player.name} จั่วการ์ด 2 ใบ (Magic)`);
      madmanCheckOnDraw(state, player, drawn);
      if (!state.madmanFreePlay) enforceHandLimit(state, player.id);
      toDiscard(state, card);
      break;
    }
    case "joker": {
      const chars = shuffle(Object.keys(CHARS));
      state.players.forEach((p, i) => {
        p.character = chars[i % chars.length];
        p.maxHp = CHARS[p.character].hp;
        if (p.hp > p.maxHp) p.hp = p.maxHp;
      });
      log(state, `🃏 JOKER! อาชีพของทุกคนถูกสลับใหม่! (HP และมือการ์ดเดิมไม่เปลี่ยน)`);
      toDiscard(state, card);
      break;
    }
    case "swapHand": case "stealCard": case "banActive": case "cannotAttack": {
      const target = state.players.find((x) => x.id === targetIds[0]);
      if (!target) { toDiscard(state, card); break; }
      queueReaction(state, {
        kind: "magic", subtype: card.subtype, attackerId: player.id, targetId: target.id, card,
        canDefend: canDefend(state, player, target),
      });
      break;
    }
    default: toDiscard(state, card);
  }
}

function applyMagicEffect(state, sourceId, targetId, subtype) {
  const src = state.players.find((x) => x.id === sourceId);
  const tgt = state.players.find((x) => x.id === targetId);
  if (subtype === "swapHand") {
    const tmp = src.hand; src.hand = tgt.hand; tgt.hand = tmp;
    log(state, `🔀 ${src.name} สลับมือกับ ${tgt.name}`);
    enforceHandLimit(state, src.id); enforceHandLimit(state, tgt.id);
  } else if (subtype === "stealCard") {
    if (tgt.hand.length > 0) {
      const idx = Math.floor(Math.random() * tgt.hand.length);
      const c = tgt.hand.splice(idx, 1)[0];
      src.hand.push(c);
      log(state, `🫳 ${src.name} ดึงการ์ด 1 ใบจาก ${tgt.name}`);
      enforceHandLimit(state, src.id);
    }
  } else if (subtype === "banActive") {
    tgt.banActiveTurns = 1;
    log(state, `🚫 ${tgt.name} ถูกแบน Active 1 เทิร์น`);
  } else if (subtype === "cannotAttack") {
    tgt.cannotAttackTurns = 1;
    log(state, `🚫 ${tgt.name} ห้ามโจมตี 1 เทิร์น`);
  }
}

function applyReflect(state, defender, source, reactionData) {
  // reflect the blocked effect back onto its source
  if (reactionData.kind === "attack") {
    dealDamage(state, source, reactionData.amount, defender);
  } else if (reactionData.kind === "magic") {
    applyMagicEffect(state, defender.id, source.id, reactionData.subtype);
  }
}

function resolveAttackHit(state, attacker, targetIds, dmg, cardMeta) {
  targetIds.forEach((tid) => {
    const t = state.players.find((x) => x.id === tid);
    if (t) queueAttackReaction(state, attacker, t, dmg, cardMeta, false);
  });
}

/* ---------- reaction resolution (defense decision) ---------- */
function resolveReaction(state, action) {
  const r = state.currentReaction;
  if (!r) return;
  const defender = state.players.find((x) => x.id === r.targetId);
  const attacker = state.players.find((x) => x.id === r.attackerId);
  state.currentReaction = null;
  const blocked = !!(action.useDefense && r.canDefend);

  if (blocked) {
    const defCard = defender.hand.find((c) => c.type === "defense");
    removeFromHand(defender, defCard.id);
    toDiscard(state, defCard);
    log(state, `🛡️ ${defender.name} ป้องกันสำเร็จ!`);
  } else if (r.kind === "attack") {
    const { died } = dealDamage(state, defender, r.amount, attacker);
    if (died && r.trackAssassinKill && state.pendingAssassinKillCard) state.pendingAssassinKillCard.killed = true;
    if (attacker.character === "ninja") {
      if (!died) { defender.bleeding = true; log(state, `🩸 ${defender.name} ติด Bleeding!`); }
      const dr = draw(state, attacker.id, 1);
      madmanCheckOnDraw(state, attacker, dr);
      if (!state.madmanFreePlay) enforceHandLimit(state, attacker.id);
    }
  } else if (r.kind === "magic") {
    if (r.subtype === "stealCard") {
      if (defender.hand.length > 0) state.pendingSteal = { sourceId: attacker.id, targetId: defender.id };
    } else {
      applyMagicEffect(state, attacker.id, defender.id, r.subtype);
    }
  }

  // the magic card is always spent once its reaction is resolved (blocked or not)
  if (r.kind === "magic") toDiscard(state, r.card);

  if (blocked && defender.character === "priest") {
    state.priestReflect = { ...r };
    state.currentReaction = { kind: "priestChoice", playerId: defender.id, data: r };
    if (r.kind === "attack") state._deferredFinalizeCard = r.card;
    return;
  }

  if (r.kind === "attack") finalizeAttackCardIfDone(state, r.card);
}

/* ---------- active skills ---------- */
function applyActiveSkill(state, p, action) {
  if (p.character === "viking") {
    if (action.choice === "heal") healPlayer(state, p, 2);
    else { p.hp = Math.max(0, p.hp - 2); log(state, `${p.name} ลด HP ตัวเอง 2 (เพิ่มโบนัสโจมตี)`); killIfDead(state, p); }
  } else if (p.character === "priest") {
    let pulled = 0;
    for (let i = state.discard.length - 1; i >= 0 && pulled < 2; i--) {
      if (state.discard[i].type === "defense") { p.hand.push(state.discard.splice(i, 1)[0]); pulled++; }
    }
    log(state, `${p.name} หยิบการ์ดป้องกัน ${pulled} ใบจากกองทิ้ง`);
    enforceHandLimit(state, p.id);
  } else if (p.character === "ninja") {
    (action.targetIds || []).slice(0, 2).forEach((tid) => {
      const t = state.players.find((x) => x.id === tid);
      if (t) { t.bleeding = true; }
    });
    log(state, `${p.name} ทำให้ผู้เล่นที่เลือกติด Bleeding`);
  } else if (p.character === "assassin") {
    p.cannotDefendSelf = true;
    p.assassinBuff = true;
    log(state, `${p.name} เข้าสู่โหมดสังหาร! โจมตี +4 และกลายเป็นวงกว้างเทิร์นนี้`);
  } else if (p.character === "madman") {
    if (action.choice === "reset") {
      state.players.forEach((pl) => { pl.hand.forEach((c) => toDiscard(state, c)); pl.hand = []; });
      state.players.forEach((pl) => {
        const drawn = draw(state, pl.id, 3);
        if (pl.id === p.id) madmanCheckOnDraw(state, pl, drawn);
        else enforceHandLimit(state, pl.id);
      });
      log(state, `${p.name} ให้ทุกคนคืนการ์ดและจั่วใหม่ 3 ใบ`);
    } else {
      const n = state.players.length;
      const hands = state.players.map((pl) => pl.hand);
      for (let i = 0; i < n; i++) {
        const fromIdx = (i - 1 + n) % n;
        state.players[i].hand = hands[fromIdx];
      }
      log(state, `${p.name} ให้ทุกคนส่งมือทั้งหมดให้คนถัดไป`);
    }
  } else if (p.character === "mage") {
    const ids = (action.cardIds || []).slice(0, 2);
    const subtypes = action.subtypes || {};
    ids.forEach((cid) => {
      const c = p.hand.find((x) => x.id === cid);
      const sub = subtypes[cid] || "drawTwo";
      if (c) { c.type = "magic"; c.subtype = sub; c.value = undefined; c.label = MAGIC_SUBTYPE_LABEL[sub] || "การ์ด Magic (แปลงแล้ว)"; }
    });
    log(state, `${p.name} แปลงการ์ด ${ids.length} ใบเป็น Magic`);
  }
}

const MAGIC_SUBTYPE_LABEL = {
  discardAll: "ทุกคนทิ้งการ์ด 1 ใบ", swapHand: "สลับมือกับผู้เล่น 1 คน", stealCard: "ดึงการ์ดจากผู้เล่น 1 คน",
  drawTwo: "จั่วการ์ด 2 ใบ", banActive: "แบน Active 1 เทิร์น", cannotAttack: "ห้ามโจมตี 1 เทิร์น",
};

module.exports = {
  CHARS, CHAR_LIST, buildDeck, shuffle, vikingBonus, attackBonus, startingHandSize,
  initialState, newPlayer, reducer, alivePlayers, MAGIC_SUBTYPE_LABEL,
};
