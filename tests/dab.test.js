import { test } from "node:test";
import assert from "node:assert/strict";
import { step, BTN, hashState, createMatch } from "../src/index.js";
import { C } from "../src/index.js";
import { OBJ } from "../src/objects.js";
import { testMatch, park, place, onTile, run, tileAt, ROW_Y, SLAB } from "./helpers.js";

const KEY = [BTN.PLACE, BTN.TRICK, BTN.BREAK];

function match() {
  return testMatch({ seats: [{ kind: "human", character: "dab" }, { kind: "human", character: "mason" }] });
}

function cast(s, slot, held = 0) {
  step(s, [KEY[slot] | held, 0]);
  const done = s.events.find((e) => e.type === "cast" && e.seat === 0);
  step(s, [held, 0]);
  return done;
}

function stand(s, seat, i) {
  const p = place(s, s.players[seat], onTile(i), ROW_Y);
  step(s, []);
  return p;
}

const decoys = (s) => s.tiles.filter((t) => t.kind === "decoy" && t.state === "solid");

test("Dab's decoy holds only Dab; anyone else falls through and is credited to her", () => {
  const s = match();
  const dab = stand(s, 0, 0);
  dab.facing = -1;
  assert.ok(cast(s, 0), "painted ahead, over the gap left of the row");
  const [d] = decoys(s);
  assert.ok(d && d.owner === 0 && d.y === ROW_Y);
  assert.ok(d.x + d.w <= 200 && d.x >= 80, "off the row: it paints over empty air");
  // Dab walks out on it and stands.
  run(s, 25, [BTN.LEFT, 0]);
  assert.ok(dab.ground && dab.ground.id === d.id, "Dab stands on her own decoy");
  // Mason walks out on it and drops through.
  const q = stand(s, 1, 0);
  run(s, 12, [0, BTN.LEFT]);
  assert.ok(!q.ground || q.ground.id !== d.id, "Mason is not held");
  assert.ok(q.vy > 0 || q.y + q.h > ROW_Y);
  assert.equal(q.blame && q.blame.seat, 0);
});

test("a decoy over real floor fizzles and costs no cooldown", () => {
  const s = match();
  const dab = stand(s, 0, 8);
  dab.facing = 1;
  assert.equal(cast(s, 0), undefined);
  assert.equal(dab.cd[0], 0);
  assert.equal(decoys(s).length, 0);
});

test("in the air a decoy appears under Dab and catches her", () => {
  const s = match();
  const dab = place(s, s.players[0], 300, 300);
  dab.vy = 2;
  assert.ok(cast(s, 0));
  run(s, 10);
  assert.ok(dab.ground, "standing on the decoy");
  assert.equal(s.tiles.find((t) => t.id === dab.ground.id).kind, "decoy");
  run(s, OBJ.decoy.life);
  assert.equal(dab.ground, null, "the decoy ran out");
});

test("two decoys at most: a third retires the oldest", () => {
  const s = match();
  const dab = place(s, s.players[0], 300, 300);
  dab.vy = 0;
  for (let i = 0; i < 3; i++) {
    dab.cd[0] = 0;
    dab.ground = null;
    dab.y = 300 + i * 100;
    dab.vy = 0;
    cast(s, 0);
  }
  run(s, 3);
  assert.equal(decoys(s).length, 2);
});

test("decoys are not floor for objects: an anvil falls through", () => {
  const s = testMatch({ seats: [{ kind: "human", character: "dab" }, { kind: "human", character: "mason" }] });
  const dab = place(s, s.players[0], 300, 300);
  dab.vy = 2;
  cast(s, 0);
  const d = decoys(s)[0];
  s.objects.push({ id: 900, type: "anvil", owner: 1, x: d.x + 30, y: d.y - 80, w: 30, h: 26, vx: 0, vy: 0, breaks: 0, resting: -1, armed: 0, age: 0, sup: -1, supObj: -1 });
  s.nextObjectId = 901;
  run(s, 20);
  const a = s.objects.find((o) => o.id === 900);
  assert.ok(!a || a.y > d.y + 10, "fell past the decoy");
  assert.equal(d.state, "solid", "the decoy was not broken by it");
});

test("Hollow: tiles shimmer, then drop their other occupants for 2.5 s, and come back", () => {
  const s = match();
  const dab = stand(s, 0, 2);
  dab.facing = 1;
  const q = stand(s, 1, 4);
  assert.ok(cast(s, 1));
  const t4 = tileAt(s, onTile(4) + 5, ROW_Y);
  assert.ok(t4.hollowArm > 0 && t4.hollowBy === 0);
  assert.ok(q.ground, "still held while the shimmer builds");
  run(s, C.HOLLOW.arm + 2);
  assert.ok(t4.hollow > 0);
  assert.equal(q.ground, null, "Mason dropped");
  assert.equal(q.blame.seat, 0, "credited to Dab");
  // Dab crosses the hollow floor.
  const walker = place(s, s.players[0], onTile(4), ROW_Y);
  walker.vx = 0;
  run(s, 3);
  assert.ok(walker.ground, "Dab stands on a hollow tile");
  park(s, walker); // standing still would crumble it
  run(s, C.HOLLOW.ticks);
  assert.equal(t4.hollow, 0);
  const back = place(s, s.players[1], onTile(4), ROW_Y);
  run(s, 3);
  assert.ok(back.ground, "solid again for everyone");
});

test("Hollow with no crumble tile ahead fizzles", () => {
  const s = match();
  const dab = place(s, s.players[0], 100, ROW_Y);
  dab.ground = { kind: "tile", id: 0 };
  step(s, []);
  dab.x = 40;
  dab.facing = -1;
  assert.equal(cast(s, 1), undefined);
});

test("Rub out erases the platforms in its stroke and spares Dab's own tile", () => {
  const s = match();
  const dab = stand(s, 0, 5);
  dab.facing = 1;
  assert.ok(cast(s, 2));
  const [rub] = s.objects.filter((o) => o.type === "rub");
  assert.ok(rub && rub.x0 >= onTile(5) - 11 + 48, "starts past Dab's tile");
  run(s, OBJ.rub.delay + 2);
  const own = tileAt(s, onTile(5) + 2, ROW_Y);
  const first = tileAt(s, rub.x0 + 4, ROW_Y);
  assert.equal(own.state, "solid", "her tile stays");
  assert.notEqual(first.state, "solid", "the stroke erased the tile past it");
  assert.equal(s.objects.filter((o) => o.type === "rub").length, 0);
  assert.ok(dab.ground, "Dab never lost her footing");
});

test("Rub out damages a slab and breaks nothing behind its reach", () => {
  const s = match();
  const dab = stand(s, 0, 19);
  dab.facing = 1;
  cast(s, 2);
  run(s, OBJ.rub.delay + 2);
  const slab = s.tiles.find((t) => t.kind === "sturdy");
  assert.equal(slab.hp, slab.maxHp - 2);
  assert.equal(slab.y, SLAB.y);
});

test("a Dab bot match is deterministic and ends", () => {
  const mk = () =>
    createMatch({ seed: 31, stage: "yard", seats: [{ kind: "bot", character: "dab", difficulty: "hard" }, { kind: "bot", character: "mason" }, { kind: "bot", character: "glim", difficulty: "easy" }] });
  const a = mk();
  const b = mk();
  let used = 0;
  while (a.phase !== "over" && a.tick < 22000) {
    step(a, []);
    step(b, []);
    used += a.events.filter((e) => e.type === "cast" && e.seat === 0).length;
  }
  assert.equal(hashState(a), hashState(b));
  assert.equal(a.phase, "over");
  assert.ok(used >= 3, `Dab's bot used its kit (${used})`);
});
