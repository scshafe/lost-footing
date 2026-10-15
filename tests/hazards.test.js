import { test } from "node:test";
import assert from "node:assert/strict";
import { step, STAGES } from "../src/index.js";
import { addObject } from "../src/objects.js";
import { testMatch, place, run } from "./helpers.js";

const stage = (id) => STAGES.find((s) => s.id === id);

// Make hazard spec i fire on the next tick.
function fireNow(s, i) {
  s.hazards.timers[i] = 1;
  step(s, []);
}

test("every stage hazard is announced at least a second before it acts", () => {
  for (const st of STAGES) for (const h of st.hazards) assert.ok(h.warn >= 60, `${st.id} ${h.type} warns ${h.warn} ticks`);
});

test("comets are warned, then sweep players off the sturdy lane", () => {
  const s = testMatch({ stage: "yard" });
  const slab = stage("yard").slabs[0]; // left side slab, a comet lane
  const p = place(s, s.players[0], slab.x + 60, slab.y);
  // Only the lane at this slab's height.
  fireNow(s, 0);
  const warn = s.hazards.list.find((h) => h.type === "cometWarn");
  assert.ok(warn, "a lane warning");
  warn.y = slab.y - 24;
  warn.dir = 1;
  run(s, warn.timer + 1);
  const comet = s.hazards.list.find((h) => h.type === "comet");
  assert.ok(comet, "the comet arrives after its warning");
  let hit = false;
  for (let i = 0; i < 200 && !hit; i++) {
    p.vx = 0;
    step(s, []);
    hit = s.events.some((e) => e.type === "cometHit");
  }
  assert.ok(hit, "it hits a player standing in its lane");
  assert.ok(p.vx > 10, "and knocks them along");
  assert.equal(p.blame, null, "an unsteered comet credits nobody");
});

test("a wall reflects a comet, and its owner is credited with what it hits", () => {
  const s = testMatch({ stage: "yard" });
  const slab = stage("yard").slabs[1]; // right side slab
  const victim = place(s, s.players[0], slab.x + 100, slab.y);
  step(s, []);
  // A comet coming from the left, a wall of P2 to the right of the victim.
  s.hazards.list.push({ type: "comet", x: slab.x + 20, y: slab.y - 24, r: 26, vx: 8, redirectedBy: -1, cool: [9e9, 0, 0, 0] });
  addObject(s, { type: "wall", solid: true, owner: 1, x: slab.x + 140, y: slab.y - 90, w: 22, h: 90, life: 300 });
  let reflected = false;
  for (let i = 0; i < 40 && !reflected; i++) {
    step(s, []);
    reflected = s.events.some((e) => e.type === "reflect");
  }
  assert.ok(reflected);
  const comet = s.hazards.list.find((h) => h.type === "comet");
  assert.ok(comet.vx < 0, "heading back");
  assert.equal(comet.redirectedBy, 1);
  comet.cool[0] = 0;
  let hit = false;
  for (let i = 0; i < 40 && !hit; i++) {
    step(s, []);
    hit = s.events.some((e) => e.type === "cometHit");
  }
  assert.ok(hit);
  assert.equal(victim.blame.seat, 1, "P2 steered the comet");
});

test("rockfall marks a column, then smashes the platform it lands on", () => {
  const s = testMatch({ stage: "quarry" });
  const slab = stage("quarry").slabs[0];
  fireNow(s, 0);
  const warn = s.hazards.list.find((h) => h.type === "rockWarn");
  assert.ok(warn, "a shadow first");
  warn.x = slab.x + 200;
  // Clear the crumble tiles above the ledge so the rock reaches it.
  for (const t of s.tiles) if (t.kind === "crumble" && t.y < slab.y) t.state = "gone", (t.timer = 1e9);
  const tile = s.tiles.find((t) => t.kind === "sturdy" && t.x === slab.x);
  const hp = tile.hp;
  run(s, warn.timer + 120);
  assert.equal(tile.hp, hp - 2, "the slab took the hit");
});

test("rocks push players down", () => {
  const s = testMatch({ stage: "quarry" });
  const slab = stage("quarry").slabs[0];
  const p = place(s, s.players[0], slab.x + 200 - 13, slab.y);
  step(s, []);
  s.hazards.list.push({ type: "rock", x: slab.x + 200, y: slab.y - 120, r: 30, vy: 8 });
  let hit = false;
  for (let i = 0; i < 20 && !hit; i++) {
    step(s, []);
    hit = s.events.some((e) => e.type === "rockHit");
  }
  assert.ok(hit);
  assert.ok(p.vy >= 10);
});

test("the tide floods the low islands after a warning and eliminates", () => {
  const s = testMatch({ stage: "tide" });
  const island = stage("tide").slabs[1];
  const p = place(s, s.players[0], island.x + 100, island.y);
  place(s, s.players[1], 800, 300); // a spectator, in the air
  s.players[1].status = "dead";
  const spec = stage("tide").hazards.findIndex((h) => h.type === "tide");
  fireNow(s, spec);
  assert.equal(s.hazards.tide.phase, "warn");
  let out = null;
  for (let i = 0; i < 400 && !out; i++) {
    p.vx = 0;
    step(s, []);
    out = s.events.find((e) => e.type === "ko");
  }
  assert.ok(out, "drowned");
  assert.equal(out.cause, "tide");
  assert.ok(s.tick > 120, "not before the warning ran out");
});

test("a gale blows players along after its warning", () => {
  const s = testMatch({ stage: "gale" });
  const slab = stage("gale").slabs[2];
  const p = place(s, s.players[0], slab.x + 47, slab.y);
  const spec = stage("gale").hazards.findIndex((h) => h.type === "gale");
  fireNow(s, spec);
  const g = s.hazards.gale;
  assert.equal(g.phase, "warn");
  const dir = g.dir;
  run(s, g.timer - 2);
  assert.equal(p.vx, 0, "nothing during the warning");
  run(s, 12);
  assert.notEqual(s.wind, 0);
  assert.ok(p.vx * dir > 1, `pushed downwind (${p.vx})`);
});
