// Player control and movement against the stage: running, jumping, dropping
// through one-way platforms, landing, and the load a player puts on the tiles
// under them. Player-to-player contact lives in src/contact.js.

import { PLAYER, CRUMBLE } from "./constants.js";
import { BTN } from "./input.js";
import { addEvent, blame } from "./common.js";
import { getTile } from "./tiles.js";
import { CHARACTERS } from "./characters.js";

export function newStats() {
  return {
    kos: 0, // eliminations credited to this player
    falls: 0, // eliminations nobody was credited for
    deaths: 0,
    tilesBroken: 0,
    slabsBroken: 0,
    placed: 0,
    stomps: 0,
    airTicks: 0,
    headTicks: 0,
    lifeTicks: 0,
    longestLife: 0,
  };
}

export function newPlayer(seat, { kind = "human", character = "mason", difficulty = "normal", slot } = {}, stocks = 3) {
  return {
    seat,
    slot: slot ?? seat, // the physical seat (colour, keys) when seats are skipped
    kind,
    character,
    difficulty,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    w: PLAYER.w,
    h: PLAYER.h,
    facing: seat % 2 === 0 ? 1 : -1,
    ground: null, // { kind: "tile" | "obj" | "player", id }
    supportTiles: [],
    groundTop: 0,
    wasGrounded: false,
    coyote: 0,
    jumpsLeft: 1,
    airJumps: (CHARACTERS[character] && CHARACTERS[character].airJumps) || 1,
    jumpBuffer: 0,
    jumpHeld: false,
    dropTimer: 0,
    dropY: 0,
    fastFall: false,
    launched: 0,
    slow: 0,
    still: true,
    stillTicks: 0,
    btn: 0,
    prevBtn: 0,
    stocks,
    status: "play", // "play" | "dead" | "out"
    respawnTimer: 0,
    invuln: 0,
    cd: [0, 0, 0],
    action: 0, // ticks left of a cast pose (presentation)
    actionSlot: -1,
    drill: 0, // Pip's drill: >0 hop phase, -1 diving
    noContact: 0,
    windTicks: 0,
    surface: "plain", // "plain" | "glue" | "oil": the coat under the feet
    blame: null,
    stats: newStats(),
    koTick: -1,
    place: 0,
  };
}

// The modifiers of the coat (glue/oil) under a grounded player.
export function surfaceUnder(state, p) {
  if (!p.ground || p.ground.kind !== "tile") return null;
  const cx = p.x + p.w / 2;
  let found = null;
  for (const o of state.objects) {
    if (o.type !== "coat" || o.armed > 0) continue;
    if (cx < o.x0 || cx > o.x1) continue;
    if (!o.supports.some((id) => p.supportTiles.includes(id))) continue;
    if (!found || o.coat === "glue") found = o;
  }
  return found;
}

const PLAIN = { speed: 1, accel: 1, friction: PLAYER.groundFriction, overDecay: PLAYER.overGroundDecay, jump: 1 };
const GLUE = { speed: 0.1, accel: 0.4, friction: 0.5, overDecay: 0.6, jump: 0.55 };
const OIL = { speed: 1.25, accel: 0.25, friction: 0.995, overDecay: 0.995, jump: 1 };

// Read the buttons and turn them into velocity, jumps and drops.
export function controlPlayer(state, p) {
  const btn = p.btn;
  const pressed = btn & ~p.prevBtn;
  const grounded = !!p.ground;

  const coat = surfaceUnder(state, p);
  p.surface = coat ? coat.coat : "plain";
  if (coat && coat.owner !== p.seat) blame(state, p, coat.owner, coat.coat);
  const mods = p.surface === "glue" ? GLUE : p.surface === "oil" ? OIL : PLAIN;

  // The drill takes over (src/characters.js); an air jump cancels the dive.
  if (p.drill === -1 && pressed & BTN.UP && p.jumpsLeft > 0 && !p.ground) p.drill = 0;
  if (p.drill !== 0) return;

  const dir = (btn & BTN.RIGHT ? 1 : 0) - (btn & BTN.LEFT ? 1 : 0);
  if (dir !== 0) p.facing = dir;

  const max = PLAYER.runMax * mods.speed * (p.slow > 0 ? 0.55 : 1);
  const accel = grounded ? PLAYER.groundAccel * mods.accel : PLAYER.airAccel * (p.launched > 0 ? 0.3 : 1);
  const speed = Math.abs(p.vx);
  if (dir !== 0 && p.vx * dir < max) {
    p.vx += dir * accel;
    if (p.vx * dir > max) p.vx = dir * max;
  } else if (dir === 0) {
    // Wind (a gust or a gale) makes footing slippery: it can blow you along.
    const friction = p.windTicks > 0 ? Math.max(mods.friction, 0.9) : mods.friction;
    p.vx *= grounded ? friction : PLAYER.airDrag;
    if (Math.abs(p.vx) < 0.05) p.vx = 0;
  }
  if (speed > max) {
    // Over the run speed (a launch, oil): bleed it off, never below the cap.
    const decay = grounded ? mods.overDecay : PLAYER.overAirDecay;
    const s = Math.max(max, Math.abs(p.vx) * decay);
    p.vx = p.vx < 0 ? -s : s;
  }

  // Jumping: a ground jump (with coyote time and a buffer), then one air jump.
  if (pressed & BTN.UP) p.jumpBuffer = PLAYER.jumpBuffer;
  if (p.jumpBuffer > 0) {
    if (grounded || p.coyote > 0) {
      p.vy = PLAYER.jumpV * mods.jump;
      if (p.ground && p.ground.kind === "player") {
        // Jumping off someone's head pushes them down a little.
        const under = state.players[p.ground.id];
        if (under && !under.ground) under.vy += 2;
      }
      p.ground = null;
      p.coyote = 0;
      p.jumpBuffer = 0;
      p.jumpHeld = true;
      p.launched = 0;
      addEvent(state, { type: "jump", seat: p.seat, x: p.x + p.w / 2, y: p.y + p.h });
    } else if (pressed & BTN.UP && p.jumpsLeft > 0) {
      p.vy = PLAYER.airJumpV;
      p.jumpsLeft--;
      p.jumpBuffer = 0;
      p.jumpHeld = true;
      p.launched = 0;
      addEvent(state, { type: "airJump", seat: p.seat, x: p.x + p.w / 2, y: p.y + p.h });
    }
  }
  if (p.jumpHeld && !(btn & BTN.UP)) {
    if (p.vy < PLAYER.jumpCutV) p.vy = PLAYER.jumpCutV;
    p.jumpHeld = false;
  }
  if (p.vy >= 0) p.jumpHeld = false;

  // Down: drop through a one-way platform, or fast fall in the air.
  if (pressed & BTN.DOWN && p.ground) {
    if (p.ground.kind === "tile") {
      p.dropTimer = PLAYER.dropTicks;
      p.dropY = p.groundTop;
      p.ground = null;
      p.coyote = 0;
      addEvent(state, { type: "drop", seat: p.seat });
    } else if (p.ground.kind === "player") {
      p.noContact = PLAYER.dropTicks;
      p.ground = null;
    }
  }
  p.fastFall = !p.ground && !!(btn & BTN.DOWN) && p.vy > -2;
}

// Solid boxes players collide with on every side (walls).
function solids(state) {
  const list = [];
  for (const o of state.objects) if (o.solid) list.push(o);
  return list;
}

// Surfaces a player can land on: solid tiles (one-way) and solid object tops.
export function surfaces(state) {
  const list = [];
  for (const t of state.tiles) {
    if (t.state !== "solid") continue;
    list.push({ kind: "tile", id: t.id, top: t.y, x0: t.x, x1: t.x + t.w, oneWay: true, owner: t.kind === "halo" ? t.owner : -1 });
  }
  for (const o of state.objects) {
    if (!o.solid) continue;
    list.push({ kind: "obj", id: o.id, top: o.y, x0: o.x, x1: o.x + o.w, oneWay: false, owner: -1 });
  }
  return list;
}

// Apply gravity and move the player through the world.
export function movePlayer(state, p, surfs, walls) {
  const wasGrounded = !!p.ground;
  if (p.drill === -1) {
    p.vx = 0;
    p.vy = 16;
  } else {
    const g = p.fastFall ? PLAYER.fastFallGravity : PLAYER.gravity;
    const max = p.fastFall ? PLAYER.fastFallMax : PLAYER.maxFall;
    p.vy = Math.min(p.vy + g, Math.max(max, p.vy));
  }

  // Horizontal: walls stop you from either side.
  let nx = p.x + p.vx;
  for (const s of walls) {
    if (p.y + p.h <= s.y + 0.5 || p.y >= s.y + s.h - 0.5) continue;
    if (p.vx > 0 && p.x + p.w <= s.x + 0.01 && nx + p.w > s.x) {
      nx = s.x - p.w;
      p.vx = 0;
      if (s.owner !== p.seat) blame(state, p, s.owner, "wall");
    } else if (p.vx < 0 && p.x >= s.x + s.w - 0.01 && nx < s.x + s.w) {
      nx = s.x + s.w;
      p.vx = 0;
      if (s.owner !== p.seat) blame(state, p, s.owner, "wall");
    }
  }
  p.x = nx;

  // Vertical: land on the highest surface crossed this tick.
  const prevBottom = p.y + p.h;
  let ny = p.y + p.vy;
  p.ground = null;
  p.supportTiles.length = 0;
  if (p.dropTimer > 0) p.dropTimer--;
  if (p.vy >= 0) {
    let best = null;
    for (const s of surfs) {
      if (p.x + p.w <= s.x0 + PLAYER.landOverlap || p.x >= s.x1 - PLAYER.landOverlap) continue;
      if (s.owner >= 0 && s.owner !== p.seat) continue;
      if (s.oneWay && p.dropTimer > 0 && s.top <= p.dropY + 1) continue;
      if (prevBottom <= s.top + 0.01 && ny + p.h >= s.top && (!best || s.top < best.top)) best = s;
    }
    if (best) {
      const impact = p.vy;
      ny = best.top - p.h;
      p.vy = 0;
      p.ground = { kind: best.kind, id: best.id };
      p.groundTop = best.top;
      for (const s of surfs) {
        if (s.kind === "tile" && s.top === best.top && p.x + p.w > s.x0 && p.x < s.x1) p.supportTiles.push(s.id);
      }
      if (!wasGrounded) land(state, p, impact);
    }
  } else {
    for (const s of walls) {
      if (p.x + p.w <= s.x + 1 || p.x >= s.x + s.w - 1) continue;
      if (p.y >= s.y + s.h - 0.01 && ny < s.y + s.h) {
        ny = s.y + s.h;
        p.vy = 0;
      }
    }
  }
  p.y = ny;
}

function land(state, p, impact) {
  p.jumpsLeft = p.airJumps;
  p.launched = 0;
  p.fastFall = false;
  if (p.drill !== 0) return; // the drill handles its own landing
  const hard = impact >= CRUMBLE.hardLandSpeed;
  for (const id of p.supportTiles) {
    const t = getTile(state, id);
    if (t && t.kind === "crumble") t.load += hard ? CRUMBLE.hardLandStress : CRUMBLE.landStress;
  }
  addEvent(state, { type: "land", seat: p.seat, x: p.x + p.w / 2, y: p.y + p.h, hard });
}

// Tile load from standing: still players crumble tiles fast, moving ones slowly.
export function applyLoad(state, p) {
  if (!p.ground) return;
  p.still = Math.abs(p.vx) < PLAYER.stillSpeed;
  const rate = p.still ? CRUMBLE.stillRate : CRUMBLE.moveRate;
  if (p.ground.kind === "tile") {
    for (const id of p.supportTiles) {
      const t = getTile(state, id);
      if (t && t.kind === "crumble") t.load += rate / Math.max(1, p.supportTiles.length) * (p.supportTiles.length > 1 ? 1.5 : 1);
    }
  } else if (p.ground.kind === "player") {
    // A rider weighs down whatever the player underneath stands on.
    const under = state.players[p.ground.id];
    if (under && under.ground && under.ground.kind === "tile") {
      for (const id of under.supportTiles) {
        const t = getTile(state, id);
        if (t && t.kind === "crumble") t.load += rate * CRUMBLE.riderShare / Math.max(1, under.supportTiles.length);
      }
    }
  }
}

// Per-tick timers and bookkeeping after movement.
export function tickPlayer(state, p) {
  if (p.ground) {
    p.coyote = PLAYER.coyote;
  } else if (p.coyote > 0) {
    p.coyote--;
  }
  if (p.jumpBuffer > 0) p.jumpBuffer--;
  if (p.launched > 0) p.launched--;
  if (p.slow > 0) p.slow--;
  if (p.invuln > 0) p.invuln--;
  if (p.noContact > 0) p.noContact--;
  if (p.windTicks > 0) p.windTicks--;
  if (p.action > 0) p.action--;
  for (let i = 0; i < 3; i++) if (p.cd[i] > 0) p.cd[i]--;
  if (!p.ground) p.stats.airTicks++;
  else if (p.ground.kind === "player") p.stats.headTicks++;
  p.stats.lifeTicks++;
  p.stillTicks = p.ground && p.still ? p.stillTicks + 1 : 0;
  p.wasGrounded = !!p.ground;
}

export function playerCenter(p) {
  return { x: p.x + p.w / 2, y: p.y + p.h / 2 };
}

