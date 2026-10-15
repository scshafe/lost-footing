// Per-tick button states. Each seat sends one bitmask per tick; the
// simulation never sees keys, only these buttons.

export const BTN = Object.freeze({
  LEFT: 1,
  RIGHT: 2,
  UP: 4, // jump
  DOWN: 8, // drop through a platform, fast fall
  PLACE: 16, // move slot 1
  TRICK: 32, // move slot 2
  BREAK: 64, // move slot 3
});

export const MOVE_BUTTONS = [BTN.PLACE, BTN.TRICK, BTN.BREAK];

export function buttons({ left, right, up, down, place, trick, brk } = {}) {
  return (
    (left ? BTN.LEFT : 0) |
    (right ? BTN.RIGHT : 0) |
    (up ? BTN.UP : 0) |
    (down ? BTN.DOWN : 0) |
    (place ? BTN.PLACE : 0) |
    (trick ? BTN.TRICK : 0) |
    (brk ? BTN.BREAK : 0)
  );
}
