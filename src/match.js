// A match: create it from a config, advance it one fixed tick at a time with
// per-seat button states. Pure data in, pure data out: no DOM, no clock, no
// Math.random. The same seed and the same inputs always give the same state.

import { BLAST, MATCH, TILE } from "./constants.js";
import { seedToU32, randInt } from "./rng.js";
import { stageById, buildTiles } from "./stages.js";
import { addEvent, blame, currentBlame } from "./common.js";
import { newPlayer, controlPlayer, movePlayer, rideTile, surfaces, applyLoad, tickPlayer } from "./players.js";
import { resolveContacts } from "./contact.js";
import { updateTiles, addTempTile, isSolid, breakTile, damageTile } from "./tiles.js";
import { castMoves, updateDrill } from "./characters.js";
import { updateObjects } from "./objects.js";
import { updateHazards, newHazardState, hazardKill } from "./hazards.js";
import { botButtons, newBotMemory } from "./bot.js";

export const SIM_VERSION = 1;

// config: { seed, stage, stocks, seats: [{ kind: "human"|"bot", character, difficulty }] }
export function createMatch(config = {}) {
  const stage = stageById(config.stage || "yard");
  const seats = (config.seats && config.seats.length ? config.seats : [{ kind: "human" }, { kind: "bot" }]).slice(0, 4);
  const stocks = config.stocks || 3;
  const seed = seedToU32(config.seed ?? 1);
  const tiles = buildTiles(stage);
  const state = {
    version: SIM_VERSION,
    tick: 0,
    seed,
    rng: seed,
    botRng: (seed ^ 0x9e3779b9) >>> 0,
    stageId: stage.id,
    stocks,
    phase: "intro", // "intro" | "play" | "over"
    phaseTimer: MATCH.introTicks,
    playTicks: 0,
    overtime: 0,
    respawnMult: 1,
    hazardMult: 1,
    collapse: false,
    tiles,
    baseTiles: tiles.length,
    nextTileId: 100000,
    players: seats.map((s, i) => newPlayer(i, s, stocks)),
    objects: [],
    nextObjectId: 1,
    hazards: newHazardState(stage),
    wind: 0,
    contactCooldown: new Array(16).fill(0),
    bots: seats.map((s) => (s.kind === "bot" ? newBotMemory() : null)),
    feed: [], // elimination feed: { tick, seat, by, cause }
    eliminationOrder: [],
    result: null,
    events: [],
  };
  // Everyone starts on a halo at a distinct spawn point.
  state.players.forEach((p, i) => {
    const sp = stage.spawns[i % stage.spawns.length];
    placeOnHalo(state, p, sp, MATCH.introTicks + MATCH.haloTicks);
    p.invuln = 0;
  });
  return state;
}

function placeOnHalo(state, p, sp, life) {
  const halo = addTempTile(state, {
    kind: "halo",
    x: sp.x - MATCH.haloWidth / 2,
    y: sp.y,
    w: MATCH.haloWidth,
    h: TILE.h - 6,
    owner: p.seat,
    life,
  });
  p.x = sp.x - p.w / 2;
  p.y = sp.y - p.h;
  p.vx = 0;
  p.vy = 0;
  p.ground = { kind: "tile", id: halo.id };
  p.groundTop = halo.y;
  p.supportTiles = [halo.id];
  p.jumpsLeft = p.airJumps;
  p.drill = 0;
  p.blame = null;
  p.launched = 0;
  p.slow = 0;
  p.invuln = MATCH.invulnTicks;
  p.stats.lifeTicks = 0;
}

// Advance one tick. inputs[seat] is that seat's button bitmask; bot seats
// ignore it and think for themselves.
export function step(state, inputs = []) {
  state.events = [];
  state.tick++;
  const stage = stageById(state.stageId);

  if (state.phase === "intro") {
    state.phaseTimer--;
    if (state.phaseTimer % 60 === 0 && state.phaseTimer > 0) addEvent(state, { type: "count", n: state.phaseTimer / 60 });
    if (state.phaseTimer <= 0) {
      state.phase = "play";
      addEvent(state, { type: "go" });
    }
  }
  const live = state.phase !== "intro";

  // Moving floors carry whoever stands on them.
  if (live) for (const p of state.players) if (p.status === "play") rideTile(state, p);

  // Buttons for this tick.
  for (const p of state.players) {
    p.prevBtn = p.btn;
    if (!live || p.status !== "play") {
      p.btn = 0;
    } else if (p.kind === "bot") {
      p.btn = botButtons(state, p.seat);
    } else {
      p.btn = (inputs[p.seat] | 0) & 127;
    }
  }

  if (live) {
    // Players act and move.
    for (const p of state.players) {
      if (p.status !== "play") continue;
      controlPlayer(state, p);
      if (state.phase === "play") castMoves(state, p);
      updateDrill(state, p);
      applyWind(state, p);
    }
    const surfs = surfaces(state);
    const walls = state.objects.filter((o) => o.solid);
    for (const p of state.players) if (p.status === "play") movePlayer(state, p, surfs, walls);
    resolveContacts(state);
    for (const p of state.players) {
      if (p.status !== "play") continue;
      applyLoad(state, p);
      tickPlayer(state, p);
      updateHalo(state, p);
    }
    updateObjects(state);
    updateHazards(state, stage);
  }
  updateTiles(state);

  if (live) {
    checkEliminations(state);
    updateRespawns(state, stage);
    if (state.phase === "play") updatePressure(state);
    checkEnd(state);
  }
  return state;
}

function applyWind(state, p) {
  if (state.wind !== 0 && p.invuln === 0) {
    p.vx += state.wind * (p.ground ? 0.8 : 1);
    p.windTicks = 2;
  }
  for (const o of state.objects) {
    if (o.type !== "gust" || o.armed > 0) continue;
    const cx = p.x + p.w / 2;
    const cy = p.y + p.h / 2;
    const d = (cx - o.x) * o.dir;
    if (d < 0 || d > o.len || cy < o.y - o.hh || cy > o.y + o.hh) continue;
    p.vx += o.dir * o.force * (1 - (0.5 * d) / o.len);
    p.windTicks = 2;
    blame(state, p, o.owner, "gust");
  }
}

// A halo vanishes once its owner steps off it.
function updateHalo(state, p) {
  for (const t of state.tiles) {
    if (t.kind !== "halo" || t.owner !== p.seat || t.state !== "solid") continue;
    const onIt = p.ground && p.ground.kind === "tile" && p.ground.id === t.id;
    if (!onIt && state.phase === "play" && t.age > 6) {
      t.life = 1; // gone next tile update
    }
  }
}

function outOfBounds(p) {
  return p.x + p.w < BLAST.left || p.x > BLAST.right || p.y > BLAST.bottom || p.y + p.h < BLAST.top;
}

function checkEliminations(state) {
  for (const p of state.players) {
    if (p.status !== "play") continue;
    let cause = null;
    if (outOfBounds(p)) cause = p.y + p.h < BLAST.top ? "top" : p.y > BLAST.bottom ? "fall" : "side";
    else if (p.invuln === 0) cause = hazardKill(state, p);
    if (cause) eliminate(state, p, cause);
  }
}

export function eliminate(state, p, cause) {
  const b = currentBlame(state, p);
  const by = b ? b.seat : -1;
  p.stocks--;
  p.stats.deaths++;
  p.stats.longestLife = Math.max(p.stats.longestLife, p.stats.lifeTicks);
  if (by >= 0) state.players[by].stats.kos++;
  else p.stats.falls++;
  state.feed.push({ tick: state.tick, seat: p.seat, by, cause: b ? b.cause : cause, how: cause });
  if (state.feed.length > 8) state.feed.shift();
  addEvent(state, {
    type: "ko",
    seat: p.seat,
    by,
    cause: b ? b.cause : cause,
    x: Math.max(0, Math.min(1600, p.x + p.w / 2)),
    y: Math.max(0, Math.min(900, p.y + p.h / 2)),
    stocks: p.stocks,
  });
  p.vx = 0;
  p.vy = 0;
  p.ground = null;
  p.supportTiles = [];
  p.drill = 0;
  p.blame = null;
  p.koTick = state.tick;
  for (const t of state.tiles) if (t.kind === "halo" && t.owner === p.seat) t.life = 1;
  if (p.stocks <= 0) {
    p.status = "out";
    state.eliminationOrder.push(p.seat);
  } else {
    p.status = "dead";
    p.respawnTimer = MATCH.respawnDelay;
  }
}

function updateRespawns(state, stage) {
  for (const p of state.players) {
    if (p.status !== "dead") continue;
    p.respawnTimer--;
    if (p.respawnTimer > 0) continue;
    // The spawn point farthest from everyone still playing.
    let best = stage.spawns[0];
    let bestD = -1;
    for (const sp of stage.spawns) {
      let d = 1e9;
      for (const q of state.players) {
        if (q === p || q.status !== "play") continue;
        const dx = q.x + q.w / 2 - sp.x;
        const dy = q.y + q.h - sp.y;
        d = Math.min(d, dx * dx + dy * dy);
      }
      if (d > bestD) {
        bestD = d;
        best = sp;
      }
    }
    p.status = "play";
    placeOnHalo(state, p, best, MATCH.haloTicks);
    addEvent(state, { type: "respawn", seat: p.seat, x: best.x, y: best.y });
  }
}

// Overtime and collapse: the longer a match runs, the slower the stage comes
// back, until it stops coming back at all. Every match ends.
function updatePressure(state) {
  state.playTicks++;
  const t = state.playTicks;
  if (t >= MATCH.overtimeAt) {
    const level = 1 + Math.floor((t - MATCH.overtimeAt) / MATCH.overtimeStep);
    if (level !== state.overtime) {
      state.overtime = level;
      state.respawnMult = 1 + 0.5 * level;
      state.hazardMult = Math.max(0.4, 1 - 0.15 * level);
      addEvent(state, { type: "overtime", level });
    }
  }
  if (t >= MATCH.collapseAt) {
    if (!state.collapse) {
      state.collapse = true;
      addEvent(state, { type: "collapse" });
    }
    if (t % MATCH.collapseEvery === 0) {
      const solid = state.tiles.filter((x) => x.kind === "crumble" && isSolid(x) && x.stress < 0.75);
      if (solid.length) {
        const tile = solid[randInt(state, 0, solid.length - 1)];
        tile.stress = 0.75;
      }
    }
    if (t % MATCH.collapseSturdyEvery === 0) {
      for (const x of state.tiles) if ((x.kind === "sturdy" || x.kind === "ledge") && isSolid(x)) damageTile(state, x, 1, -1, "collapse");
    }
    // Once nothing respawns, any tile still gone stays gone; halos are the
    // only new ground, and they do not last.
  }
}

function checkEnd(state) {
  if (state.phase === "over") {
    if (state.phaseTimer > 0) state.phaseTimer--;
    return;
  }
  if (state.phase !== "play") return;
  const standing = state.players.filter((p) => p.status !== "out");
  if (standing.length > 1) return;
  // Ranking: the survivor, then the eliminated in reverse order. Players
  // eliminated on the same tick are ordered by credited eliminations, then
  // fewer self-eliminations, then platforms broken, then seat.
  const order = [];
  if (standing.length === 1) order.push(standing[0].seat);
  const byTick = new Map();
  for (const seat of state.eliminationOrder) {
    const p = state.players[seat];
    if (!byTick.has(p.koTick)) byTick.set(p.koTick, []);
    byTick.get(p.koTick).push(p);
  }
  const ticks = [...byTick.keys()].sort((a, b) => b - a);
  for (const tk of ticks) {
    const group = byTick.get(tk).slice().sort(tieBreak);
    for (const p of group) order.push(p.seat);
  }
  order.forEach((seat, i) => (state.players[seat].place = i + 1));
  for (const p of state.players) p.stats.longestLife = Math.max(p.stats.longestLife, p.stats.lifeTicks);
  state.phase = "over";
  state.phaseTimer = MATCH.endDelay;
  state.result = { winner: order[0], ranking: order, ticks: state.playTicks, tied: standing.length === 0 };
  addEvent(state, { type: "win", seat: order[0] });
}

function tieBreak(a, b) {
  return (
    b.stats.kos - a.stats.kos ||
    a.stats.falls - b.stats.falls ||
    b.stats.tilesBroken + b.stats.slabsBroken - (a.stats.tilesBroken + a.stats.slabsBroken) ||
    a.seat - b.seat
  );
}

export { breakTile };
