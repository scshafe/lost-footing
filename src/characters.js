// The characters and their kits. Every kit has the same three slots:
// 1 Place (the main obstacle), 2 Trick (a second tool), 3 Break (platform
// destruction). A move's cast returns false when it cannot happen (then no
// cooldown is spent).

import { BTN, MOVE_BUTTONS } from "./input.js";
import { addEvent, overlaps } from "./common.js";
import { addTempTile, getTile, isSolid, isFloor, breakTile, damageTile, stressTile } from "./tiles.js";
import { HOLLOW, TILE } from "./constants.js";
import { OBJ, addObject, limitOwned, makeCoat, springLaunchSelf, bumperBounce } from "./objects.js";

// Throw velocity: neutral, forward held (far), up held (high lob).
export function lobVelocity(p, btn = p.btn) {
  const f = p.facing;
  if (btn & BTN.UP) return { vx: 4.5 * f, vy: -10 };
  const fwd = f > 0 ? btn & BTN.RIGHT : btn & BTN.LEFT;
  if (fwd) return { vx: 9 * f, vy: -6 };
  return { vx: 6.5 * f, vy: -6 };
}

export function lobOrigin(p) {
  return { x: p.x + p.w / 2 + p.facing * 10, y: p.y + 8 };
}

function throwLob(state, p, payload) {
  const o = lobOrigin(p);
  const v = lobVelocity(p);
  addObject(state, { type: "lob", payload, owner: p.seat, x: o.x, y: o.y, vx: v.vx, vy: v.vy, r: 7 });
  addEvent(state, { type: "throw", payload, seat: p.seat, x: o.x, y: o.y });
  return true;
}

function playersOverlap(state, x, y, w, h) {
  return state.players.some((q) => q.status === "play" && overlaps(x, y, w, h, q.x, q.y, q.w, q.h));
}

// The solid tile under a point at a given top, if any.
function tileAtTop(state, x, top) {
  for (const t of state.tiles) {
    if (isFloor(t) && t.y === top && x >= t.x && x <= t.x + t.w) return t;
  }
  return null;
}

// ---- Mason --------------------------------------------------------------

function castWall(state, p) {
  const { w, h } = OBJ.wall;
  const cx = p.x + p.w / 2;
  const baseY = p.ground ? p.groundTop : p.y + p.h;
  for (const dist of [38, 62, 86]) {
    const x = cx + p.facing * dist - w / 2;
    const y = baseY - h;
    if (playersOverlap(state, x, y, w, h)) continue;
    if (state.objects.some((o) => o.type === "wall" && !o.dead && overlaps(x, y, w, h, o.x, o.y, o.w, o.h))) continue;
    limitOwned(state, p.seat, (o) => o.type === "wall", OBJ.wall.max);
    const t = p.ground ? tileAtTop(state, x + w / 2, baseY) : null;
    addObject(state, { type: "wall", solid: true, owner: p.seat, x, y, w, h, life: OBJ.wall.life, sup: t ? t.id : -1 });
    addEvent(state, { type: "place", obj: "wall", seat: p.seat, x: x + w / 2, y: baseY });
    return true;
  }
  return false;
}

function castLedge(state, p) {
  const { w, h, life, hp } = OBJ.ledge;
  const cx = p.x + p.w / 2;
  let x;
  let y;
  if (p.ground) {
    x = cx + p.facing * 110 - w / 2;
    y = p.groundTop;
  } else {
    x = cx - w / 2;
    y = p.y + p.h + 2;
  }
  for (const t of state.tiles) if (t.kind === "ledge" && t.owner === p.seat && isSolid(t)) t.life = 1;
  addTempTile(state, { kind: "ledge", x, y, w, h, owner: p.seat, life, hp });
  addEvent(state, { type: "place", obj: "ledge", seat: p.seat, x: x + w / 2, y });
  return true;
}

function castAnvil(state, p) {
  const { w, h } = OBJ.anvil;
  addObject(state, {
    type: "anvil",
    owner: p.seat,
    x: p.x + p.w / 2 - w / 2 + p.facing * 12,
    y: p.y - 12,
    w,
    h,
    vx: p.facing * (p.btn & (p.facing > 0 ? BTN.RIGHT : BTN.LEFT) ? 5 : 3.5),
    vy: -5,
    breaks: 0,
    resting: -1,
  });
  addEvent(state, { type: "throw", payload: "anvil", seat: p.seat, x: p.x + p.w / 2, y: p.y });
  return true;
}

// ---- Pip ----------------------------------------------------------------

function castSpring(state, p) {
  const { w, h } = OBJ.spring;
  const dir = (p.btn & BTN.RIGHT ? 1 : 0) - (p.btn & BTN.LEFT ? 1 : 0);
  limitOwned(state, p.seat, (o) => o.type === "spring", OBJ.spring.max);
  const cx = p.x + p.w / 2;
  if (p.ground && p.ground.kind !== "player") {
    const x = cx + p.facing * 40 - w / 2;
    const t = tileAtTop(state, x + w / 2, p.groundTop);
    addObject(state, {
      type: "spring",
      owner: p.seat,
      x,
      y: p.groundTop - h,
      w,
      h,
      angle: dir,
      uses: OBJ.spring.uses,
      life: OBJ.spring.life,
      armed: OBJ.spring.arm,
      cool: [0, 0, 0, 0],
      sup: t ? t.id : -1,
    });
    addEvent(state, { type: "place", obj: "spring", seat: p.seat, x: x + w / 2, y: p.groundTop });
  } else {
    // In the air: the spring appears under your feet and launches you.
    const s = addObject(state, {
      type: "spring",
      owner: p.seat,
      x: cx - w / 2,
      y: p.y + p.h,
      w,
      h,
      angle: dir,
      uses: OBJ.spring.uses,
      life: OBJ.spring.life,
      armed: OBJ.spring.arm,
      cool: [0, 0, 0, 0],
    });
    springLaunchSelf(state, s, p);
  }
  return true;
}

function castGust(state, p) {
  limitOwned(state, p.seat, (o) => o.type === "gust", 1);
  const g = OBJ.gust;
  addObject(state, {
    type: "gust",
    owner: p.seat,
    x: p.x + p.w / 2,
    y: p.y + p.h / 2,
    dir: p.facing,
    len: g.len,
    hh: g.hh,
    force: g.force,
    life: g.life,
    armed: g.arm,
  });
  addEvent(state, { type: "place", obj: "gust", seat: p.seat, x: p.x + p.w / 2, y: p.y + p.h / 2 });
  return true;
}

function castDrill(state, p) {
  if (p.ground) {
    p.drill = 10;
    p.vy = -8;
    p.ground = null;
  } else {
    p.drill = -1;
  }
  addEvent(state, { type: "drill", seat: p.seat, x: p.x + p.w / 2, y: p.y });
  return true;
}

// The drill: a short hop, then a dive; landing breaks the ground.
export function updateDrill(state, p) {
  if (p.drill > 0) {
    p.drill--;
    p.vx *= 0.8;
    if (p.drill === 0) p.drill = -1;
    return;
  }
  if (p.drill !== -1 || !p.ground) return;
  const x = p.x + p.w / 2;
  if (p.ground.kind === "tile") {
    let top = p.groundTop;
    for (const id of p.supportTiles) {
      const t = getTile(state, id);
      if (!t) continue;
      if (t.kind === "crumble") breakTile(state, t, p.seat, "drill");
      else damageTile(state, t, 2, p.seat, "drill");
    }
    for (const t of state.tiles) {
      if (t.y !== top || t.kind !== "crumble" || !isSolid(t)) continue;
      if (Math.abs(t.x + t.w / 2 - x) < 140) stressTile(state, t, 0.4, p.seat, "drill");
    }
  } else if (p.ground.kind === "obj") {
    const w = state.objects.find((o) => o.id === p.ground.id);
    if (w) w.dead = true;
  }
  addEvent(state, { type: "drillHit", seat: p.seat, x, y: p.y + p.h });
  p.drill = 0;
  p.vy = -9;
  p.ground = null;
  p.supportTiles = [];
  p.jumpsLeft = p.airJumps;
}

// ---- Glim ---------------------------------------------------------------

const castGlue = (state, p) => throwLob(state, p, "glue");
const castOil = (state, p) => throwLob(state, p, "oil");
const castAcid = (state, p) => throwLob(state, p, "acid");

// ---- Fuse ---------------------------------------------------------------

function castBumper(state, p) {
  limitOwned(state, p.seat, (o) => o.type === "bumper", OBJ.bumper.max);
  const b = OBJ.bumper;
  if (!p.ground && p.vy > 0) {
    // Falling: the bumper appears underfoot, armed, and bounces Fuse up.
    const bump = addObject(state, { type: "bumper", owner: p.seat, x: p.x + p.w / 2, y: p.y + p.h + b.r - 6, r: b.r, uses: b.uses, life: b.life, armed: 0, cool: [0, 0, 0, 0] });
    bumperBounce(state, bump, p);
    addEvent(state, { type: "place", obj: "bumper", seat: p.seat, x: bump.x, y: bump.y });
    return true;
  }
  const x = p.x + p.w / 2 + p.facing * 58;
  const y = p.y + p.h / 2 - 6;
  addObject(state, { type: "bumper", owner: p.seat, x, y, r: b.r, uses: b.uses, life: b.life, armed: b.arm, cool: [0, 0, 0, 0] });
  addEvent(state, { type: "place", obj: "bumper", seat: p.seat, x, y });
  return true;
}

const castCharge = (state, p) => throwLob(state, p, "charge");

function castSaw(state, p) {
  const r = OBJ.saw.r;
  addObject(state, {
    type: "saw",
    owner: p.seat,
    x: p.x + p.w / 2 + p.facing * 4,
    y: p.y + p.h - r,
    r,
    dir: p.facing,
    life: OBJ.saw.life,
    hit: [],
    onTop: null,
  });
  addEvent(state, { type: "throw", payload: "saw", seat: p.seat, x: p.x + p.w / 2, y: p.y + p.h });
  return true;
}

// ---- Dab ----------------------------------------------------------------

function castDecoy(state, p) {
  const { w, life, max, near, far } = OBJ.decoy;
  const cx = p.x + p.w / 2;
  let x;
  let y;
  if (p.ground) {
    const fwd = p.facing > 0 ? p.btn & BTN.RIGHT : p.btn & BTN.LEFT;
    x = cx + p.facing * (fwd ? far : near) - w / 2;
    y = p.groundTop;
    // Painted over real floor it would be pointless: say so.
    let covered = 0;
    for (const t of state.tiles) {
      if (isFloor(t) && t.y === y) covered += Math.max(0, Math.min(x + w, t.x + t.w) - Math.max(x, t.x));
    }
    if (covered >= w / 2) return false;
  } else {
    // In the air it appears under your feet: footing only you can use.
    x = cx - w / 2;
    y = p.y + p.h + 2;
  }
  const mine = state.tiles.filter((t) => t.kind === "decoy" && t.owner === p.seat && isSolid(t) && t.life > 1);
  while (mine.length >= max) mine.shift().life = 1;
  addTempTile(state, { kind: "decoy", x, y, w, h: TILE.h, owner: p.seat, life, hp: 1 });
  addEvent(state, { type: "place", obj: "decoy", seat: p.seat, x: x + w / 2, y });
  return true;
}

function castHollow(state, p) {
  if (!p.ground || p.ground.kind !== "tile") return false;
  const { near, reach } = OBJ.hollow;
  const cx = p.x + p.w / 2;
  const a = cx + p.facing * near;
  const b = cx + p.facing * (near + reach);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const targets = state.tiles.filter((t) => t.kind === "crumble" && isSolid(t) && t.y === p.groundTop && t.x < hi && t.x + t.w > lo && !(t.hollowArm > 0) && !(t.hollow > 0));
  if (!targets.length) return false;
  for (const t of targets) {
    t.hollowArm = HOLLOW.arm;
    t.hollowBy = p.seat;
  }
  addEvent(state, { type: "place", obj: "hollow", seat: p.seat, x: (lo + hi) / 2, y: p.groundTop });
  return true;
}

function castRub(state, p) {
  if (!p.ground || p.ground.kind !== "tile") return false;
  const { near, reach, delay } = OBJ.rub;
  const cx = p.x + p.w / 2;
  // The stroke starts past the tiles Dab stands on: it never erases her own footing.
  const own = p.supportTiles.map((id) => getTile(state, id)).filter(Boolean);
  const x0 = p.facing > 0 ? Math.max(cx + near, ...own.map((t) => t.x + t.w)) : Math.min(cx - near, ...own.map((t) => t.x)) - reach;
  limitOwned(state, p.seat, (o) => o.type === "rub", 1);
  addObject(state, { type: "rub", owner: p.seat, x0, x1: x0 + reach, y: p.groundTop, fuse: delay });
  addEvent(state, { type: "place", obj: "rub", seat: p.seat, x: x0 + reach / 2, y: p.groundTop });
  return true;
}

// ---- Fern ---------------------------------------------------------------

function castVine(state, p) {
  if (!p.ground || p.ground.kind !== "tile") return false;
  const x = p.x + p.w / 2 + p.facing * 50;
  const t = tileAtTop(state, x, p.groundTop);
  if (!t) return false; // a seed needs ground
  limitOwned(state, p.seat, (o) => o.type === "vine", OBJ.vine.max);
  addObject(state, { type: "vine", owner: p.seat, x, top: p.groundTop, dir: p.facing, step: 0, sup: t.id, fuse: OBJ.vine.delay });
  addEvent(state, { type: "place", obj: "vine", seat: p.seat, x, y: p.groundTop });
  return true;
}

function castThorns(state, p) {
  if (!p.ground || p.ground.kind !== "tile") return false;
  const { w, near, arm } = OBJ.thorn;
  const x = p.x + p.w / 2 + p.facing * (near + w / 2);
  const coat = makeCoat(state, p.seat, "thorn", x, p.groundTop);
  if (!coat) return false;
  coat.armed = arm;
  return true;
}

function castRoots(state, p) {
  if (!p.ground || p.ground.kind !== "tile") return false;
  limitOwned(state, p.seat, (o) => o.type === "roots", OBJ.roots.max);
  const x = p.x + p.w / 2 + p.facing * 110;
  addObject(state, { type: "roots", owner: p.seat, x, top: p.groundTop, fuse: OBJ.roots.fuse });
  addEvent(state, { type: "place", obj: "roots", seat: p.seat, x, y: p.groundTop });
  return true;
}

// ---- The roster ---------------------------------------------------------

export const CHARACTERS = {
  mason: {
    id: "mason",
    name: "Mason",
    title: "the builder",
    trait: "Builds his own footing: the Ledge.",
    blurb: "Walls that block and bounce, a ledge to stand on, an anvil that punches through floors.",
    moves: [
      { name: "Wall", cd: 75, cast: castWall, desc: "A stone wall ahead. Blocks everyone, reflects comets and saws. 2 at once." },
      { name: "Ledge", cd: 360, cast: castLedge, desc: "A short sturdy ledge under you in the air, or ahead of you on the ground." },
      { name: "Anvil", cd: 300, cast: castAnvil, desc: "A thrown anvil. Punches through up to 3 crumble tiles; cracks slabs." },
    ],
  },
  glim: {
    id: "glim",
    name: "Glim",
    title: "the alchemist",
    airJumps: 2,
    trait: "Light on her feet: two air jumps.",
    blurb: "Lobbed glue to pin you in place, oil to slide you off, acid to dissolve the floor.",
    moves: [
      { name: "Glue", cd: 140, cast: castGlue, desc: "A lobbed glob. Sticky patch: you crawl, hop low, and the tile crumbles under you." },
      { name: "Oil", cd: 140, cast: castOil, desc: "A lobbed slick. No grip: momentum carries you off edges." },
      { name: "Acid", cd: 330, cast: castAcid, desc: "A lobbed flask. The tiles it lands on dissolve within a second; eats slabs." },
    ],
  },
  pip: {
    id: "pip",
    name: "Pip",
    title: "the acrobat",
    trait: "A Spring placed in the air launches Pip (instead of the air jump).",
    blurb: "Springs that launch whoever steps on them, a fan that blows, a drill that dives through the floor.",
    moves: [
      { name: "Spring", cd: 110, cast: castSpring, desc: "A spring pad ahead (hold a direction to angle it). In the air it launches you." },
      { name: "Gust", cd: 480, cast: castGust, desc: "A fan that blows everything ahead of it for 3 seconds. Footing in the wind turns slippery." },
      { name: "Drill", cd: 270, cast: castDrill, desc: "Dive straight down: the floor you land on breaks, nearby tiles shake." },
    ],
  },
  fuse: {
    id: "fuse",
    name: "Fuse",
    title: "the demolitionist",
    trait: "A Bumper placed while falling appears underfoot and bounces Fuse up.",
    blurb: "Bumpers that bounce, a sticky charge on a fuse, a saw that cuts along the floor.",
    moves: [
      { name: "Bumper", cd: 130, cast: castBumper, desc: "A floating bumper ahead. Bounces anyone who touches it. Arms in half a second." },
      { name: "Charge", cd: 300, cast: castCharge, desc: "A lobbed sticky charge. After 1.7 s it breaks every tile nearby and clears placeables." },
      { name: "Saw", cd: 270, cast: castSaw, desc: "A blade that rolls along the floor, dooming every tile it crosses." },
    ],
  },
  dab: {
    id: "dab",
    name: "Dab",
    title: "the forger",
    trait: "Sees through her forgeries: decoys and hollowed tiles hold only her.",
    blurb: "Fake floor that looks real, tiles that turn to air, a brushstroke that rubs the floor out.",
    moves: [
      { name: "Decoy", cd: 200, cast: castDecoy, desc: "Paints two tiles of fake floor (ahead, or further if you hold forward). Only Dab can stand on it. In the air it appears under you." },
      { name: "Hollow", cd: 420, cast: castHollow, desc: "Tiles ahead shimmer, then for 2.5 s hold only Dab. Anyone standing there drops." },
      { name: "Rub out", cd: 270, cast: castRub, desc: "A brushstroke past your own tiles: after half a second every platform it covers is erased." },
    ],
  },
  fern: {
    id: "fern",
    name: "Fern",
    title: "the gardener",
    trait: "Patient: her plants take a moment to sprout, then last longer than a ledge.",
    blurb: "A vine of leaves to climb, thorns that bog the floor down, roots that shake the tiles loose.",
    moves: [
      { name: "Vine", cd: 330, cast: castVine, desc: "A seed ahead sprouts a zigzag ladder of four leaves, 7 s. Anyone can climb it. 2 at once." },
      { name: "Thorns", cd: 240, cast: castThorns, desc: "A bramble patch ahead after a moment's growth: slow and stuck on it, and it chews the tiles under it. 5 s." },
      { name: "Roots", cd: 330, cast: castRoots, desc: "A seed ahead: the tiles around it shake for a second, then break. Slabs take 1 damage." },
    ],
  },
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);

export function castMoves(state, p) {
  const ch = CHARACTERS[p.character];
  if (!ch || p.drill !== 0) return;
  const pressed = p.btn & ~p.prevBtn;
  for (let i = 0; i < 3; i++) {
    if (!(pressed & MOVE_BUTTONS[i]) || p.cd[i] > 0) continue;
    const move = ch.moves[i];
    if (move.cast(state, p) === false) {
      addEvent(state, { type: "fizzle", seat: p.seat, slot: i });
      continue;
    }
    p.cd[i] = move.cd;
    p.action = 12;
    p.actionSlot = i;
    p.stats.placed++;
    addEvent(state, { type: "cast", seat: p.seat, slot: i, move: move.name.toLowerCase(), x: p.x + p.w / 2, y: p.y });
    break; // one move per tick
  }
}
