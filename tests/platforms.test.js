import { test } from "node:test";
import assert from "node:assert/strict";
import { step, BTN } from "../src/index.js";
import { CRUMBLE, STURDY, TILE } from "../src/constants.js";
import { damageTile, getTile } from "../src/tiles.js";
import { testMatch, place, onTile, run, tileAt, ROW_Y, SLAB } from "./helpers.js";

test("a crumble tile holds a still player briefly, shakes, then falls", () => {
  const s = testMatch();
  const p = place(s, s.players[0], onTile(5), ROW_Y);
  const tile = tileAt(s, onTile(5) + 5, ROW_Y);
  let shakeAt = -1;
  let breakAt = -1;
  for (let t = 1; t <= 120 && breakAt < 0; t++) {
    step(s, []);
    if (shakeAt < 0 && tile.stress >= CRUMBLE.shakeAt) shakeAt = t;
    if (tile.state !== "solid") breakAt = t;
  }
  assert.ok(shakeAt > 15, `holds a moment before shaking (shook at ${shakeAt})`);
  assert.ok(breakAt > shakeAt + 10, `shakes before it falls (${shakeAt} -> ${breakAt})`);
  assert.ok(breakAt < 70, `falls within about a second (${breakAt})`);
  run(s, 5);
  assert.equal(p.ground, null, "the player loses their footing");
  assert.ok(p.vy > 0, "and falls");
});

test("a broken crumble tile respawns quickly", () => {
  const s = testMatch();
  const tile = tileAt(s, onTile(3) + 5, ROW_Y);
  tile.stress = 0.999;
  tile.load = 0.01;
  step(s, []);
  assert.equal(tile.state, "falling");
  const back = CRUMBLE.fallTicks + CRUMBLE.respawnTicks + CRUMBLE.reappearTicks;
  run(s, back - 2);
  assert.notEqual(tile.state, "solid", "not back early");
  run(s, 3);
  assert.equal(tile.state, "solid", `back after ${back} ticks`);
  assert.equal(tile.stress, 0);
  assert.ok(back / 60 < 5, "under five seconds");
});

test("moving keeps you alive: running back and forth never drops you", () => {
  const s = testMatch();
  const p = place(s, s.players[0], onTile(4), ROW_Y);
  let dir = BTN.RIGHT;
  run(s, 900, () => {
    if (p.x > onTile(15)) dir = BTN.LEFT;
    if (p.x < onTile(4)) dir = BTN.RIGHT;
    return [dir];
  });
  assert.equal(p.status, "play");
  assert.equal(p.stats.deaths, 0);
  assert.ok(p.ground, "still standing after 15 seconds");
});

test("unoccupied tiles shed stress", () => {
  const s = testMatch();
  const tile = tileAt(s, onTile(2) + 5, ROW_Y);
  tile.stress = 0.5;
  run(s, 50);
  assert.ok(Math.abs(tile.stress - (0.5 - 50 * CRUMBLE.decay)) < 1e-9);
  run(s, 150);
  assert.equal(tile.stress, 0);
});

test("a doomed tile falls even after you leave it", () => {
  const s = testMatch();
  const tile = tileAt(s, onTile(2) + 5, ROW_Y);
  tile.stress = CRUMBLE.doomAt + 0.01;
  run(s, 30);
  assert.notEqual(tile.state, "solid");
});

test("a sturdy slab never crumbles under a still player", () => {
  const s = testMatch();
  const p = place(s, s.players[0], SLAB.x + 50, SLAB.y);
  run(s, 1200);
  assert.equal(p.status, "play");
  assert.equal(p.ground.kind, "tile");
  const slab = getTile(s, p.ground.id);
  assert.equal(slab.kind, "sturdy");
  assert.equal(slab.hp, slab.maxHp);
});

test("a sturdy slab breaks from damage and comes back later", () => {
  const s = testMatch();
  const slab = tileAt(s, SLAB.x + 10, SLAB.y);
  const p = place(s, s.players[0], SLAB.x + 50, SLAB.y);
  step(s, []);
  damageTile(s, slab, 1, 1);
  assert.equal(slab.hp, slab.maxHp - 1);
  assert.equal(slab.state, "solid");
  damageTile(s, slab, slab.hp, 1);
  assert.equal(slab.state, "falling");
  assert.equal(s.players[1].stats.slabsBroken, 1, "the breaker is credited");
  assert.equal(p.blame.seat, 1, "the player standing on it blames the breaker");
  run(s, CRUMBLE.fallTicks + STURDY.respawnTicks + CRUMBLE.reappearTicks + 2);
  assert.equal(slab.state, "solid");
  assert.equal(slab.hp, slab.maxHp);
});

test("platforms are one-way: jump up through, drop down through", () => {
  const s = testMatch();
  const p = place(s, s.players[0], onTile(6), ROW_Y);
  step(s, []);
  assert.ok(p.ground);
  run(s, 1, [BTN.DOWN]);
  run(s, 20);
  assert.ok(p.y + p.h > ROW_Y + TILE.h, "dropped through the row");
  // From below, a jump passes up through a tile and lands on top.
  const q = s.players[1];
  place(s, q, onTile(12), ROW_Y + 100);
  q.vy = -13;
  q.ground = null;
  for (let i = 0; i < 40 && !(q.ground && q.groundTop === ROW_Y); i++) step(s, [0, 0]);
  assert.equal(q.groundTop, ROW_Y);
  assert.ok(q.ground);
});
