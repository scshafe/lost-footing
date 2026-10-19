import { test } from "node:test";
import assert from "node:assert/strict";
import { step, BTN, hashState, createMatch } from "../src/index.js";
import { OBJ } from "../src/objects.js";
import { C } from "../src/index.js";
import { testMatch, place, onTile, run, tileAt, ROW_Y, SLAB } from "./helpers.js";

const KEY = [BTN.PLACE, BTN.TRICK, BTN.BREAK];

function match() {
  return testMatch({ seats: [{ kind: "human", character: "fern" }, { kind: "human", character: "mason" }] });
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

const leaves = (s) => s.tiles.filter((t) => t.kind === "leaf" && t.state === "solid");

test("Fern's vine sprouts a zigzag ladder of four leaves, one short jump apart", () => {
  const s = match();
  const fern = stand(s, 0, 5);
  fern.facing = 1;
  assert.ok(cast(s, 0));
  assert.equal(leaves(s).length, 0, "nothing yet: the seed takes a moment");
  run(s, OBJ.vine.delay + OBJ.vine.grow * OBJ.vine.leaves + 2);
  const ls = leaves(s).sort((a, b) => b.y - a.y);
  assert.equal(ls.length, 4);
  ls.forEach((l, i) => assert.equal(l.y, ROW_Y - OBJ.vine.rise * (i + 1)));
  const centres = ls.map((l) => l.x + l.w / 2);
  assert.ok(centres[0] > centres[1] && centres[2] > centres[1] && centres[2] > centres[3], "zigzag");
  // Anyone can stand on a leaf (a one-way platform).
  const q = place(s, s.players[1], ls[1].x + 10, ls[1].y);
  run(s, 3);
  assert.ok(q.ground && q.ground.id === ls[1].id);
  // They wilt.
  s.players[1].status = "dead";
  run(s, OBJ.vine.life);
  assert.equal(leaves(s).length, 0);
});

test("a vine needs ground, and the seed dies if its tile breaks first", () => {
  const s = match();
  const air = place(s, s.players[0], 300, 300);
  air.vy = 0;
  assert.equal(cast(s, 0), undefined, "no seed in the air");
  const s2 = match();
  const fern = stand(s2, 0, 5);
  fern.facing = 1;
  cast(s2, 0);
  const [v] = s2.objects.filter((o) => o.type === "vine");
  s2.tiles.find((t) => t.id === v.sup).state = "gone";
  run(s2, 5);
  assert.equal(s2.objects.filter((o) => o.type === "vine").length, 0);
  assert.equal(leaves(s2).length, 0);
});

test("Thorns bog down whoever crosses them and chew the tiles", () => {
  const s = match();
  const fern = stand(s, 0, 3);
  fern.facing = 1;
  assert.ok(cast(s, 1));
  const [coat] = s.objects.filter((o) => o.type === "coat" && o.coat === "thorn");
  assert.ok(coat && coat.armed > 0, "growing");
  run(s, OBJ.thorn.arm + 2);
  const t = tileAt(s, (coat.x0 + coat.x1) / 2, ROW_Y);
  const before = t.stress;
  run(s, 60);
  assert.ok(t.stress > before + 0.15, "the brambles stress the floor on their own");
  // Mason runs into them and is slowed.
  const q = place(s, s.players[1], coat.x1 + 20, ROW_Y);
  step(s, []);
  run(s, 25, [0, BTN.LEFT]);
  assert.equal(q.surface, "thorn");
  assert.ok(Math.abs(q.vx) < 2.5, `slowed to ${q.vx}`);
  assert.equal(q.blame.seat, 0);
});

test("Roots shake the tiles around the seed, then break them", () => {
  const s = match();
  const fern = stand(s, 0, 17);
  fern.facing = 1;
  assert.ok(cast(s, 2));
  const [seed] = s.objects.filter((o) => o.type === "roots");
  const near = tileAt(s, seed.x, ROW_Y);
  const far = tileAt(s, onTile(1), ROW_Y);
  run(s, 12);
  assert.ok(near.stress >= C.CRUMBLE.shakeAt, "shaking: the warning");
  assert.equal(near.state, "solid", "still there during the warning");
  run(s, OBJ.roots.fuse + 30);
  assert.notEqual(near.state, "solid", "broken");
  assert.equal(far.state, "solid", "far tiles untouched");
  assert.equal(near.stressBy, 0, "credited to Fern");
  assert.equal(near.stressCause, "roots");
  const slab = s.tiles.find((t) => t.kind === "sturdy");
  assert.equal(slab.hp, slab.maxHp - 1, "the slab in reach takes 1 damage");
  assert.equal(slab.y, SLAB.y);
});

test("a Fern bot match is deterministic and ends on every stage", () => {
  for (const stage of ["yard", "quarry", "tide", "gale"]) {
    const mk = () => createMatch({ seed: 17, stage, seats: [{ kind: "bot", character: "fern" }, { kind: "bot", character: "dab" }, { kind: "bot", character: "pip", difficulty: "hard" }] });
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
    assert.ok(used >= 2, `${stage}: Fern's bot used its kit (${used})`);
  }
});
