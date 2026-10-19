import { test } from "node:test";
import assert from "node:assert/strict";
import { step, BTN, hashState, createMatch, STAGES } from "../src/index.js";
import { testMatch, place, run } from "./helpers.js";

const stage = (id) => STAGES.find((s) => s.id === id);

function match(id) {
  return testMatch({ stage: id, seats: [{ kind: "human", character: "mason" }, { kind: "human", character: "glim" }] });
}

test("a conveyor belt carries whoever stands on it, and standing still still crumbles the tile", () => {
  const s = match("belts");
  const row = stage("belts").rows[0]; // moves right at 1.2
  const p = place(s, s.players[0], row.x + 40, row.y);
  s.hazards.belts.timer = 99999; // no reversal during the test
  run(s, 5);
  const x0 = p.x;
  run(s, 30);
  assert.ok(Math.abs(p.x - x0 - 30 * 1.2) < 0.5, `carried ${(p.x - x0).toFixed(1)} px in 30 ticks`);
  assert.ok(p.ground, "still standing");
  const left = stage("belts").rows[1]; // moves left
  const q = place(s, s.players[1], left.x + 200, left.y);
  run(s, 5);
  const qx = q.x;
  run(s, 20);
  assert.ok(q.x < qx - 20, "the other belt runs the other way");
});

test("belts stop for a warning, then run the other way", () => {
  const s = match("belts");
  const row = stage("belts").rows[0];
  const p = place(s, s.players[0], row.x + 40, row.y);
  s.hazards.belts.timer = 5;
  let warned = false;
  let flipped = false;
  for (let i = 0; i < 400 && !flipped; i++) {
    p.vx = 0;
    step(s, []);
    for (const t of s.tiles) t.stress = 0; // standing still would crumble the tile
    if (s.events.some((e) => e.type === "warn" && e.hazard === "belts")) warned = true;
    if (s.events.some((e) => e.type === "beltsFlip")) flipped = true;
    if (s.hazards.belts.phase === "stop") assert.equal(s.tiles.find((t) => t.beltDir).belt, 0, "stopped while warning");
  }
  assert.ok(warned && flipped);
  assert.equal(s.hazards.belts.sign, -1);
  const x0 = p.x;
  s.hazards.belts.timer = 99999;
  run(s, 20);
  assert.ok(p.x < x0 - 15, "carried left now");
});

test("a bobbing deck carries a player up and down without dropping them", () => {
  const s = match("swell");
  const row = stage("swell").rows[0];
  const p = place(s, s.players[0], row.x + 60, row.y);
  step(s, []);
  let lowest = Infinity;
  let highest = -Infinity;
  for (let i = 0; i < 600; i++) {
    p.vx = 0;
    step(s, []);
    p.stillTicks = 0; // standing still would crumble the tile (a different test)
    for (const t of s.tiles) if (t.state === "solid" && t.kind === "crumble") t.stress = 0;
    assert.ok(p.ground, `grounded on tick ${i}`);
    assert.ok(Math.abs(p.y + p.h - p.groundTop) < 0.01);
    lowest = Math.min(lowest, p.y);
    highest = Math.max(highest, p.y);
  }
  assert.ok(highest - lowest > 60, `rode a ${(highest - lowest).toFixed(0)} px swing`);
});

test("the two halves of the deck heave out of step, and a wall rides its tile", () => {
  const s = match("swell");
  const [a, b] = stage("swell").rows;
  run(s, 135); // a quarter of the 540-tick period
  const ya = s.tiles.find((t) => t.x === a.x && t.homeY === a.y).y;
  const yb = s.tiles.find((t) => t.x === b.x && t.homeY === b.y).y;
  assert.ok(ya > a.y + 30 && yb < b.y - 30, "one down, one up");
  const p = place(s, s.players[0], a.x + 100, ya);
  p.facing = 1;
  step(s, []);
  step(s, [BTN.PLACE, 0]);
  step(s, []);
  const wall = s.objects.find((o) => o.type === "wall");
  assert.ok(wall, "a wall was placed");
  const gap0 = Math.round(wall.y + wall.h - ya);
  run(s, 150);
  const tile = s.tiles.find((t) => t.id === wall.sup);
  assert.equal(Math.round(wall.y + wall.h), Math.round(tile.y), "still standing on its tile");
  assert.ok(Math.abs(tile.y - ya) > 5 || gap0 === 0);
});

test("moving stages are deterministic", () => {
  for (const id of ["belts", "swell"]) {
    const mk = () => createMatch({ seed: 5, stage: id, seats: [{ kind: "bot", character: "mason" }, { kind: "bot", character: "fuse" }, { kind: "bot", character: "dab" }] });
    const a = mk();
    const b = mk();
    for (let i = 0; i < 3000; i++) {
      step(a, []);
      step(b, []);
    }
    assert.equal(hashState(a), hashState(b), id);
  }
});

test("every row of a moving stage moves together, so tiers stay tiers", () => {
  const s = match("swell");
  run(s, 217);
  const byHome = new Map();
  for (const t of s.tiles) if (t.kind === "crumble") byHome.set(`${t.homeY}:${t.x < 820 ? "L" : "R"}:${t.bob.phase}`, new Set([...(byHome.get(`${t.homeY}:${t.x < 820 ? "L" : "R"}:${t.bob.phase}`) || []), t.y]));
  for (const [k, ys] of byHome) assert.equal(ys.size, 1, `${k} shares one height`);
});

test("moves that need ground still work on a heaving deck", () => {
  const KEY = [BTN.PLACE, BTN.TRICK, BTN.BREAK];
  const row = stage("swell").rows[0];
  for (const [character, slot] of [["fern", 0], ["fern", 1], ["fern", 2], ["dab", 1], ["dab", 2], ["fuse", 1]]) {
    const s = testMatch({ stage: "swell", seats: [{ kind: "human", character }, { kind: "human", character: "mason" }] });
    run(s, 100);
    const t = s.tiles.find((q) => q.x === row.x && q.homeY === row.y);
    const p = place(s, s.players[0], row.x + 60, t.y);
    p.facing = 1;
    run(s, 3);
    for (const q of s.tiles) q.stress = 0;
    step(s, [KEY[slot], 0]);
    assert.ok(s.events.some((e) => e.type === "cast" && e.seat === 0), `${character} move ${slot} casts on the deck`);
  }
});
