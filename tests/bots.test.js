import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatch, step, hashState, STAGES, CHARACTER_IDS } from "../src/index.js";

const LIMIT = 22000; // ticks: about six minutes

function botMatch(stage, seed, n = 4, difficulty = "normal") {
  const seats = Array.from({ length: n }, (_, i) => ({ kind: "bot", character: CHARACTER_IDS[(i + seed) % 4], difficulty }));
  const s = createMatch({ seed, stage, stocks: 3, seats });
  const casts = new Array(n).fill(0);
  let kosBeforeCollapse = 0;
  let kos = 0;
  while (s.phase !== "over" && s.tick < LIMIT) {
    step(s, []);
    for (const e of s.events) {
      if (e.type === "cast") casts[e.seat]++;
      if (e.type === "ko") {
        kos++;
        if (!s.collapse) kosBeforeCollapse++;
      }
    }
  }
  return { s, casts, kos, kosBeforeCollapse };
}

test("bot matches on every stage end with a winner in time (no unkillable safe spot)", () => {
  let kos = 0;
  let early = 0;
  for (const st of STAGES) {
    for (const seed of [11, 12]) {
      const { s, casts, kos: k, kosBeforeCollapse } = botMatch(st.id, seed);
      assert.equal(s.phase, "over", `${st.id} seed ${seed} ended`);
      assert.ok(s.result.winner >= 0 && s.result.winner < 4);
      assert.equal(s.players.filter((p) => p.status !== "out").length, 1, "one player left standing");
      for (const c of casts) assert.ok(c >= 5, `every bot used its kit (${casts})`);
      kos += k;
      early += kosBeforeCollapse;
    }
  }
  // Most eliminations come from play, not from the collapse that guarantees an end.
  assert.ok(early / kos > 0.6, `${early} of ${kos} eliminations before the collapse`);
});

test("1v1 bot matches end too, at every difficulty", () => {
  for (const [i, d] of ["easy", "normal", "hard"].entries()) {
    const { s } = botMatch(STAGES[i].id, 21 + i, 2, d);
    assert.equal(s.phase, "over", `${d} ended`);
  }
});

test("bot matches are deterministic", () => {
  const a = createMatch({ seed: 5, stage: "gale", seats: [{ kind: "bot", character: "pip" }, { kind: "bot", character: "fuse" }, { kind: "bot", character: "glim" }] });
  const b = createMatch({ seed: 5, stage: "gale", seats: [{ kind: "bot", character: "pip" }, { kind: "bot", character: "fuse" }, { kind: "bot", character: "glim" }] });
  for (let i = 0; i < 3000; i++) {
    step(a, []);
    step(b, []);
  }
  assert.equal(hashState(a), hashState(b));
});

test("a bot outlives a player who does nothing", () => {
  const s = createMatch({ seed: 9, stage: "yard", stocks: 2, seats: [{ kind: "human", character: "mason" }, { kind: "bot", character: "glim" }] });
  while (s.phase !== "over" && s.tick < 6000) step(s, [0, 0]);
  assert.equal(s.phase, "over");
  assert.equal(s.result.winner, 1);
  assert.equal(s.players[1].stocks, 2, "without losing a stock");
});
