// Keyboard input: four seat clusters on one keyboard, plus global keys.
// Uses KeyboardEvent.code (physical keys), so layouts like AZERTY keep the
// same positions. No Ctrl/Alt/Tab/function keys: Ctrl+W would close the tab.

import { BTN } from "../src/input.js";

export const CLUSTERS = [
  {
    name: "Left keys",
    keys: { left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], down: ["KeyS"], place: ["KeyQ"], trick: ["KeyE"], brk: ["KeyR"] },
    labels: { left: "A", right: "D", up: "W", down: "S", place: "Q", trick: "E", brk: "R" },
  },
  {
    name: "Arrows",
    keys: {
      left: ["ArrowLeft"],
      right: ["ArrowRight"],
      up: ["ArrowUp"],
      down: ["ArrowDown"],
      place: ["Period", "Delete"],
      trick: ["Slash", "End"],
      brk: ["ShiftRight", "PageDown"],
    },
    labels: { left: "←", right: "→", up: "↑", down: "↓", place: ". / Del", trick: "/ or End", brk: "R-Shift / PgDn" },
    short: { place: ".", trick: "/", brk: "⇧" },
  },
  {
    name: "IJKL",
    keys: { left: ["KeyJ"], right: ["KeyL"], up: ["KeyI"], down: ["KeyK"], place: ["KeyU"], trick: ["KeyO"], brk: ["KeyP"] },
    labels: { left: "J", right: "L", up: "I", down: "K", place: "U", trick: "O", brk: "P" },
  },
  {
    name: "Numpad",
    keys: {
      left: ["Numpad4"],
      right: ["Numpad6"],
      up: ["Numpad8"],
      down: ["Numpad5", "Numpad2"],
      place: ["Numpad7"],
      trick: ["Numpad9"],
      brk: ["NumpadAdd"],
    },
    labels: { left: "n4", right: "n6", up: "n8", down: "n5", place: "n7", trick: "n9", brk: "n+" },
  },
];

const BIT = { left: BTN.LEFT, right: BTN.RIGHT, up: BTN.UP, down: BTN.DOWN, place: BTN.PLACE, trick: BTN.TRICK, brk: BTN.BREAK };

// code -> [{ seat, action }]
const CODE_MAP = new Map();
CLUSTERS.forEach((c, seat) => {
  for (const [action, codes] of Object.entries(c.keys)) {
    for (const code of codes) {
      if (!CODE_MAP.has(code)) CODE_MAP.set(code, []);
      CODE_MAP.get(code).push({ seat, action });
    }
  }
});

const GLOBAL = new Set(["Escape", "Enter", "NumpadEnter", "KeyM", "Digit1", "Digit2", "Digit3", "Digit4", "Space", "Backspace", "Tab"]);

export function shortLabel(seat, action) {
  const c = CLUSTERS[seat];
  return (c.short && c.short[action]) || c.labels[action];
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
    return CODE_MAP.has(code) || GLOBAL.has(code);
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
    return CODE_MAP.get(code) || [];
  }

  // The button bitmask for a seat right now; clears the tap memory for it.
  sample(seat) {
    let bits = 0;
    for (const [action, codes] of Object.entries(CLUSTERS[seat].keys)) {
      for (const code of codes) {
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
