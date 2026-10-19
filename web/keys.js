// Keyboard input: four seat clusters on one keyboard, plus global keys.
// Uses KeyboardEvent.code (physical keys), so layouts like AZERTY keep the
// same positions. No Ctrl/Alt/Tab/function keys: Ctrl+W would close the tab.

import { BTN } from "../src/input.js";
import { ACTIONS, GLOBAL_KEYS, resolveClusters } from "./bindings.js";

const BIT = { left: BTN.LEFT, right: BTN.RIGHT, up: BTN.UP, down: BTN.DOWN, place: BTN.PLACE, trick: BTN.TRICK, brk: BTN.BREAK };

// The seat clusters in force: defaults plus the player's rebinds.
let clusters = resolveClusters();
// code -> [{ seat, action }]
let codeMap = new Map();

function indexClusters() {
  codeMap = new Map();
  clusters.forEach((c, seat) => {
    for (const action of ACTIONS) {
      for (const code of c.keys[action]) {
        if (!codeMap.has(code)) codeMap.set(code, []);
        codeMap.get(code).push({ seat, action });
      }
    }
  });
}
indexClusters();

export function getClusters() {
  return clusters;
}

export function setBindings(overrides) {
  clusters = resolveClusters(overrides);
  indexClusters();
}

export function shortLabel(seat, action) {
  return clusters[seat].short[action];
}

export class Keyboard {
  constructor(target = window) {
    this.held = new Set();
    this.tapped = new Set(); // pressed since the last sample (catches very short taps)
    this.listeners = [];
    target.addEventListener("keydown", (e) => this.down(e));
    target.addEventListener("keyup", (e) => this.up(e));
    window.addEventListener("blur", () => this.held.clear());
  }

  isGameKey(code) {
    return codeMap.has(code) || GLOBAL_KEYS.has(code);
  }

  down(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return; // never fight browser shortcuts
    if (this.isGameKey(e.code)) e.preventDefault();
    const repeat = e.repeat || this.held.has(e.code);
    this.held.add(e.code);
    this.tapped.add(e.code);
    if (!repeat) for (const fn of this.listeners) fn(e.code, this.menuActions(e.code));
  }

  up(e) {
    if (this.isGameKey(e.code)) e.preventDefault();
    this.held.delete(e.code);
  }

  // Subscribe to fresh key presses: fn(code, [{ seat, action }]).
  onPress(fn) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }

  menuActions(code) {
    return codeMap.get(code) || [];
  }

  // The button bitmask for a seat right now; clears the tap memory for it.
  sample(seat) {
    let bits = 0;
    for (const action of ACTIONS) {
      for (const code of clusters[seat].keys[action]) {
        if (this.held.has(code) || this.tapped.has(code)) bits |= BIT[action];
      }
    }
    return bits;
  }

  clearTaps() {
    this.tapped.clear();
  }

  isHeld(code) {
    return this.held.has(code);
  }
}
