// Stage hazards: what makes sturdy slabs dangerous on a rhythm. Every hazard
// is announced before it acts (a lane warning, a shadow, a siren). Hazards
// have no owner; a player who steers one (a wall or bumper that reflects a
// comet, a gust that turns it) is credited with what it does next.

import { PLAYER } from "./constants.js";
import { rand, randInt, randRange } from "./rng.js";
import { addEvent, blame, circleBox, sign } from "./common.js";
import { isSolid, breakTile, damageTile } from "./tiles.js";

export const HAZ = Object.freeze({
  comet: { r: 26, knockX: 15, knockY: -7, hitCool: 30 },
  rock: { r: 30, startVy: 6, accel: 0.5, push: 11, side: 4 },
});

export function newHazardState(stage) {
  return {
    // Ticks until each of the stage's hazard specs next fires.
    timers: stage.hazards.map((h, i) => 300 + 90 * i),
    list: [], // active warnings and hazards
    tide: stage.hazards.some((h) => h.type === "tide")
      ? { level: stage.hazards.find((h) => h.type === "tide").low, phase: "calm", timer: 0, spec: stage.hazards.findIndex((h) => h.type === "tide") }
      : null,
    gale: null, // { phase: "warn" | "blow", dir, timer, force }
  };
}

export function updateHazards(state, stage) {
  const hz = state.hazards;
  if (state.phase === "play") {
    stage.hazards.forEach((spec, i) => {
      if (spec.type === "tide" && hz.tide.phase !== "calm") return;
      if (spec.type === "gale" && hz.gale) return;
      if (--hz.timers[i] > 0) return;
      hz.timers[i] = Math.round(randInt(state, spec.every[0], spec.every[1]) * state.hazardMult);
      fire(state, spec);
    });
  }
  updateTide(state, stage);
  updateGale(state);
  for (const h of hz.list) {
    switch (h.type) {
      case "cometWarn":
        if (--h.timer <= 0) {
          h.dead = true;
          hz.list.push({ type: "comet", x: h.dir > 0 ? -60 : 1660, y: h.y, r: HAZ.comet.r, vx: h.dir * h.speed, redirectedBy: -1, cool: [0, 0, 0, 0] });
          addEvent(state, { type: "comet", y: h.y, dir: h.dir });
        }
        break;
      case "comet":
        updateComet(state, h);
        break;
      case "rockWarn":
        if (--h.timer <= 0) {
          h.dead = true;
          hz.list.push({ type: "rock", x: h.x, y: -80, r: HAZ.rock.r, vy: HAZ.rock.startVy });
          addEvent(state, { type: "rockDrop", x: h.x });
        }
        break;
      case "rock":
        updateRock(state, h);
        break;
    }
  }
  if (hz.list.some((h) => h.dead)) hz.list = hz.list.filter((h) => !h.dead);
}

function fire(state, spec) {
  const hz = state.hazards;
  switch (spec.type) {
    case "comet": {
      const y = spec.lanes[randInt(state, 0, spec.lanes.length - 1)] - HAZ.comet.r + 2;
      const dir = rand(state) < 0.5 ? 1 : -1;
      hz.list.push({ type: "cometWarn", y, dir, timer: spec.warn, warn: spec.warn, speed: spec.speed });
      addEvent(state, { type: "warn", hazard: "comet", y, dir });
      break;
    }
    case "rockfall": {
      let x;
      const slabs = state.tiles.filter((t) => t.kind === "sturdy" && isSolid(t));
      const players = state.players.filter((p) => p.status === "play" && p.invuln === 0);
      const roll = rand(state);
      if (roll < spec.sturdyBias && slabs.length) {
        const s = slabs[randInt(state, 0, slabs.length - 1)];
        x = randRange(state, s.x + 20, s.x + s.w - 20);
      } else if (roll < spec.sturdyBias + 0.25 && players.length) {
        const p = players[randInt(state, 0, players.length - 1)];
        x = p.x + p.w / 2;
      } else {
        x = randRange(state, 150, 1450);
      }
      hz.list.push({ type: "rockWarn", x, timer: spec.warn, warn: spec.warn });
      addEvent(state, { type: "warn", hazard: "rock", x });
      break;
    }
    case "tide": {
      hz.tide.phase = "warn";
      hz.tide.timer = spec.warn;
      addEvent(state, { type: "warn", hazard: "tide" });
      break;
    }
    case "gale": {
      const dir = rand(state) < 0.5 ? 1 : -1;
      hz.gale = { phase: "warn", dir, timer: spec.warn, warn: spec.warn, force: spec.force, duration: spec.duration };
      addEvent(state, { type: "warn", hazard: "gale", dir });
      break;
    }
  }
}

function updateComet(state, c) {
  // Gusts push comets; one that turns a comet around steers it.
  for (const g of state.objects) {
    if (g.type !== "gust" || g.armed > 0) continue;
    const d = (c.x - g.x) * g.dir;
    if (d < 0 || d > g.len || c.y < g.y - g.hh || c.y > g.y + g.hh) continue;
    const before = sign(c.vx);
    c.vx += g.dir * 0.15;
    if (sign(c.vx) !== before) c.redirectedBy = g.owner;
  }
  if (Math.abs(c.vx) < 2) c.vx = sign(c.vx || 1) * 2;
  c.x += c.vx;
  // Walls and bumpers reflect it, and whoever placed them now steers it.
  for (const o of state.objects) {
    if (o.dead) continue;
    if (o.type === "wall" && circleBox(c.x, c.y, c.r, o.x, o.y, o.w, o.h)) {
      c.vx = (c.x < o.x + o.w / 2 ? -1 : 1) * Math.abs(c.vx);
      c.redirectedBy = o.owner;
      o.dead = true;
      addEvent(state, { type: "reflect", x: c.x, y: c.y, hazard: "comet", owner: o.owner });
    } else if (o.type === "bumper" && o.armed === 0) {
      const dx = c.x - o.x;
      const dy = c.y - o.y;
      if (dx * dx + dy * dy < (c.r + o.r) * (c.r + o.r)) {
        c.vx = (dx < 0 ? -1 : 1) * Math.abs(c.vx);
        c.redirectedBy = o.owner;
        o.uses--;
        if (o.uses <= 0) o.dead = true;
        addEvent(state, { type: "reflect", x: c.x, y: c.y, hazard: "comet", owner: o.owner });
      }
    }
  }
  for (const p of state.players) {
    if (p.status !== "play" || p.invuln > 0 || c.cool[p.seat] > state.tick) continue;
    if (!circleBox(c.x, c.y, c.r, p.x, p.y, p.w, p.h)) continue;
    p.vx = sign(c.vx) * HAZ.comet.knockX;
    p.vy = HAZ.comet.knockY;
    p.ground = null;
    p.supportTiles = [];
    p.launched = PLAYER.launchedTicks;
    p.jumpHeld = false;
    p.drill = 0;
    c.cool[p.seat] = state.tick + HAZ.comet.hitCool;
    if (c.redirectedBy >= 0) blame(state, p, c.redirectedBy, "comet");
    addEvent(state, { type: "cometHit", seat: p.seat, x: c.x, y: c.y });
  }
  if (c.x < -120 || c.x > 1720) c.dead = true;
}

function updateRock(state, r) {
  r.vy += HAZ.rock.accel;
  r.y += r.vy;
  for (const p of state.players) {
    if (p.status !== "play" || p.invuln > 0) continue;
    if (!circleBox(r.x, r.y, r.r, p.x, p.y, p.w, p.h)) continue;
    p.vy = Math.max(p.vy, HAZ.rock.push);
    p.vx += (p.x + p.w / 2 < r.x ? -1 : 1) * HAZ.rock.side;
    p.ground = null;
    p.supportTiles = [];
    p.launched = PLAYER.launchedTicks;
    p.drill = 0;
    p.noContact = 6;
    addEvent(state, { type: "rockHit", seat: p.seat, x: r.x, y: r.y });
  }
  for (const o of state.objects) {
    if (o.dead) continue;
    if ((o.type === "wall" || o.type === "spring" || o.type === "anvil") && circleBox(r.x, r.y, r.r, o.x, o.y, o.w, o.h)) {
      o.dead = true;
      r.dead = true;
    }
  }
  if (!r.dead) {
    for (const t of state.tiles) {
      if (!isSolid(t) || t.kind === "halo") continue;
      if (!circleBox(r.x, r.y, r.r, t.x, t.y, t.w, t.h)) continue;
      if (t.kind === "crumble") breakTile(state, t, -1, "rock");
      else damageTile(state, t, 2, -1, "rock");
      r.dead = true;
    }
  }
  if (r.dead) addEvent(state, { type: "rockSmash", x: r.x, y: r.y });
  if (r.y > 1100) r.dead = true;
}

function updateTide(state, stage) {
  const t = state.hazards.tide;
  if (!t) return;
  const spec = stage.hazards[t.spec];
  switch (t.phase) {
    case "warn":
      if (--t.timer <= 0) {
        t.phase = "rise";
        t.timer = spec.rise;
        addEvent(state, { type: "tideRise" });
      }
      break;
    case "rise":
      t.timer--;
      t.level = spec.high + ((spec.low - spec.high) * t.timer) / spec.rise;
      if (t.timer <= 0) {
        t.phase = "hold";
        t.timer = spec.hold;
      }
      break;
    case "hold":
      t.level = spec.high;
      if (--t.timer <= 0) {
        t.phase = "fall";
        t.timer = spec.fall;
      }
      break;
    case "fall":
      t.timer--;
      t.level = spec.low - ((spec.low - spec.high) * t.timer) / spec.fall;
      if (t.timer <= 0) {
        t.phase = "calm";
        t.level = spec.low;
      }
      break;
  }
}

function updateGale(state) {
  const g = state.hazards.gale;
  state.wind = 0;
  if (!g) return;
  if (g.phase === "warn") {
    if (--g.timer <= 0) {
      g.phase = "blow";
      g.timer = g.duration;
      addEvent(state, { type: "galeBlow", dir: g.dir });
    }
  } else {
    state.wind = g.dir * g.force;
    if (--g.timer <= 0) state.hazards.gale = null;
  }
}

// The cause if a stage hazard eliminates p right now, else null.
export function hazardKill(state, p) {
  const t = state.hazards.tide;
  if (t && p.y + p.h > t.level + 8) return "tide";
  return null;
}

// The lethal line (tide level) or null, for bots and the client.
export function tideLevel(state) {
  return state.hazards.tide ? state.hazards.tide.level : null;
}
