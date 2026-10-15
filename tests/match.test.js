import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatch, step, hashState, BTN } from "../src/index.js";
import { MATCH } from "../src/constants.js";
import { rand } from "../src/rng.js";
import { testMatch, place, onTile, run, ROW_Y } from "./helpers.js";

test("falling out loses a stock and respawns on a halo", () => {
  const s = testMatch();
  const p = place(s, s.players[0], 50, 1090);
  place(s, s.players[1], onTile(4), ROW_Y);
  run(s, 10);
  assert.equal(p.stocks, 2);
  assert.equal(p.status, "dead");
  assert.equal(s.feed.at(-1).seat, 0);
  run(s, MATCH.respawnDelay);
  assert.equal(p.status, "play");
  assert.ok(p.invuln > 0);
  assert.equal(p.ground.kind, "tile");
  const halo = s.tiles.find((t) => t.kind === "halo" && t.owner === 0);
  assert.ok(halo, "on its own halo");
  // Stepping off the halo removes it.
  run(s, 30, [BTN.RIGHT]);
  run(s, 30);
  assert.ok(!s.tiles.some((t) => t.kind === "halo" && t.owner === 0));
});

test("an elimination soon after an indirect cause is credited", () => {
  const s = testMatch();
  const p = place(s, s.players[0], 50, 1090);
  place(s, s.players[1], onTile(4), ROW_Y);
  p.blame = { seat: 1, tick: s.tick, cause: "glue" };
  run(s, 5);
  assert.equal(s.players[1].stats.kos, 1);
  assert.equal(p.stats.falls, 0);
  assert.equal(s.feed.at(-1).by, 1);
  // A stale cause is not.
  const q = place(s, s.players[0], 50, 1090);
  q.blame = { seat: 1, tick: s.tick - MATCH.blameWindow - 1, cause: "glue" };
  run(s, 5);
  assert.equal(s.players[1].stats.kos, 1);
  assert.equal(q.stats.falls, 1);
});

test("the last player with stocks wins; ranking follows elimination order", () => {
  const s = testMatch({ seats: [{ kind: "human" }, { kind: "human" }, { kind: "human" }], stocks: 1 });
  const [a, b, c] = s.players;
  place(s, a, onTile(4), ROW_Y);
  place(s, b, 50, 1100);
  place(s, c, onTile(10), ROW_Y);
  run(s, 2);
  assert.equal(b.status, "out");
  assert.equal(s.phase, "play");
  place(s, c, 50, 1100);
  run(s, 2);
  assert.equal(s.phase, "over");
  assert.deepEqual(s.result.ranking, [0, 2, 1]);
  assert.equal(s.result.winner, 0);
  assert.equal(a.place, 1);
});

test("simultaneous last eliminations still produce one winner", () => {
  const s = testMatch({ stocks: 1 });
  place(s, s.players[0], 50, 1100);
  place(s, s.players[1], 300, 1100);
  s.players[1].stats.kos = 1;
  run(s, 2);
  assert.equal(s.phase, "over");
  assert.equal(s.result.tied, true);
  assert.equal(s.result.winner, 1, "credited eliminations break the tie");
});

test("a match intro counts down before anyone can move", () => {
  const s = createMatch({ seed: 3, stage: "yard", seats: [{ kind: "human" }, { kind: "human" }] });
  const x0 = s.players[0].x;
  run(s, MATCH.introTicks - 1, [BTN.RIGHT, BTN.LEFT]);
  assert.equal(s.phase, "intro");
  assert.equal(s.players[0].x, x0);
  run(s, 20, [BTN.RIGHT, BTN.LEFT]);
  assert.equal(s.phase, "play");
  assert.notEqual(s.players[0].x, x0);
});

function randomRun(seed, ticks) {
  const s = createMatch({ seed, stage: "yard", seats: [{ kind: "human" }, { kind: "human" }, { kind: "human" }] });
  const inputRng = { r: 12345 };
  const hashes = [];
  for (let i = 0; i < ticks; i++) {
    const inputs = [0, 1, 2].map(() => Math.floor(rand(inputRng, "r") * 128));
    step(s, inputs);
    if (i % 100 === 0) hashes.push(hashState(s));
  }
  hashes.push(hashState(s));
  return hashes;
}

test("determinism: the same seed and inputs give the same state", () => {
  const a = randomRun("lf-1", 1500);
  const b = randomRun("lf-1", 1500);
  assert.deepEqual(a, b);
  const c = randomRun("lf-2", 1500);
  assert.notDeepEqual(a, c, "a different seed differs");
});
