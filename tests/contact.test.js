import { test } from "node:test";
import assert from "node:assert/strict";
import { step, BTN } from "../src/index.js";
import { testMatch, place, onTile, run, tileAt, ROW_Y } from "./helpers.js";

test("players pass through each other side to side", () => {
  const s = testMatch();
  const a = place(s, s.players[0], onTile(4), ROW_Y);
  const b = place(s, s.players[1], onTile(10), ROW_Y);
  run(s, 60, [BTN.RIGHT, BTN.LEFT]);
  assert.ok(a.x > b.x, "they crossed");
  assert.ok(a.ground && b.ground, "nobody was knocked off");
  assert.equal(a.blame, null);
  assert.equal(b.blame, null);
});

test("landing on a grounded player stomps them: you bounce, they sink", () => {
  const s = testMatch();
  const lower = place(s, s.players[1], onTile(8), ROW_Y);
  step(s, []);
  const tile = tileAt(s, lower.x + 13, ROW_Y);
  const before = tile.stress;
  const upper = place(s, s.players[0], onTile(8), ROW_Y - 200);
  upper.ground = null;
  let stomped = false;
  for (let i = 0; i < 40 && !stomped; i++) {
    step(s, []);
    stomped = s.events.some((e) => e.type === "stomp");
  }
  assert.ok(stomped, "a stomp happened");
  assert.ok(upper.vy < -3, "the stomper bounces up");
  assert.ok(lower.slow > 0, "the stomped player is slowed");
  assert.ok(tile.stress > before + 0.2, "and driven into the floor");
  assert.equal(lower.blame.seat, 0);
  assert.equal(upper.stats.stomps, 1);
});

test("stomping an airborne player drives them down", () => {
  const s = testMatch();
  const lower = place(s, s.players[1], 60, 300);
  lower.vy = 0;
  const upper = place(s, s.players[0], 60, 258);
  upper.vy = 10;
  step(s, []);
  assert.ok(lower.vy >= 7, `pushed down (${lower.vy})`);
  assert.ok(upper.vy < 0, "the stomper pops up");
});

test("jumping up into someone's feet bumps them up and stops you", () => {
  const s = testMatch();
  const upper = place(s, s.players[0], onTile(8), ROW_Y);
  step(s, []);
  const lower = place(s, s.players[1], onTile(8), ROW_Y + 90);
  lower.vy = -12;
  let bumped = false;
  for (let i = 0; i < 20 && !bumped; i++) {
    step(s, []);
    bumped = s.events.some((e) => e.type === "bump");
  }
  assert.ok(bumped, "a bump happened");
  assert.ok(upper.vy < -3, "the player above is popped up");
  assert.ok(lower.vy > -1, "the jumper loses their rise");
});

test("a gentle landing rides on someone's head", () => {
  const s = testMatch();
  const lower = place(s, s.players[1], onTile(8), ROW_Y);
  step(s, []);
  const upper = place(s, s.players[0], onTile(8) + 4, lower.y);
  upper.vy = 0;
  run(s, 10);
  assert.ok(upper.ground, "standing");
  assert.equal(upper.ground.kind, "player");
  assert.equal(upper.ground.id, lower.seat);
  assert.ok(upper.stats.headTicks > 0);
});
