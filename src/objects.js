// Placeables: the objects characters' moves put into the world. Every object
// acts on every player who touches it (its owner too) and none of them hits,
// damages or knocks back a player by itself being thrown at them: they change
// the ground, block paths, launch or push whoever walks into them.

import { PLAYER } from "./constants.js";
import { addEvent, blame, circleBox, sign } from "./common.js";
import { getTile, isSolid, breakTile, damageTile, stressTile } from "./tiles.js";

export const OBJ = Object.freeze({
  gravity: 0.6,
  maxFall: 14,
  lobGravity: 0.45,
  wall: { w: 22, h: 90, life: 330, max: 2 },
  ledge: { w: 90, h: 16, life: 240, hp: 2 },
  anvil: { w: 30, h: 26, maxBreaks: 3, restLife: 45 },
  glue: { w: 72, life: 420, max: 2 },
  oil: { w: 110, life: 420, max: 2 },
  acid: { w: 80, life: 150, max: 1, stress: 1 / 40, slabEvery: 48 },
  spring: { w: 34, h: 12, life: 480, max: 2, uses: 4, arm: 15, launch: -17, angledLaunch: -15, angledVx: 8, selfLaunch: -13.5 },
  gust: { len: 340, hh: 60, force: 0.27, life: 180, arm: 24 },
  bumper: { r: 22, life: 420, max: 2, uses: 4, arm: 30, speed: 11.5 },
  charge: { r: 8, fuse: 100, radius: 115, max: 1 },
  saw: { r: 14, speed: 7, life: 130 },
});

export function addObject(state, o) {
  o.id = state.nextObjectId++;
  if (o.armed === undefined) o.armed = 0;
  if (o.vx === undefined) o.vx = 0;
  if (o.vy === undefined) o.vy = 0;
  if (o.sup === undefined) o.sup = -1;
  if (o.supObj === undefined) o.supObj = -1;
  o.age = 0;
  state.objects.push(o);
  return o;
}

// Keep at most `max` objects of a kind per owner: the oldest goes.
export function limitOwned(state, owner, match, max) {
  const owned = state.objects.filter((o) => o.owner === owner && match(o) && !o.dead);
  while (owned.length >= max) {
    const old = owned.shift();
    old.dead = true;
    addEvent(state, { type: "vanish", obj: old.type, x: objX(old), y: objY(old) });
  }
}

function objX(o) {
  return o.type === "coat" ? (o.x0 + o.x1) / 2 : o.w ? o.x + o.w / 2 : o.x;
}
function objY(o) {
  return o.h ? o.y + o.h / 2 : o.y;
}

// Surfaces objects rest on: solid tiles (not halos) and wall tops.
function objectSurfaces(state) {
  const list = [];
  for (const t of state.tiles) {
    if (t.state !== "solid" || t.kind === "halo") continue;
    list.push({ kind: "tile", id: t.id, top: t.y, x0: t.x, x1: t.x + t.w });
  }
  for (const o of state.objects) {
    if (o.type !== "wall" || o.dead) continue;
    list.push({ kind: "obj", id: o.id, top: o.y, x0: o.x, x1: o.x + o.w });
  }
  return list;
}

// Box objects (walls, springs, anvils): stay on their support or fall.
// Returns the surface landed on this tick, or null.
function settle(state, o, surfs) {
  if (o.sup >= 0) {
    const t = getTile(state, o.sup);
    if (isSolid(t) && o.x + o.w > t.x && o.x < t.x + t.w) {
      o.y = t.y - o.h;
      o.vy = 0;
      return null;
    }
    o.sup = -1;
  }
  if (o.supObj >= 0) {
    const w = state.objects.find((q) => q.id === o.supObj && !q.dead);
    if (w && o.x + o.w > w.x && o.x < w.x + w.w) {
      o.y = w.y - o.h;
      o.vy = 0;
      return null;
    }
    o.supObj = -1;
  }
  const prevBottom = o.y + o.h;
  o.vy = Math.min(o.vy + OBJ.gravity, OBJ.maxFall);
  let ny = o.y + o.vy;
  let best = null;
  if (o.vy >= 0) {
    for (const s of surfs) {
      if (s.kind === "obj" && s.id === o.id) continue;
      if (o.x + o.w <= s.x0 + 2 || o.x >= s.x1 - 2) continue;
      if (prevBottom <= s.top + 0.01 && ny + o.h >= s.top && (!best || s.top < best.top)) best = s;
    }
  }
  if (best) {
    ny = best.top - o.h;
    o.vy = 0;
    if (best.kind === "tile") o.sup = best.id;
    else o.supObj = best.id;
  }
  o.y = ny;
  return best;
}

// Where a lob thrown from (x, y) at (vx, vy) lands: { x, y, kind, id } or
// null if it falls out. Pure: used by the bots to aim.
export function predictLob(state, x, y, vx, vy, maxTicks = 150) {
  const surfs = objectSurfaces(state);
  for (let i = 0; i < maxTicks; i++) {
    const hit = lobStep({ x, y, vx, vy }, surfs, state);
    if (hit.land) return hit.land;
    ({ x, y, vx, vy } = hit);
    if (y > 1100 || x < -300 || x > 1900) return null;
  }
  return null;
}

function lobStep(l, surfs, state) {
  const nx = l.x + l.vx;
  let nvy = l.vy + OBJ.lobGravity;
  const ny = l.y + nvy;
  let nvx = l.vx;
  // Gusts push lobs in flight.
  for (const g of state.objects) {
    if (g.type !== "gust" || g.dead || g.armed > 0) continue;
    const d = (l.x - g.x) * g.dir;
    if (d >= 0 && d <= g.len && l.y > g.y - g.hh && l.y < g.y + g.hh) nvx += g.dir * 0.12;
  }
  if (nvy >= 0) {
    let best = null;
    for (const s of surfs) {
      if (nx < s.x0 || nx > s.x1) continue;
      if (l.y <= s.top + 0.01 && ny >= s.top && (!best || s.top < best.top)) best = s;
    }
    if (best) return { land: { x: nx, y: best.top, kind: best.kind, id: best.id } };
  }
  // Wall sides bounce a lob back.
  for (const w of state.objects) {
    if (w.type !== "wall" || w.dead) continue;
    if (ny > w.y && ny < w.y + w.h && ((l.x <= w.x && nx > w.x) || (l.x >= w.x + w.w && nx < w.x + w.w))) {
      return { x: l.x, y: ny, vx: -nvx * 0.3, vy: nvy };
    }
  }
  return { x: nx, y: ny, vx: nvx, vy: nvy };
}

// Make a coat (glue, oil or acid) on the surface a lob landed on.
export function makeCoat(state, owner, coat, x, top) {
  const spec = OBJ[coat];
  let x0 = x - spec.w / 2;
  let x1 = x + spec.w / 2;
  const supports = [];
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of state.tiles) {
    if (!isSolid(t) || t.kind === "halo" || t.y !== top) continue;
    if (t.x + t.w <= x0 || t.x >= x1) continue;
    supports.push(t.id);
    lo = Math.min(lo, t.x);
    hi = Math.max(hi, t.x + t.w);
  }
  if (!supports.length) {
    addEvent(state, { type: "splat", coat, x, y: top, owner, wasted: true });
    return null;
  }
  x0 = Math.max(x0, lo);
  x1 = Math.min(x1, hi);
  limitOwned(state, owner, (o) => o.type === "coat" && o.coat === coat, spec.max);
  addEvent(state, { type: "splat", coat, x, y: top, owner });
  return addObject(state, { type: "coat", coat, owner, x0, x1, y: top, supports, life: spec.life, tick: 0 });
}

function landLob(state, o, land) {
  if (o.payload === "charge") {
    limitOwned(state, o.owner, (q) => q.type === "charge", OBJ.charge.max);
    addObject(state, {
      type: "charge",
      owner: o.owner,
      x: land.x - OBJ.charge.r,
      y: land.y - OBJ.charge.r * 2,
      w: OBJ.charge.r * 2,
      h: OBJ.charge.r * 2,
      fuse: OBJ.charge.fuse,
      sup: land.kind === "tile" ? land.id : -1,
      supObj: land.kind === "obj" ? land.id : -1,
    });
    addEvent(state, { type: "stick", x: land.x, y: land.y, owner: o.owner });
  } else if (land.kind === "tile") {
    makeCoat(state, o.owner, o.payload, land.x, land.y);
  } else {
    addEvent(state, { type: "splat", coat: o.payload, x: land.x, y: land.y, owner: o.owner, wasted: true });
  }
}

export function explode(state, o, cx, cy) {
  const R = OBJ.charge.radius;
  for (const t of state.tiles) {
    if (!isSolid(t) || t.kind === "halo") continue;
    if (circleBox(cx, cy, R, t.x, t.y, t.w, t.h)) damageTile(state, t, 2, o.owner, "charge");
  }
  for (const q of state.objects) {
    if (q === o || q.dead) continue;
    if (q.type === "wall" || q.type === "spring" || q.type === "anvil" || q.type === "charge") {
      if (circleBox(cx, cy, R, q.x, q.y, q.w, q.h)) q.dead = true;
    } else if (q.type === "bumper") {
      const dx = q.x - cx;
      const dy = q.y - cy;
      if (dx * dx + dy * dy < (R + q.r) * (R + q.r)) q.dead = true;
    } else if (q.type === "coat") {
      if (q.x1 > cx - R && q.x0 < cx + R && Math.abs(q.y - cy) < R) q.dead = true;
    }
  }
  addEvent(state, { type: "explode", x: cx, y: cy, r: R, owner: o.owner });
}

// Launch a player off a spring.
function launchFromSpring(state, s, p, self = false) {
  p.vy = self ? OBJ.spring.selfLaunch : s.angle ? OBJ.spring.angledLaunch : OBJ.spring.launch;
  if (s.angle) p.vx = s.angle * OBJ.spring.angledVx;
  p.y = s.y - p.h - 1;
  p.ground = null;
  p.supportTiles = [];
  p.launched = PLAYER.launchedTicks;
  p.jumpsLeft = p.airJumps;
  p.jumpHeld = false;
  p.drill = 0;
  s.uses--;
  s.cool[p.seat] = state.tick + 10;
  blame(state, p, s.owner, "spring");
  addEvent(state, { type: "spring", x: s.x + s.w / 2, y: s.y, seat: p.seat, owner: s.owner });
  if (s.uses <= 0) s.dead = true;
}

export function springLaunchSelf(state, s, p) {
  launchFromSpring(state, s, p, true);
  p.jumpsLeft = 0; // the air spring replaces the air jump
}

export function bumperBounce(state, b, p) {
  const px = p.x + p.w / 2;
  const py = p.y + p.h / 2;
  let dx = px - b.x;
  let dy = py - b.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) {
    dx = 0;
    dy = -1;
  } else {
    dx /= len;
    dy /= len;
  }
  const v = OBJ.bumper.speed;
  p.vx = dx * v;
  p.vy = dy * v - 2;
  // Out of the bumper.
  const push = b.r + Math.max(p.w, p.h) / 2 + 1;
  p.x = b.x + dx * push - p.w / 2;
  p.y = b.y + dy * push - p.h / 2;
  p.ground = null;
  p.supportTiles = [];
  p.launched = PLAYER.launchedTicks;
  p.jumpHeld = false;
  p.drill = 0;
  b.uses--;
  b.cool[p.seat] = state.tick + 15;
  blame(state, p, b.owner, "bumper");
  addEvent(state, { type: "bumper", x: b.x, y: b.y, seat: p.seat, owner: b.owner });
  if (b.uses <= 0) b.dead = true;
}

export function updateObjects(state) {
  let surfs = objectSurfaces(state);
  const players = state.players.filter((p) => p.status === "play");
  for (const o of state.objects) {
    if (o.dead) continue;
    o.age++;
    if (o.armed > 0) o.armed--;
    switch (o.type) {
      case "wall": {
        settle(state, o, surfs);
        if (--o.life <= 0 || o.y > 1100) o.dead = true;
        break;
      }
      case "spring": {
        settle(state, o, surfs);
        if (--o.life <= 0 || o.y > 1100) o.dead = true;
        if (o.armed > 0 || o.dead) break;
        for (const p of players) {
          if ((o.cool[p.seat] || 0) > state.tick || p.vy < 0) continue;
          const bottom = p.y + p.h;
          if (bottom < o.y - 2 || bottom > o.y + o.h + 1) continue;
          if (p.x + p.w <= o.x + 4 || p.x >= o.x + o.w - 4) continue;
          launchFromSpring(state, o, p);
          if (o.dead) break;
        }
        break;
      }
      case "bumper": {
        if (--o.life <= 0) o.dead = true;
        if (o.armed > 0 || o.dead) break;
        for (const p of players) {
          if (p.invuln > 0 || (o.cool[p.seat] || 0) > state.tick) continue;
          if (circleBox(o.x, o.y, o.r, p.x, p.y, p.w, p.h)) bumperBounce(state, o, p);
          if (o.dead) break;
        }
        break;
      }
      case "coat": {
        o.supports = o.supports.filter((id) => isSolid(getTile(state, id)));
        if (!o.supports.length || --o.life <= 0) {
          o.dead = true;
          break;
        }
        if (o.coat === "acid") {
          o.tick++;
          for (const id of o.supports) {
            const t = getTile(state, id);
            if (t.kind === "crumble") stressTile(state, t, OBJ.acid.stress, o.owner, "acid");
            else if (o.tick % OBJ.acid.slabEvery === 0) damageTile(state, t, 1, o.owner, "acid");
          }
        }
        break;
      }
      case "lob": {
        const r = lobStep(o, surfs, state);
        if (r.land) {
          o.dead = true;
          landLob(state, o, r.land);
        } else {
          o.x = r.x;
          o.y = r.y;
          o.vx = r.vx;
          o.vy = r.vy;
          if (o.y > 1100 || o.x < -300 || o.x > 1900) o.dead = true;
        }
        break;
      }
      case "charge": {
        settle(state, o, surfs);
        if (o.y > 1100) {
          o.dead = true;
          break;
        }
        o.fuse--;
        if (o.fuse % 20 === 0 && o.fuse > 0) addEvent(state, { type: "beep", x: o.x + o.w / 2, y: o.y, fuse: o.fuse });
        if (o.fuse <= 0) {
          o.dead = true;
          explode(state, o, o.x + o.w / 2, o.y + o.h / 2);
          surfs = objectSurfaces(state);
        }
        break;
      }
      case "anvil": {
        updateAnvil(state, o, surfs);
        break;
      }
      case "gust": {
        if (--o.life <= 0) o.dead = true;
        break;
      }
      case "saw": {
        updateSaw(state, o, surfs);
        break;
      }
    }
  }
  if (state.objects.some((o) => o.dead)) state.objects = state.objects.filter((o) => !o.dead);
}

function gustPush(state, x, y) {
  let ax = 0;
  for (const g of state.objects) {
    if (g.type !== "gust" || g.dead || g.armed > 0) continue;
    const d = (x - g.x) * g.dir;
    if (d >= 0 && d <= g.len && y > g.y - g.hh && y < g.y + g.hh) ax += g.dir;
  }
  return ax;
}

function springUnder(state, x0, x1, bottom) {
  for (const s of state.objects) {
    if (s.type !== "spring" || s.dead || s.armed > 0) continue;
    if (x1 <= s.x || x0 >= s.x + s.w) continue;
    if (bottom >= s.y - 2 && bottom <= s.y + s.h + 1) return s;
  }
  return null;
}

function updateAnvil(state, o, surfs) {
  if (o.resting >= 0) {
    settle(state, o, surfs);
    if (--o.resting <= 0 || o.y > 1100) o.dead = true;
    return;
  }
  o.vx += gustPush(state, o.x + o.w / 2, o.y + o.h / 2) * 0.1;
  o.x += o.vx;
  const prevBottom = o.y + o.h;
  o.vy = Math.min(o.vy + OBJ.gravity, OBJ.maxFall);
  const ny = o.y + o.vy;
  if (o.vy > 0) {
    const s = springUnder(state, o.x, o.x + o.w, ny + o.h);
    if (s) {
      o.vy = -13;
      o.y = s.y - o.h;
      s.uses--;
      if (s.uses <= 0) s.dead = true;
      addEvent(state, { type: "spring", x: s.x + s.w / 2, y: s.y, seat: -1, owner: s.owner });
      return;
    }
    // Every surface crossed this tick at the highest top.
    let top = Infinity;
    for (const sf of surfs) {
      if (o.x + o.w <= sf.x0 + 2 || o.x >= sf.x1 - 2) continue;
      if (prevBottom <= sf.top + 0.01 && ny + o.h >= sf.top && sf.top < top) top = sf.top;
    }
    if (top < Infinity) {
      let stopped = false;
      for (const sf of surfs) {
        if (sf.top !== top || o.x + o.w <= sf.x0 + 2 || o.x >= sf.x1 - 2) continue;
        if (sf.kind === "obj") {
          const w = state.objects.find((q) => q.id === sf.id);
          if (w) w.dead = true;
          continue;
        }
        const t = getTile(state, sf.id);
        if (t.kind === "crumble") breakTile(state, t, o.owner, "anvil");
        else {
          damageTile(state, t, 2, o.owner, "anvil");
          if (isSolid(t)) stopped = true;
        }
      }
      o.breaks++;
      addEvent(state, { type: "anvilHit", x: o.x + o.w / 2, y: top, owner: o.owner });
      if (stopped) {
        o.y = top - o.h;
        o.vy = 0;
        o.vx = 0;
        o.resting = OBJ.anvil.restLife;
        return;
      }
      if (o.breaks >= OBJ.anvil.maxBreaks) {
        o.dead = true;
        addEvent(state, { type: "anvilBreak", x: o.x + o.w / 2, y: top });
        return;
      }
      o.vy *= 0.6;
      o.vx *= 0.5;
    }
  }
  o.y = ny;
  if (o.y > 1100 || o.x < -300 || o.x > 1900) o.dead = true;
}

function updateSaw(state, o, surfs) {
  if (--o.life <= 0) {
    o.dead = true;
    addEvent(state, { type: "sawEnd", x: o.x, y: o.y });
    return;
  }
  // Rolling on a coated surface changes the saw's speed.
  let speed = OBJ.saw.speed;
  if (o.onTop !== null) {
    for (const c of state.objects) {
      if (c.type !== "coat" || c.dead || c.y !== o.onTop || o.x < c.x0 || o.x > c.x1) continue;
      if (c.coat === "glue") speed = 2.8;
      else if (c.coat === "oil") speed = 10.5;
    }
  }
  const g = gustPush(state, o.x, o.y);
  if (g !== 0 && sign(g) !== o.dir && o.age % 30 === 0) {
    // A strong enough gust turns a saw around.
    o.dir = sign(g);
    o.redirectedBy = -1;
  }
  const nx = o.x + o.dir * speed;
  // Walls and bumpers reflect it.
  for (const q of state.objects) {
    if (q.dead) continue;
    if (q.type === "wall" && circleBox(nx, o.y, o.r, q.x, q.y, q.w, q.h)) {
      o.dir = o.x < q.x + q.w / 2 ? -1 : 1;
      addEvent(state, { type: "reflect", x: o.x, y: o.y });
      return;
    }
    if (q.type === "bumper" && q.armed === 0) {
      const dx = nx - q.x;
      const dy = o.y - q.y;
      if (dx * dx + dy * dy < (q.r + o.r) * (q.r + o.r)) {
        o.dir = dx < 0 ? -1 : 1;
        addEvent(state, { type: "reflect", x: o.x, y: o.y });
        return;
      }
    }
  }
  o.x = nx;
  const s = springUnder(state, o.x - o.r, o.x + o.r, o.y + o.r);
  if (s && o.vy >= 0) {
    o.vy = -13;
    s.uses--;
    if (s.uses <= 0) s.dead = true;
    addEvent(state, { type: "spring", x: s.x + s.w / 2, y: s.y, seat: -1, owner: s.owner });
  }
  // Fall and land on surfaces.
  const prevBottom = o.y + o.r;
  o.vy = Math.min(o.vy + OBJ.gravity, OBJ.maxFall);
  let ny = o.y + o.vy;
  o.onTop = null;
  if (o.vy >= 0) {
    let best = null;
    for (const sf of surfs) {
      if (o.x < sf.x0 || o.x > sf.x1) continue;
      if (prevBottom <= sf.top + 0.01 && ny + o.r >= sf.top && (!best || sf.top < best.top)) best = sf;
    }
    if (best) {
      ny = best.top - o.r;
      o.vy = 0;
      o.onTop = best.top;
    }
  }
  o.y = ny;
  if (o.onTop !== null) {
    // Cut what it rolls over.
    for (const t of state.tiles) {
      if (!isSolid(t) || t.kind === "halo" || t.y !== o.onTop) continue;
      if (o.x + o.r * 0.5 < t.x || o.x - o.r * 0.5 > t.x + t.w) continue;
      if (t.kind === "crumble") {
        if (t.stress < 0.8) {
          t.stress = 0.8;
          t.stressBy = o.owner;
          t.stressAt = state.tick;
          t.stressCause = "saw";
          addEvent(state, { type: "cut", x: o.x, y: t.y });
        }
      } else if (!o.hit.includes(t.id)) {
        o.hit.push(t.id);
        damageTile(state, t, 1, o.owner, "saw");
      }
    }
  }
  if (o.y > 1100 || o.x < -300 || o.x > 1900) o.dead = true;
}

