// Small helpers shared by the simulation modules.

import { MATCH } from "./constants.js";

// Presentation events (sounds, particles). Cleared at the start of each tick;
// the client drains them after every step. Not part of the state hash.
export function addEvent(state, event) {
  event.tick = state.tick;
  state.events.push(event);
}

// Record that `bySeat` just did something indirect to player `p` (its glue
// held them, its spring launched them...). If p is eliminated within
// MATCH.blameWindow ticks, bySeat is credited with the elimination.
export function blame(state, p, bySeat, cause) {
  if (bySeat < 0 || bySeat === p.seat) return;
  p.blame = { seat: bySeat, tick: state.tick, cause };
}

export function currentBlame(state, p) {
  if (p.blame && state.tick - p.blame.tick <= MATCH.blameWindow) return p.blame;
  return null;
}

// Teams: a player's team is their config team, or their own seat when they
// play alone. Same team = never opponents.
export function teamOf(p) {
  return p.team >= 0 ? p.team : 100 + p.seat;
}

export function sameTeam(a, b) {
  return teamOf(a) === teamOf(b);
}

export function creditBreak(state, seat, tile) {
  const p = state.players[seat];
  if (!p) return;
  if (tile.kind === "crumble") p.stats.tilesBroken++;
  else if (tile.kind === "sturdy") p.stats.slabsBroken++;
}

export function overlaps(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Does a circle overlap an axis-aligned box?
export function circleBox(cx, cy, r, bx, by, bw, bh) {
  const nx = cx < bx ? bx : cx > bx + bw ? bx + bw : cx;
  const ny = cy < by ? by : cy > by + bh ? by + bh : cy;
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function sign(v) {
  return v > 0 ? 1 : v < 0 ? -1 : 0;
}
