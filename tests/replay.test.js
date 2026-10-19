import { test } from "node:test";
import assert from "node:assert/strict";
import { createMatch, step, hashState, BTN, newRecording, recordTick, finishRecording, encodeReplay, decodeReplay, Replay } from "../src/index.js";

// A deterministic stand-in for a person: buttons that change every so often.
function pseudoInputs(tick, seats) {
  return seats.map((_, i) => {
    const phase = Math.floor(tick / (20 + i * 7));
    const bits = [BTN.LEFT, BTN.RIGHT, BTN.UP, BTN.PLACE, BTN.TRICK, BTN.BREAK, BTN.DOWN];
    return (bits[(phase * (i + 3)) % bits.length] | (phase % 3 === 0 ? BTN.UP : 0)) & 127;
  });
}

function record(config, ticks) {
  const state = createMatch(config);
  const rec = newRecording(config);
  for (let i = 0; i < ticks; i++) {
    const inputs = pseudoInputs(i, config.seats);
    recordTick(rec, inputs);
    step(state, inputs);
  }
  finishRecording(rec, state);
  return { state, rec };
}

const CONFIG = {
  seed: 77,
  stage: "yard",
  stocks: 2,
  seats: [
    { kind: "human", character: "mason", slot: 0 },
    { kind: "human", character: "dab", slot: 2 },
    { kind: "bot", character: "fern", difficulty: "hard", slot: 1 },
    { kind: "bot", character: "ferro", difficulty: "easy", slot: 3 },
  ],
};

test("a recorded match plays back to exactly the same state", () => {
  const { state, rec } = record(CONFIG, 2500);
  const replay = new Replay(rec);
  assert.equal(replay.length, 2500);
  while (replay.step());
  assert.ok(replay.done);
  assert.equal(hashState(replay.state), hashState(state));
  assert.ok(replay.verify());
});

test("it survives the file format: JSON text in, same match out", () => {
  const { state, rec } = record(CONFIG, 1800);
  const text = JSON.stringify(encodeReplay(rec));
  const back = decodeReplay(JSON.parse(text));
  assert.deepEqual(back.rows.map((r) => [...r]), rec.rows.map((r) => [...r]));
  const replay = new Replay(back);
  replay.seek(replay.length);
  assert.equal(hashState(replay.state), hashState(state));
  assert.equal(back.hash, rec.hash);
});

test("idle stretches compress to a few runs", () => {
  const config = { seed: 3, stage: "gale", stocks: 1, seats: [{ kind: "bot", character: "pip" }, { kind: "bot", character: "fuse" }] };
  const state = createMatch(config);
  const rec = newRecording(config);
  for (let i = 0; i < 3000; i++) {
    recordTick(rec, []);
    step(state, []);
  }
  finishRecording(rec, state);
  const enc = encodeReplay(rec);
  assert.equal(enc.ticks, 3000);
  assert.equal(enc.inputs.length, 1);
  assert.deepEqual(enc.inputs[0], [3000, 0, 0]);
});

test("seeking forward and back lands on the same states as playing straight through", () => {
  const { rec } = record(CONFIG, 1200);
  const straight = new Replay(rec);
  const hashes = new Map();
  for (let t = 0; t <= 1200; t++) {
    if (t % 300 === 0) hashes.set(t, hashState(straight.state));
    straight.step();
  }
  const r = new Replay(rec);
  r.seek(900);
  assert.equal(hashState(r.state), hashes.get(900));
  r.seek(300);
  assert.equal(hashState(r.state), hashes.get(300), "back is a restart and a run forward");
  r.seek(0);
  assert.equal(hashState(r.state), hashes.get(0));
  r.seek(99999);
  assert.equal(r.tick, 1200);
});

test("teams and handicaps are part of the replay", () => {
  const config = {
    seed: 12,
    stage: "belts",
    stocks: 2,
    seats: [
      { kind: "bot", character: "mason", team: 0, stocks: 1 },
      { kind: "bot", character: "glim", team: 0, stocks: 1 },
      { kind: "bot", character: "pip", team: 1, stocks: 3 },
      { kind: "bot", character: "fuse", team: 1, stocks: 3 },
    ],
  };
  const state = createMatch(config);
  const rec = newRecording(config);
  while (state.phase !== "over" && state.tick < 22000) {
    recordTick(rec, []);
    step(state, []);
  }
  finishRecording(rec, state);
  assert.equal(rec.winner, state.result.winner);
  const back = decodeReplay(JSON.parse(JSON.stringify(encodeReplay(rec))));
  assert.deepEqual(back.config.seats.map((s) => [s.team, s.stocks]), [[0, 1], [0, 1], [1, 3], [1, 3]]);
  assert.ok(new Replay(back).verify());
});

test("changing a single press changes where the match ends up", () => {
  const { rec } = record(CONFIG, 1500);
  const tampered = { ...rec, rows: rec.rows.map((r) => r.slice()) };
  tampered.rows[200][0] ^= BTN.RIGHT | BTN.UP;
  const replay = new Replay(tampered);
  assert.equal(replay.verify(), false, "the fingerprint no longer matches");
});

test("a file that is not a usable replay is refused with a reason", () => {
  const { rec } = record(CONFIG, 100);
  const good = () => JSON.parse(JSON.stringify(encodeReplay(rec)));
  const bad = (mutate, pattern) => {
    const obj = good();
    mutate(obj);
    assert.throws(() => decodeReplay(obj), pattern);
  };
  assert.doesNotThrow(() => decodeReplay(good()));
  assert.throws(() => decodeReplay(null), /not an object/);
  assert.throws(() => decodeReplay("x"), /not an object/);
  bad((o) => (o.format = "other"), /not a Lost Footing replay/);
  bad((o) => (o.version = 9), /format version/);
  bad((o) => (o.sim = 99), /simulation version/);
  bad((o) => (o.config.stage = "nowhere"), /unknown stage/);
  bad((o) => (o.config.seats[0].character = "wizard"), /unknown character/);
  bad((o) => (o.config.seats[0].kind = "ghost"), /unknown kind/);
  bad((o) => o.config.seats.push(o.config.seats[0]), /seats must number|do not add up|wrong shape/);
  bad((o) => (o.config.seats[1].team = 5), /bad team/);
  bad((o) => (o.config.seats[1].stocks = 0), /bad stocks/);
  bad((o) => (o.config.seed = 1.5), /bad seed/);
  bad((o) => (o.ticks = -1), /bad length/);
  bad((o) => (o.ticks = 1e12), /bad length/);
  bad((o) => (o.ticks += 1), /do not add up/);
  bad((o) => (o.inputs[0][1] = 9999), /out of range/);
  bad((o) => (o.inputs[0] = [1, 0]), /wrong shape/);
  bad((o) => (o.inputs[0][0] = 0), /bad length/);
  bad((o) => (o.inputs = "no"), /no inputs/);
});
