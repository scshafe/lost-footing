// Bots. A bot reads only the match state and returns button presses, with its
// own seeded generator (state.botRng), so bot matches are deterministic. It
// picks safe footing, moves there and keeps moving, dodges announced hazards,
// recovers, and uses its kit when a move would hurt someone.

import { BTN } from "./input.js";
import { CRUMBLE } from "./constants.js";
import { rand } from "./rng.js";
import { sameTeam } from "./common.js";
import { CHARACTERS, lobVelocity, lobOrigin } from "./characters.js";
import { predictLob } from "./objects.js";

export const LEVELS = Object.freeze({
  easy: { reaction: 24, aimTol: 70, attackChance: 0.12, attackGap: 100, thinkEvery: 12, dodge: 0.55, recoverSmart: false },
  normal: { reaction: 12, aimTol: 45, attackChance: 0.35, attackGap: 45, thinkEvery: 6, dodge: 0.85, recoverSmart: true },
  hard: { reaction: 5, aimTol: 32, attackChance: 0.8, attackGap: 18, thinkEvery: 3, dodge: 1, recoverSmart: true },
});

export function newBotMemory() {
  return { target: null, guard: null, rethink: 0, pace: 1, lastAttack: -9999, holdJump: 0, upWasDown: false, wantJump: false, wantAirJump: false, alert: true, stuck: 0, lastX: 0, dropFor: 0 };
}

// ---- Reading the stage --------------------------------------------------

// Contiguous runs of solid tiles at one height: what a bot can stand on.
// Bots see another player's hollow tiles shimmer; only hard bots see through
// a decoy.
function segments(state, seat, seesDecoys = false) {
  const byTop = new Map();
  for (const t of state.tiles) {
    if (t.state !== "solid") continue;
    if (t.kind === "halo" && t.owner !== seat) continue;
    if (t.kind === "decoy" && t.owner !== seat && seesDecoys) continue;
    if ((t.hollow > 0 || t.hollowArm > 0) && t.hollowBy !== seat) continue;
    if (!byTop.has(t.y)) byTop.set(t.y, []);
    byTop.get(t.y).push(t);
  }
  const segs = [];
  for (const [top, list] of byTop) {
    list.sort((a, b) => a.x - b.x);
    let cur = null;
    for (const t of list) {
      if (cur && t.x <= cur.x1 + 1) {
        cur.x1 = Math.max(cur.x1, t.x + t.w);
        cur.tiles.push(t);
      } else {
        cur = { top, x0: t.x, x1: t.x + t.w, tiles: [t] };
        segs.push(cur);
      }
    }
  }
  return segs;
}

function stressAt(seg, x) {
  let worst = 0;
  for (const t of seg.tiles) {
    if (x + 30 < t.x || x - 30 > t.x + t.w) continue;
    const s = t.kind === "crumble" ? t.stress : t.kind === "decoy" && t.life < 90 ? 0.9 : t.kind === "ledge" || t.kind === "halo" || t.kind === "decoy" || t.kind === "leaf" ? 0.3 : 0;
    if (s > worst) worst = s;
  }
  return worst;
}

// How bad standing at (x, top) looks right now. Lower is better.
function danger(state, seg, x, top, me) {
  let d = 0;
  const st = stressAt(seg, x);
  d += st * 3 + (st >= CRUMBLE.shakeAt ? 3 : 0);
  const width = seg.x1 - seg.x0;
  if (width < 100) d += (100 - width) / 50;
  d += Math.min(x - seg.x0, seg.x1 - x) < 30 ? 0.6 : 0;
  for (const o of state.objects) {
    if (o.type === "coat" && o.y === top && x > o.x0 - 20 && x < o.x1 + 20) d += o.coat === "acid" ? 6 : o.coat === "glue" ? 4 : o.coat === "thorn" ? 3.5 : 2.5;
    else if (o.type === "charge") {
      const dx = o.x - x;
      const dy = o.y - top;
      if (dx * dx + dy * dy < 130 * 130) d += 6;
    } else if (o.type === "roots") {
      const dx = o.x - x;
      const dy = o.top - 6 - top;
      if (dx * dx + dy * dy < 140 * 140) d += 5;
    } else if (o.type === "saw" && o.onTop === top && (x - o.x) * o.dir > 0 && Math.abs(x - o.x) < 400) d += 2.5;
    else if (o.type === "spring" && o.owner !== me.seat && top === o.y + o.h && Math.abs(o.x + o.w / 2 - x) < 50) d += 2;
    else if (o.type === "gust" && o.owner !== me.seat) {
      const dd = (x - o.x) * o.dir;
      if (dd > 0 && dd < o.len && top - 20 > o.y - o.hh && top - 20 < o.y + o.hh) d += 1.5;
    }
  }
  for (const h of state.hazards.list) {
    if ((h.type === "cometWarn" || h.type === "comet") && Math.abs(h.y - (top - 20)) < 45) d += h.type === "comet" ? 3 : 2;
    else if ((h.type === "rockWarn" || h.type === "rock") && Math.abs(h.x - x) < 80) d += 5;
  }
  const tide = state.hazards.tide;
  if (tide) {
    if (tide.phase !== "calm" && top > 700) d += 10;
    else if (top > 740) d += 0.8;
  }
  const gale = state.hazards.gale;
  if (gale) {
    // Stay upwind: the far edge in the wind's direction is where you get blown.
    const downwind = gale.dir > 0 ? seg.x1 - x : x - seg.x0;
    if (downwind < 120) d += (120 - downwind) / 40;
  }
  // Prefer the middle of the stage and not too low.
  d += (Math.abs(x - 800) / 800) * 0.8;
  if (top > 760) d += 0.4;
  return d;
}

// An opponent falling with nothing under them, trying to get back.
function recovering(q, segs) {
  if (q.ground || q.status !== "play" || q.invuln > 0) return false;
  const x = q.x + q.w / 2;
  return !solidUnder(segs, x, q.y + q.h - 2, 260);
}

// The edge of the nearest platform a recovering player is heading for.
function recoveryEdge(q, segs) {
  const x = q.x + q.w / 2;
  let best = null;
  let bestD = Infinity;
  for (const s of segs) {
    if (s.top < q.y - 160) continue;
    for (const ex of [s.x0, s.x1]) {
      const d = Math.abs(ex - x) + Math.abs(s.top - q.y) * 0.5;
      if (d < bestD) {
        bestD = d;
        best = { x: ex, top: s.top, inward: ex === s.x0 ? 1 : -1 };
      }
    }
  }
  return best;
}

function feet(p) {
  return { x: p.x + p.w / 2, y: p.y + p.h };
}

// ---- Choosing where to stand --------------------------------------------

function chooseTarget(state, p, segs, mem) {
  const f = feet(p);
  const myTop = p.ground ? p.groundTop : f.y;
  let best = null;
  let bestScore = Infinity;
  for (const seg of segs) {
    // From the ground: one tier up at most; from the air: what we can still fall onto.
    if (p.ground && seg.top < myTop - 150) continue;
    if (!p.ground && seg.top < f.y - (p.jumpsLeft > 0 ? 100 : 5)) continue;
    const lo = seg.x0 + 18;
    const hi = seg.x1 - 18;
    if (hi < lo) continue;
    const step = Math.max(24, (hi - lo) / 6);
    for (let x = lo; x <= hi + 0.1; x += step) {
      let score = danger(state, seg, x, seg.top, p);
      const dx = Math.abs(x - f.x);
      const dy = seg.top - myTop;
      score += dx / 450;
      if (dy < -20) score += 0.8; // climbing costs effort
      if (dy > 200) score += 0.6;
      if (!p.ground) {
        // In the air, prefer what we can reach before falling past it.
        const fallRoom = Math.max(1, seg.top - f.y + (p.jumpsLeft > 0 ? 110 : 0));
        if (dx > fallRoom * 1.1 + 60) score += 4;
        score += dx / 200;
      }
      if (mem.target && mem.target.top === seg.top && Math.abs(mem.target.x - x) < step) score -= 0.5;
      if (mem.guard && mem.guard.top === seg.top && Math.abs(mem.guard.x + mem.guard.inward * 40 - x) < 40) score -= 1.4;
      for (const q of state.players) {
        if (q === p || q.status !== "play") continue;
        if (Math.abs(q.x + q.w / 2 - x) < 40 && Math.abs(q.y + q.h - seg.top) < 10) score += 0.4;
      }
      if (score < bestScore) {
        bestScore = score;
        best = { x, top: seg.top, x0: seg.x0, x1: seg.x1, score };
      }
    }
  }
  return best;
}

function solidUnder(segs, x, fromY, maxDepth = 2000) {
  let found = null;
  for (const s of segs) {
    if (x < s.x0 - 4 || x > s.x1 + 4 || s.top < fromY - 1 || s.top > fromY + maxDepth) continue;
    if (!found || s.top < found.top) found = s;
  }
  return found;
}

// ---- The bot's tick -----------------------------------------------------

export function botButtons(state, seat) {
  const p = state.players[seat];
  const mem = state.bots[seat];
  if (!mem || p.status !== "play") return 0;
  const lv = LEVELS[p.difficulty] || LEVELS.normal;
  const segs = segments(state, seat, p.difficulty === "hard");
  const f = feet(p);

  // Edge-guard: notice an opponent trying to get back on stage.
  mem.guard = null;
  if (lv.recoverSmart && p.ground) {
    for (const q of state.players) {
      if (sameTeam(p, q) || !recovering(q, segs)) continue;
      const edge = recoveryEdge(q, segs);
      if (edge && Math.abs(edge.top - p.groundTop) < 140 && Math.abs(edge.x - f.x) < 320) mem.guard = edge;
    }
    if (mem.guard && mem.rethink > 4) mem.rethink = 4;
  }
  // Rethink the target every so often, or at once when it is gone or bad.
  mem.rethink--;
  const tgtSeg = mem.target && segs.find((s) => s.top === mem.target.top && mem.target.x >= s.x0 && mem.target.x <= s.x1);
  if (!tgtSeg || mem.rethink <= 0) {
    mem.target = chooseTarget(state, p, segs, mem);
    mem.rethink = lv.reaction + Math.floor(rand(state, "botRng") * lv.reaction);
  }
  let btn = 0;
  const t = mem.target;

  if (t) btn |= navigate(state, p, mem, t, segs, f);
  btn |= dodge(state, p, mem, segs, f, lv);
  btn = recover(state, p, mem, segs, f, btn, lv);
  btn = jumpControl(p, mem, btn);
  const attack = state.phase === "play" ? chooseAttack(state, p, mem, segs, lv) : 0;
  if (attack) btn = (btn & ~(BTN.LEFT | BTN.RIGHT | BTN.UP)) | attack;
  return btn;
}

function navigate(state, p, mem, t, segs, f) {
  let btn = 0;
  const dx = t.x - f.x;
  const grounded = !!p.ground;
  const myTop = grounded ? p.groundTop : f.y;
  const toward = dx > 0 ? BTN.RIGHT : BTN.LEFT;

  if (grounded) {
    if (t.top < myTop - 10) {
      // Above: get under or beside it, then jump.
      const under = f.x > t.x0 - 50 && f.x < t.x1 + 50;
      if (under) {
        mem.wantJump = true;
        btn |= Math.abs(dx) > 10 ? toward : 0;
      } else {
        btn |= toward;
      }
    } else if (t.top > myTop + 10) {
      // Below: drop if it is straight down, else walk off toward it.
      const below = f.x > t.x0 + 6 && f.x < t.x1 - 6;
      if (below && p.ground.kind === "tile" && mem.dropFor <= 0) {
        btn |= BTN.DOWN;
        mem.dropFor = 20;
      } else {
        btn |= toward;
      }
    } else if (Math.abs(dx) > 26) {
      btn |= toward;
      // A gap on the way: jump it.
      const ahead = f.x + (dx > 0 ? 34 : -34);
      const floor = solidUnder(segs, ahead, myTop, 4);
      if (!floor && Math.abs(dx) > 40) mem.wantJump = true;
    } else {
      // Arrived: pace back and forth so the tiles hold.
      const lo = Math.max(t.x0 + 16, t.x - 34);
      const hi = Math.min(t.x1 - 16, t.x + 34);
      if (f.x <= lo) mem.pace = 1;
      else if (f.x >= hi) mem.pace = -1;
      btn |= mem.pace > 0 ? BTN.RIGHT : BTN.LEFT;
    }
  } else {
    // Airborne: steer for the target.
    if (Math.abs(dx) > 6) btn |= toward;
    // Fast fall onto a target well below when right above it.
    if (t.top > f.y + 120 && Math.abs(dx) < 30 && p.vy > 0) btn |= BTN.DOWN;
  }
  if (mem.dropFor > 0) mem.dropFor--;
  // Unstick: no progress while trying to move.
  if (grounded && Math.abs(p.x - mem.lastX) < 0.2 && btn & (BTN.LEFT | BTN.RIGHT)) {
    if (++mem.stuck > 20) {
      mem.wantJump = true;
      mem.stuck = 0;
    }
  } else {
    mem.stuck = 0;
  }
  mem.lastX = p.x;
  return btn;
}

function dodge(state, p, mem, segs, f, lv) {
  let btn = 0;
  // Whether this bot is paying attention is rolled every half second.
  if (state.tick % 30 === p.seat) mem.alert = rand(state, "botRng") < lv.dodge;
  if (!mem.alert) return 0;
  const cy = p.y + p.h / 2;
  for (const h of state.hazards.list) {
    if (h.type === "comet" && Math.abs(h.y - cy) < 50) {
      const dist = (f.x - h.x) * Math.sign(h.vx);
      if (dist > 0 && dist < Math.abs(h.vx) * 22 && p.ground) mem.wantJump = true;
    } else if (h.type === "cometWarn" && h.timer < 30 && Math.abs(h.y - cy) < 50 && p.ground) {
      const from = h.dir > 0 ? 0 : 1600;
      const dist = Math.abs(f.x - from);
      if (dist < h.speed * (h.timer + 22) && dist > h.speed * h.timer) mem.wantJump = true;
    } else if ((h.type === "rockWarn" && h.timer < 60) || h.type === "rock") {
      if (Math.abs(h.x - f.x) < 60 && h.y < p.y) btn |= h.x > f.x ? BTN.LEFT : BTN.RIGHT;
    }
  }
  for (const o of state.objects) {
    if (o.type === "saw" && p.ground && o.onTop === p.groundTop) {
      const dist = (f.x - o.x) * o.dir;
      if (dist > 0 && dist < 70) mem.wantJump = true;
    }
  }
  if (p.surface === "glue") mem.wantJump = true;
  const tide = state.hazards.tide;
  if (tide && tide.phase !== "calm" && f.y > 690 && p.ground) mem.wantJump = true;
  return btn;
}

function recover(state, p, mem, segs, f, btn, lv) {
  if (p.ground) return btn;
  const under = solidUnder(segs, f.x, f.y - 2);
  const t = mem.target;
  const falling = p.vy > 1;
  const lost = !under || (t && f.y > t.top + 4);
  const tideDanger = state.hazards.tide && state.hazards.tide.phase !== "calm" && f.y > state.hazards.tide.level - 120;
  if (falling && (lost || tideDanger)) {
    if (p.jumpsLeft > 0) mem.wantAirJump = true;
    else if (lv.recoverSmart && p.cd[1] === 0 && p.character === "mason" && f.y > 300) return (btn & ~BTN.UP) | BTN.TRICK;
    else if (lv.recoverSmart && p.cd[0] === 0 && (p.character === "pip" || p.character === "fuse" || p.character === "dab")) return btn | BTN.PLACE;
  }
  // Toward the stage when far out.
  if (f.x < 120) btn = (btn & ~BTN.LEFT) | BTN.RIGHT;
  if (f.x > 1480) btn = (btn & ~BTN.RIGHT) | BTN.LEFT;
  return btn;
}

// Turn "want to jump" into presses: hold for a full jump, release to air jump.
function jumpControl(p, mem, btn) {
  if (mem.holdJump > 0) {
    mem.holdJump--;
    btn |= BTN.UP;
  } else if (mem.wantJump && p.ground) {
    if (mem.upWasDown) {
      btn &= ~BTN.UP; // release first
    } else {
      btn |= BTN.UP;
      mem.holdJump = 16;
      mem.wantJump = false;
    }
  } else if (mem.wantAirJump && !p.ground) {
    if (mem.upWasDown) btn &= ~BTN.UP;
    else {
      btn |= BTN.UP;
      mem.holdJump = 14;
      mem.wantAirJump = false;
    }
  }
  if (!p.ground && mem.wantJump && p.coyote <= 0) mem.wantJump = false;
  if (p.ground) mem.wantAirJump = false;
  mem.upWasDown = !!(btn & BTN.UP);
  return btn;
}

// ---- Using the kit ------------------------------------------------------

const AIMS = [0, BTN.UP, -1]; // neutral, high lob, far (forward held)

function opponents(state, p, segs) {
  return state.players
    .filter((q) => !sameTeam(p, q) && q.status === "play" && q.invuln === 0)
    .map((q) => ({ ...q, rec: recovering(q, segs), edge: recovering(q, segs) ? recoveryEdge(q, segs) : null, ground: q.ground }));
}

function chooseAttack(state, p, mem, segs, lv) {
  if (state.tick - mem.lastAttack < lv.attackGap) return 0;
  if ((state.tick + p.seat) % 3 !== 0) return 0;
  if (p.drill !== 0) return 0;
  const ch = CHARACTERS[p.character];
  if (!ch) return 0;
  const opps = opponents(state, p, segs);
  if (!opps.length) return 0;
  const options = [];
  for (let slot = 0; slot < 3; slot++) {
    if (p.cd[slot] > 0) continue;
    const name = ch.moves[slot].name;
    const press = [BTN.PLACE, BTN.TRICK, BTN.BREAK][slot];
    const plan = planMove(state, p, name, opps, segs, lv);
    if (plan) options.push({ value: plan.value, btn: press | plan.extra });
  }
  if (!options.length) return 0;
  options.sort((a, b) => b.value - a.value);
  if (rand(state, "botRng") > lv.attackChance) return 0;
  mem.lastAttack = state.tick;
  return options[0].btn;
}

function dirBtn(d) {
  return d > 0 ? BTN.RIGHT : BTN.LEFT;
}

// Would this lob land near an opponent's feet? Try the three aims both ways.
function planLob(state, p, opps, lv, wantSlab) {
  let best = null;
  for (const facing of [1, -1]) {
    for (const aim of AIMS) {
      // Neutral and high throws keep the current facing, so only "far" can turn around.
      if (facing !== p.facing && aim !== -1) continue;
      const fake = { x: p.x, y: p.y, w: p.w, h: p.h, facing };
      const btn = aim === -1 ? dirBtn(facing) : aim;
      const v = lobVelocity(fake, btn);
      const o = lobOrigin(fake);
      const land = predictLob(state, o.x, o.y, v.vx, v.vy, 100);
      if (!land || land.kind !== "tile") continue;
      if (Math.abs(land.x - (p.x + p.w / 2)) < 70 && Math.abs(land.y - (p.ground ? p.groundTop : p.y + p.h)) < 10) continue; // not on myself
      for (const q of opps) {
        let qx = q.x + q.w / 2 + q.vx * 12;
        let qTop = q.ground ? q.groundTop : null;
        if (qTop === null && q.edge) {
          qx = q.edge.x + q.edge.inward * 30;
          qTop = q.edge.top;
        }
        if (qTop === null || Math.abs(land.y - qTop) > 2) continue;
        const miss = Math.abs(land.x - qx);
        if (miss > lv.aimTol) continue;
        let value = 3 - miss / 40;
        if (wantSlab && state.tiles.some((t) => t.kind === "sturdy" && t.y === qTop && qx >= t.x && qx <= t.x + t.w)) value += 1.5;
        if (!best || value > best.value) best = { value, extra: btn };
      }
    }
  }
  return best;
}

function planMove(state, p, name, opps, segs, lv) {
  const f = feet(p);
  const grounded = !!p.ground;
  switch (name) {
    case "Glue":
    case "Oil":
    case "Acid":
    case "Charge":
      return planLob(state, p, opps, lv, name === "Acid" || name === "Charge");
    case "Saw": {
      if (!grounded) return null;
      for (const q of opps) {
        if (!q.ground || q.groundTop !== p.groundTop) continue;
        const dx = q.x + q.w / 2 - f.x;
        if (Math.abs(dx) < 60 || Math.abs(dx) > 420) continue;
        return { value: 3, extra: dirBtn(dx) };
      }
      return null;
    }
    case "Ingot":
    case "Anvil": {
      for (const q of opps) {
        if (!q.ground) continue;
        const dx = q.x + q.w / 2 - f.x;
        const dy = q.groundTop - (p.y + p.h);
        if (dy < -20 || Math.abs(dx) > 260) continue;
        // Rough arc: forward 3.5 to 5 px/tick, up 5, gravity 0.6.
        const fwd = Math.abs(dx) > 120 ? 5 : 3.5;
        const tFall = (5 + Math.sqrt(25 + 1.2 * Math.max(0, dy + 20))) / 0.6;
        const reach = fwd * tFall;
        if (Math.abs(Math.abs(dx) - reach) < lv.aimTol) return { value: 2.5, extra: fwd === 5 ? dirBtn(dx) : dx * p.facing > 0 ? 0 : dirBtn(dx) };
      }
      return null;
    }
    case "Drill": {
      for (const q of opps) {
        const dx = Math.abs(q.x + q.w / 2 - f.x);
        const below = q.y - (p.y + p.h);
        if (dx < 24 && below > 30 && below < 400) return { value: 3.5, extra: 0 };
        // Break the floor under someone sharing my tiles, if there is ground below me.
        if (grounded && q.ground && q.groundTop === p.groundTop && dx < 70 && lv.recoverSmart) {
          const floor = solidUnder(segs, f.x, p.groundTop + 20, 300);
          if (floor && danger(state, floor, f.x, floor.top, p) < 3) return { value: 2, extra: 0 };
        }
      }
      return null;
    }
    case "Wall": {
      // Block an approaching opponent, or reflect a comet that is coming.
      for (const h of state.hazards.list) {
        if ((h.type === "cometWarn" || h.type === "comet") && Math.abs(h.y - (p.y + p.h / 2)) < 50 && grounded) {
          const fromLeft = h.type === "comet" ? h.vx > 0 : h.dir > 0;
          return { value: 2.5, extra: fromLeft ? BTN.LEFT : BTN.RIGHT };
        }
      }
      if (!grounded) return null;
      for (const q of opps) {
        const dx = q.x + q.w / 2 - f.x;
        if (q.rec && Math.abs(dx) > 40 && Math.abs(dx) < 150 && q.y + q.h > p.groundTop - 60) return { value: 2.5, extra: dirBtn(dx) };
        if (!q.ground || Math.abs(q.groundTop - p.groundTop) > 4) continue;
        if (Math.abs(dx) > 70 && Math.abs(dx) < 160 && q.vx * dx < 0) return { value: 1.5, extra: dirBtn(dx) };
      }
      return null;
    }
    case "Ledge":
      return null; // recovery only (see recover)
    case "Spring": {
      if (!grounded) return null;
      for (const q of opps) {
        if (!q.ground || Math.abs(q.groundTop - p.groundTop) > 4) continue;
        const dx = q.x + q.w / 2 - f.x;
        if (Math.abs(dx) < 70 || Math.abs(dx) > 220 || q.vx * dx >= 0) continue;
        // Angle it so it throws them outward, toward the nearer side.
        const springX = f.x + Math.sign(dx) * 40;
        const outward = springX < 800 ? BTN.LEFT : BTN.RIGHT;
        // Placing toward the opponent needs facing them; the angle key also sets facing.
        if ((outward === BTN.RIGHT) === dx > 0) return { value: 2, extra: outward };
        if (p.facing === Math.sign(dx)) return { value: 1.2, extra: 0 };
      }
      return null;
    }
    case "Gust": {
      for (const q of opps) {
        if (q.rec) {
          const dx = q.x + q.w / 2 - f.x;
          if (Math.abs(dx) < 320 && Math.abs(q.y - p.y) < 90 && Math.sign(dx) !== (q.edge ? q.edge.inward : 0)) return { value: 3.5, extra: dirBtn(dx) };
        }
      }
      for (const q of opps) {
        const dx = q.x + q.w / 2 - f.x;
        const dy = Math.abs(q.y - p.y);
        if (Math.abs(dx) > 300 || Math.abs(dx) < 30 || dy > 50) continue;
        const dir = Math.sign(dx);
        // Worth it if it blows them toward the near edge of their ground.
        const qx = q.x + q.w / 2;
        const seg = q.ground && q.ground.kind === "tile" ? segs.find((s) => s.top === q.groundTop && qx >= s.x0 && qx <= s.x1) : null;
        const edge = seg ? (dir > 0 ? seg.x1 - qx : qx - seg.x0) : 999;
        if (!q.ground || edge < 140) return { value: 2.5, extra: dirBtn(dx) };
      }
      return null;
    }
    case "Decoy":
      return null; // recovery only (see recover)
    case "Lodestone": {
      // Worth placing when someone else's loose metal is about to be mine.
      const x = f.x + p.facing * 70;
      const y = p.y + p.h / 2 - 24;
      if (state.objects.some((o) => o.type === "magnet" && o.owner === p.seat && !o.dead)) return null;
      for (const o of state.objects) {
        if (o.owner === p.seat || o.dead) continue;
        if (o.type !== "anvil" && o.type !== "saw" && o.type !== "charge" && o.type !== "bumper" && o.type !== "lob") continue;
        const ox = o.w ? o.x + o.w / 2 : o.x;
        const oy = o.h ? o.y + o.h / 2 : o.y;
        if (Math.hypot(ox - x, oy - y) < 200) return { value: o.type === "charge" ? 3.5 : 2.5, extra: 0 };
      }
      return null;
    }
    case "Polarity": {
      const m = state.objects.find((o) => o.type === "magnet" && o.owner === p.seat && !o.dead && o.armed === 0 && o.mode === "pull");
      if (!m) return null;
      let metal = 0;
      for (const o of state.objects) {
        if (o.dead || o === m) continue;
        if (o.type !== "anvil" && o.type !== "saw" && o.type !== "charge" && o.type !== "bumper") continue;
        const ox = o.w ? o.x + o.w / 2 : o.x;
        const oy = o.h ? o.y + o.h / 2 : o.y;
        if (Math.hypot(ox - m.x, oy - m.y) < 60) metal++;
      }
      if (!metal) return null;
      for (const q of opps) if (Math.hypot(q.x + q.w / 2 - m.x, q.y + q.h / 2 - m.y) < 320) return { value: 3, extra: 0 };
      return null;
    }
    case "Vine":
      return null; // a ladder, for people
    case "Thorns": {
      if (!grounded) return null;
      for (const q of opps) {
        if (!q.ground || q.ground.kind !== "tile" || Math.abs(q.groundTop - p.groundTop) > 4) continue;
        const dx = q.x + q.w / 2 - f.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) < 170) return { value: 2.5, extra: dirBtn(dx) };
      }
      return null;
    }
    case "Roots": {
      if (!grounded || !lv.recoverSmart) return null;
      for (const q of opps) {
        if (!q.ground || q.ground.kind !== "tile") continue;
        const dx = q.x + q.w / 2 - f.x;
        const seedX = f.x + Math.sign(dx) * 110;
        if (Math.abs(q.x + q.w / 2 - seedX) < 70 && Math.abs(q.groundTop - p.groundTop) < 30) return { value: 3, extra: dirBtn(dx) };
      }
      return null;
    }
    case "Hollow": {
      if (!grounded) return null;
      for (const q of opps) {
        if (!q.ground || q.ground.kind !== "tile" || Math.abs(q.groundTop - p.groundTop) > 4) continue;
        const dx = q.x + q.w / 2 - f.x;
        if (Math.abs(dx) > 40 && Math.abs(dx) < 140) return { value: 3, extra: dirBtn(dx) };
      }
      return null;
    }
    case "Rub out": {
      if (!grounded) return null;
      for (const q of opps) {
        if (!q.ground || Math.abs(q.groundTop - p.groundTop) > 4) continue;
        const dx = q.x + q.w / 2 - f.x;
        if (Math.abs(dx) > 50 && Math.abs(dx) < 180 && q.vx * dx <= 0.5) return { value: 2.5, extra: dirBtn(dx) };
      }
      return null;
    }
    case "Bumper": {
      for (const q of opps) {
        if (q.rec && grounded) {
          const dx = q.x + q.w / 2 - f.x;
          if (Math.abs(dx) < 170 && q.y - p.y > -40 && q.y - p.y < 220) return { value: 3, extra: dirBtn(dx) };
        }
      }
      for (const q of opps) {
        const dx = q.x + q.w / 2 - f.x;
        const dy = q.y - p.y;
        if (!q.ground && Math.abs(dx) > 40 && Math.abs(dx) < 110 && dy > -20 && dy < 120) return { value: 2.5, extra: dirBtn(dx) };
        if (q.ground && grounded && Math.abs(q.groundTop - p.groundTop) < 4 && Math.abs(dx) > 90 && Math.abs(dx) < 170 && q.vx * dx < 0) {
          return { value: 1.5, extra: dirBtn(dx) };
        }
      }
      return null;
    }
  }
  return null;
}

