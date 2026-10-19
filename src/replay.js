// Replays: a match is its config plus the buttons each seat pressed every
// tick, so recording it is cheap and playing it back is just running the
// simulation again. Bots need nothing recorded (they decide from the state and
// the seeded generator). Pure data and functions: no DOM, no clock.

import { createMatch, step, SIM_VERSION } from "./match.js";
import { hashState } from "./hash.js";
import { CHARACTERS } from "./characters.js";
import { STAGES } from "./stages.js";

export const REPLAY_FORMAT = "lost-footing-replay";
export const REPLAY_VERSION = 1;
export const MAX_TICKS = 60 * 60 * 30; // half an hour: no match is anywhere near this
const MAX_MASK = 127; // seven buttons

// ---- Recording ------------------------------------------------------------

// Start recording a match created from `config` (the same object that was, or
// will be, passed to createMatch).
export function newRecording(config) {
  const copy = JSON.parse(JSON.stringify(config));
  return { config: copy, seats: Math.min(4, copy.seats.length), rows: [], hash: null, done: false };
}

// Record the buttons given to one step(). Call it for every step.
export function recordTick(rec, inputs) {
  if (rec.done) return;
  const row = new Array(rec.seats);
  for (let i = 0; i < rec.seats; i++) row[i] = (inputs[i] | 0) & MAX_MASK;
  rec.rows.push(row);
}

// Seal the recording with the final state's fingerprint.
export function finishRecording(rec, state) {
  rec.done = true;
  rec.hash = hashState(state);
  rec.winner = state.result ? state.result.winner : -1;
  return rec;
}

// ---- The file format ------------------------------------------------------

// A JSON-able object. Inputs are run-length encoded: [count, mask0, mask1...]
// for `count` ticks in which every seat held the same buttons.
export function encodeReplay(rec) {
  const inputs = [];
  let run = null;
  for (const row of rec.rows) {
    if (run && run.slice(1).every((m, i) => m === row[i])) run[0]++;
    else {
      run = [1, ...row];
      inputs.push(run);
    }
  }
  return {
    format: REPLAY_FORMAT,
    version: REPLAY_VERSION,
    sim: SIM_VERSION,
    config: rec.config,
    ticks: rec.rows.length,
    hash: rec.hash,
    winner: rec.winner ?? -1,
    inputs,
  };
}

const fail = (why) => {
  throw new Error(`Not a usable replay: ${why}`);
};

// Check an untrusted object (a file the player loaded) and turn it back into
// a recording, or throw an Error that says what is wrong.
export function decodeReplay(obj) {
  if (!obj || typeof obj !== "object") fail("not an object");
  if (obj.format !== REPLAY_FORMAT) fail("not a Lost Footing replay");
  if (obj.version !== REPLAY_VERSION) fail(`format version ${obj.version} (this game reads ${REPLAY_VERSION})`);
  if (obj.sim !== SIM_VERSION) fail(`recorded by simulation version ${obj.sim} (this game runs ${SIM_VERSION})`);
  const c = obj.config;
  if (!c || typeof c !== "object" || !Array.isArray(c.seats)) fail("no match config");
  if (c.seats.length < 1 || c.seats.length > 4) fail("seats must number 1 to 4");
  if (!Number.isInteger(c.seed)) fail("bad seed");
  if (!STAGES.some((s) => s.id === c.stage)) fail(`unknown stage ${String(c.stage).slice(0, 20)}`);
  if (!Number.isInteger(c.stocks) || c.stocks < 1 || c.stocks > 9) fail("bad stocks");
  const seats = c.seats.map((s, i) => {
    if (!s || typeof s !== "object") fail(`seat ${i} is not an object`);
    if (s.kind !== "human" && s.kind !== "bot") fail(`seat ${i} has an unknown kind`);
    if (!CHARACTERS[s.character]) fail(`seat ${i} has an unknown character`);
    const out = { kind: s.kind, character: s.character };
    if (s.difficulty !== undefined) {
      if (!["easy", "normal", "hard"].includes(s.difficulty)) fail(`seat ${i} has an unknown difficulty`);
      out.difficulty = s.difficulty;
    }
    if (s.slot !== undefined) {
      if (!Number.isInteger(s.slot) || s.slot < 0 || s.slot > 3) fail(`seat ${i} has a bad slot`);
      out.slot = s.slot;
    }
    if (s.team !== undefined) {
      if (!Number.isInteger(s.team) || s.team < -1 || s.team > 1) fail(`seat ${i} has a bad team`);
      out.team = s.team;
    }
    if (s.stocks !== undefined) {
      if (!Number.isInteger(s.stocks) || s.stocks < 1 || s.stocks > 9) fail(`seat ${i} has bad stocks`);
      out.stocks = s.stocks;
    }
    return out;
  });
  if (!Number.isInteger(obj.ticks) || obj.ticks < 0 || obj.ticks > MAX_TICKS) fail("bad length");
  if (!Array.isArray(obj.inputs)) fail("no inputs");
  const rows = [];
  for (const run of obj.inputs) {
    if (!Array.isArray(run) || run.length !== seats.length + 1) fail("a run of inputs has the wrong shape");
    const [count, ...masks] = run;
    if (!Number.isInteger(count) || count < 1 || rows.length + count > obj.ticks) fail("a run of inputs has a bad length");
    if (!masks.every((m) => Number.isInteger(m) && m >= 0 && m <= MAX_MASK)) fail("a button mask is out of range");
    for (let i = 0; i < count; i++) rows.push(masks);
  }
  if (rows.length !== obj.ticks) fail("the inputs do not add up to the length");
  const config = { seed: c.seed, stage: c.stage, stocks: c.stocks, seats };
  return { config, seats: seats.length, rows, hash: typeof obj.hash === "string" ? obj.hash : null, winner: Number.isInteger(obj.winner) ? obj.winner : -1, done: true };
}

// ---- Playback -------------------------------------------------------------

export class Replay {
  constructor(rec) {
    this.rec = rec;
    this.reset();
  }

  reset() {
    this.state = createMatch(this.rec.config);
    this.tick = 0;
  }

  get length() {
    return this.rec.rows.length;
  }

  get done() {
    return this.tick >= this.length;
  }

  // Advance one tick; false once the recording has run out.
  step() {
    if (this.done) return false;
    step(this.state, this.rec.rows[this.tick]);
    this.tick++;
    return true;
  }

  // Jump to tick `t` (going back restarts the match and runs it forward).
  seek(t) {
    t = Math.max(0, Math.min(this.length, Math.floor(t)));
    if (t < this.tick) this.reset();
    while (this.tick < t) this.step();
  }

  // Does it play back to the fingerprint it was recorded with? Replays the
  // whole match from the start.
  verify() {
    this.reset();
    this.seek(this.length);
    return this.rec.hash === null || hashState(this.state) === this.rec.hash;
  }
}
