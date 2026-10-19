import { test } from "node:test";
import assert from "node:assert/strict";
import { step, BTN, hashState, createMatch } from "../src/index.js";
import { OBJ, addObject } from "../src/objects.js";
import { testMatch, park, place, onTile, run, tileAt, ROW_Y } from "./helpers.js";

const KEY = [BTN.PLACE, BTN.TRICK, BTN.BREAK];

function match(other = "mason") {
  return testMatch({ seats: [{ kind: "human", character: "ferro" }, { kind: "human", character: other }] });
}

function cast(s, slot, held = 0, seat = 0) {
  const a = [0, 0];
  a[seat] = KEY[slot] | held;
  step(s, a);
  const done = s.events.find((e) => e.type === "cast" && e.seat === seat);
  const b = [0, 0];
  b[seat] = held;
  step(s, b);
  return done;
}

function stand(s, seat, i) {
  const p = place(s, s.players[seat], onTile(i), ROW_Y);
  step(s, []);
  return p;
}

const objs = (s, type) => s.objects.filter((o) => o.type === type);
const anvilAt = (s, owner, x, y) =>
  addObject(s, { type: "anvil", owner, x, y, w: 30, h: 26, vx: 0, vy: 0, breaks: 0, resting: -1, maxBreaks: 3 });

test("a lodestone floats ahead, arms briefly, and wears off", () => {
  const s = match();
  const f = stand(s, 0, 8);
  f.facing = 1;
  assert.ok(cast(s, 0));
  const [m] = objs(s, "magnet");
  assert.ok(m && m.armed > 0 && m.mode === "pull");
  assert.ok(m.x > f.x + 40 && m.y < f.y + f.h);
  run(s, OBJ.magnet.life);
  assert.equal(objs(s, "magnet").length, 0);
  // Only one at a time.
  f.cd[0] = 0;
  cast(s, 0);
  f.cd[0] = 0;
  f.facing = -1;
  cast(s, 0);
  assert.equal(objs(s, "magnet").length, 1);
});

test("it lifts an enemy anvil, carries it to the lodestone, and the anvil becomes Ferro's", () => {
  const s = match();
  const f = stand(s, 0, 8);
  f.facing = 1;
  cast(s, 0);
  const [m] = objs(s, "magnet");
  const a = anvilAt(s, 1, m.x + 90, m.y - 60);
  run(s, 90);
  assert.equal(a.owner, 0, "taken");
  assert.ok(Math.hypot(a.x + a.w / 2 - m.x, a.y + a.h / 2 - m.y) < 2, "hanging on the lodestone");
  // The lodestone goes: the anvil drops and breaks tiles for Ferro.
  run(s, OBJ.magnet.life);
  assert.ok(a.dead || a.y > m.y + 50, "released");
});

test("Polarity needs a lodestone, then throws loose metal away from it", () => {
  const s = match();
  const f = stand(s, 0, 8);
  f.facing = 1;
  assert.equal(cast(s, 1), undefined, "nothing to flip");
  assert.equal(f.cd[1], 0);
  cast(s, 0);
  const [m] = objs(s, "magnet");
  run(s, 15);
  const a = anvilAt(s, 1, m.x - 60, m.y + 5);
  a.vy = 0;
  assert.ok(cast(s, 1));
  assert.equal(m.mode, "push");
  assert.ok(a.vx < -8, `thrown left, away from the lodestone (${a.vx})`);
  assert.equal(a.owner, 0);
  run(s, OBJ.magnet.flip + 2);
  assert.equal(m.mode, "pull", "back to pulling");
});

test("a lodestone bends a lobbed glob in flight (and the bots' predictions see it)", () => {
  const s = match("glim");
  const f = stand(s, 0, 4);
  f.facing = 1;
  cast(s, 0);
  const [m] = objs(s, "magnet");
  const g = stand(s, 1, 14);
  g.facing = -1;
  g.cd = [0, 0, 0];
  cast(s, 0, 0, 1);
  const lob = objs(s, "lob")[0];
  assert.ok(lob);
  run(s, 25);
  assert.equal(lob.owner, 0, "the lob is Ferro's now");
});

test("a charge is pulled off the floor and hangs on the lodestone, then blows there", () => {
  const s = match("fuse");
  const f = stand(s, 0, 8);
  f.facing = 1;
  cast(s, 0);
  const [m] = objs(s, "magnet");
  const c = addObject(s, { type: "charge", owner: 1, x: m.x - 10, y: ROW_Y - 16, w: 16, h: 16, fuse: 300, sup: tileAt(s, m.x, ROW_Y).id });
  run(s, 60);
  assert.equal(c.owner, 0);
  assert.equal(c.sup, -1, "unstuck");
  assert.ok(Math.hypot(c.x + 8 - m.x, c.y + 8 - m.y) < 2);
});

test("Ingot breaks the tile it lands on, once", () => {
  const s = match();
  const f = stand(s, 0, 4);
  f.facing = 1;
  assert.ok(cast(s, 2));
  park(s, f); // standing still would crumble her own tile
  run(s, 80);
  const gone = s.tiles.filter((t) => t.kind === "crumble" && t.state !== "solid");
  assert.ok(gone.length >= 1 && gone.length <= 2, `a tile or two (${gone.length})`);
  assert.ok(s.objects.every((o) => o.type !== "anvil"), "and the bar is spent");
});

test("a Ferro bot match is deterministic and ends on every stage", () => {
  for (const stage of ["yard", "quarry", "tide", "gale"]) {
    const mk = () => createMatch({ seed: 23, stage, seats: [{ kind: "bot", character: "ferro" }, { kind: "bot", character: "fuse" }, { kind: "bot", character: "mason", difficulty: "hard" }] });
    const a = mk();
    const b = mk();
    let used = 0;
    while (a.phase !== "over" && a.tick < 22000) {
      step(a, []);
      step(b, []);
      used += a.events.filter((e) => e.type === "cast" && e.seat === 0).length;
    }
    assert.equal(hashState(a), hashState(b), stage);
    assert.equal(a.phase, "over", `${stage} ended`);
    assert.ok(used >= 2, `${stage}: Ferro's bot used its kit (${used})`);
  }
});
