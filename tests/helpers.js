// Test helpers: build a match on the flat test stage and skip the intro.
import { createMatch, step } from "../src/index.js";
import { TEST_STAGE } from "../src/stages.js";

export const ROW_Y = TEST_STAGE.rows[0].y; // top of the crumble row
export const ROW_X = TEST_STAGE.rows[0].x;
export const SLAB = TEST_STAGE.slabs[0];

export function testMatch({ seats = [{ kind: "human" }, { kind: "human" }], stage = "test", seed = 7, stocks = 3 } = {}) {
  const state = createMatch({ seed, stage, stocks, seats });
  state.phase = "play";
  state.phaseTimer = 0;
  // No halos: tests place players themselves.
  state.tiles = state.tiles.filter((t) => t.kind !== "halo");
  for (const p of state.players) {
    p.invuln = 0;
    p.ground = null;
    p.supportTiles = [];
    park(state, p);
  }
  return state;
}

// Take a player out of play until a test places them.
export function park(state, p) {
  p.status = "dead";
  p.respawnTimer = 1e9;
}

// Put a player standing on the surface whose top is y, left edge at x.
export function place(state, p, x, y) {
  p.status = "play";
  p.x = x;
  p.y = y - p.h;
  p.vx = 0;
  p.vy = 0;
  p.ground = null;
  p.supportTiles = [];
  p.invuln = 0;
  return p;
}

// Left edge that puts a player wholly on crumble tile i of the test row.
export function onTile(i) {
  return ROW_X + i * 48 + 11;
}

export function run(state, ticks, inputs = () => []) {
  for (let i = 0; i < ticks; i++) step(state, typeof inputs === "function" ? inputs(state, i) : inputs);
  return state;
}

export function tileAt(state, x, y) {
  return state.tiles.find((t) => t.y === y && x >= t.x && x < t.x + t.w);
}
