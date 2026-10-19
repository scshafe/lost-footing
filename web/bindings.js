// Key bindings: the default seat clusters, player overrides, and the rules for
// changing them. Pure data and functions (no DOM), so Node tests can run them.
// Keys are KeyboardEvent.code values (physical positions).

export const ACTIONS = ["left", "right", "up", "down", "place", "trick", "brk"];

export const DEFAULT_CLUSTERS = [
  {
    name: "Left keys",
    keys: { left: ["KeyA"], right: ["KeyD"], up: ["KeyW"], down: ["KeyS"], place: ["KeyQ"], trick: ["KeyE"], brk: ["KeyR"] },
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
  },
  {
    name: "IJKL",
    keys: { left: ["KeyJ"], right: ["KeyL"], up: ["KeyI"], down: ["KeyK"], place: ["KeyU"], trick: ["KeyO"], brk: ["KeyP"] },
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
  },
];

// Keys the menus own: they cannot be bound to a seat.
export const GLOBAL_KEYS = new Set(["Escape", "Enter", "NumpadEnter", "KeyM", "Digit1", "Digit2", "Digit3", "Digit4", "Space", "Backspace", "Tab"]);

// Keys that cannot work as game keys: the client ignores presses made with
// Ctrl, Alt or Meta held (so those keys themselves never arrive), and the rest
// belong to the browser or the system.
const RESERVED = /^(Control|Alt|Meta|OS|F\d+$|ContextMenu|CapsLock|NumLock|ScrollLock|PrintScreen|Pause)/;

export function isBindable(code) {
  return typeof code === "string" && code.length > 0 && code.length < 24 && !GLOBAL_KEYS.has(code) && !RESERVED.test(code);
}

const NAMES = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Period: ".",
  Comma: ",",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  ShiftLeft: "L-Shift",
  ShiftRight: "R-Shift",
  Delete: "Del",
  PageDown: "PgDn",
  PageUp: "PgUp",
  NumpadAdd: "Num +",
  NumpadSubtract: "Num -",
  NumpadMultiply: "Num *",
  NumpadDivide: "Num /",
  NumpadDecimal: "Num .",
};

export function keyName(code) {
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Num " + code.slice(6);
  return code;
}

// Overrides are { [seat]: { [action]: code } }. A bound action holds exactly
// that one key; an action without an override keeps its default keys.
export function resolveClusters(overrides = {}) {
  return DEFAULT_CLUSTERS.map((base, seat) => {
    const keys = {};
    const labels = {};
    const short = {};
    for (const action of ACTIONS) {
      const own = overrides[seat] && overrides[seat][action];
      keys[action] = own ? [own] : [...base.keys[action]];
      labels[action] = keys[action].map(keyName).join(" or ");
      short[action] = keys[action][0] === "ShiftRight" ? "⇧" : keyName(keys[action][0]);
    }
    return { name: base.name, keys, labels, short };
  });
}

// Who uses `code` right now: { seat, action } or null.
export function findOwner(clusters, code) {
  for (let seat = 0; seat < clusters.length; seat++) {
    for (const action of ACTIONS) {
      if (clusters[seat].keys[action].includes(code)) return { seat, action };
    }
  }
  return null;
}

// Try to bind `code` to (seat, action). Returns { ok: true, overrides } with a
// new overrides object, or { ok: false, reason } and nothing changes.
export function bind(overrides, seat, action, code) {
  if (!isBindable(code)) return { ok: false, reason: `${keyName(code)} can't be used as a game key` };
  const clusters = resolveClusters(overrides);
  const owner = findOwner(clusters, code);
  if (owner && !(owner.seat === seat && owner.action === action)) {
    return { ok: false, reason: `${keyName(code)} is already ${clusters[owner.seat].name} ${owner.action === "brk" ? "break" : owner.action}` };
  }
  const next = structuredClone(overrides);
  (next[seat] ||= {})[action] = code;
  return { ok: true, overrides: next };
}

// Drop one override (back to the default keys), or a whole seat's with no action.
export function reset(overrides, seat, action) {
  const next = structuredClone(overrides);
  if (!next[seat]) return next;
  if (action) delete next[seat][action];
  else delete next[seat];
  if (next[seat] && !Object.keys(next[seat]).length) delete next[seat];
  return next;
}

// Make stored overrides safe: keep only known seats and actions with bindable
// keys, then drop overrides until no key is used twice.
export function sanitize(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (let seat = 0; seat < DEFAULT_CLUSTERS.length; seat++) {
    const mine = raw[seat];
    if (!mine || typeof mine !== "object") continue;
    for (const action of ACTIONS) {
      if (isBindable(mine[action])) (out[seat] ||= {})[action] = mine[action];
    }
  }
  for (;;) {
    const clusters = resolveClusters(out);
    const users = new Map(); // code -> [{ seat, action }]
    clusters.forEach((c, seat) => {
      for (const action of ACTIONS) {
        for (const code of c.keys[action]) users.set(code, [...(users.get(code) || []), { seat, action }]);
      }
    });
    const clash = [...users.values()].find((u) => u.length > 1);
    if (!clash) return out;
    const culprit = clash.find((u) => out[u.seat] && out[u.seat][u.action]);
    delete out[culprit.seat][culprit.action];
    if (!Object.keys(out[culprit.seat]).length) delete out[culprit.seat];
  }
}
