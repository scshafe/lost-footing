import test from "node:test";
import assert from "node:assert/strict";
import { ACTIONS, DEFAULT_CLUSTERS, bind, findOwner, isBindable, keyName, reset, resolveClusters, sanitize } from "../web/bindings.js";

test("defaults resolve to the shipped clusters and labels", () => {
  const c = resolveClusters();
  assert.deepEqual(c[0].keys.left, ["KeyA"]);
  assert.deepEqual(c[1].keys.place, ["Period", "Delete"]);
  assert.equal(c[1].labels.place, ". or Del");
  assert.equal(c[1].short.brk, "⇧");
  assert.equal(c[3].short.up, "Num 8");
});

test("no default key is used twice", () => {
  const seen = new Set();
  for (const c of resolveClusters()) {
    for (const a of ACTIONS) {
      for (const code of c.keys[a]) {
        assert.ok(!seen.has(code), code);
        seen.add(code);
      }
    }
  }
});

test("binding replaces the action's keys and leaves the rest alone", () => {
  const r = bind({}, 1, "place", "KeyB");
  assert.ok(r.ok);
  const c = resolveClusters(r.overrides);
  assert.deepEqual(c[1].keys.place, ["KeyB"]);
  assert.deepEqual(c[1].keys.trick, ["Slash", "End"]);
  assert.deepEqual(resolveClusters()[1].keys.place, ["Period", "Delete"], "the input is not modified");
});

test("a key already in use is refused, and one freed by a rebind is available", () => {
  const taken = bind({}, 0, "left", "KeyJ");
  assert.equal(taken.ok, false);
  assert.match(taken.reason, /already IJKL left/);
  const freed = bind({}, 2, "left", "KeyZ");
  assert.ok(freed.ok);
  assert.ok(bind(freed.overrides, 0, "left", "KeyJ").ok);
  assert.ok(bind({}, 0, "left", "KeyA").ok, "rebinding an action to its own key is fine");
});

test("menu keys, modifiers and function keys cannot be bound", () => {
  for (const code of ["Enter", "Escape", "KeyM", "Digit2", "Space", "Tab", "Backspace", "ControlLeft", "AltRight", "MetaLeft", "F5", "CapsLock", "", undefined]) {
    assert.equal(isBindable(code), false, String(code));
  }
  assert.equal(bind({}, 0, "left", "Escape").ok, false);
  assert.equal(isBindable("ShiftRight"), true);
  assert.equal(isBindable("Digit7"), true);
});

test("reset drops one action or a whole seat", () => {
  let o = bind({}, 0, "left", "KeyZ").overrides;
  o = bind(o, 0, "right", "KeyX").overrides;
  assert.deepEqual(reset(o, 0, "left"), { 0: { right: "KeyX" } });
  assert.deepEqual(reset(o, 0), {});
  assert.deepEqual(reset(reset(o, 0, "left"), 0, "right"), {});
  assert.deepEqual(reset({}, 2, "up"), {});
});

test("findOwner names the seat and action using a key", () => {
  assert.deepEqual(findOwner(resolveClusters(), "End"), { seat: 1, action: "trick" });
  assert.equal(findOwner(resolveClusters(), "KeyB"), null);
});

test("sanitize keeps good stored overrides and drops bad ones", () => {
  assert.deepEqual(sanitize(null), {});
  assert.deepEqual(sanitize("junk"), {});
  const good = sanitize({ 0: { left: "KeyZ", right: "Escape", fly: "KeyB", up: 5 }, 9: { left: "KeyB" } });
  assert.deepEqual(good, { 0: { left: "KeyZ" } });
});

test("sanitize drops an override that collides with another binding", () => {
  // Seat 0 left moved onto seat 2's default key without seat 2 giving it up.
  const out = sanitize({ 0: { left: "KeyJ" } });
  assert.deepEqual(out, {});
  // A swap that is valid as a whole survives, whatever the seat order.
  const swap = sanitize({ 0: { left: "KeyJ" }, 2: { left: "KeyA" } });
  assert.deepEqual(swap, { 0: { left: "KeyJ" }, 2: { left: "KeyA" } });
});

test("key names read well", () => {
  assert.equal(keyName("KeyQ"), "Q");
  assert.equal(keyName("Digit7"), "7");
  assert.equal(keyName("ArrowUp"), "↑");
  assert.equal(keyName("Numpad4"), "Num 4");
  assert.equal(DEFAULT_CLUSTERS.length, 4);
});
