// A stable fingerprint of a match state: FNV-1a over its JSON text, leaving
// out the per-tick event list (presentation only). Two runs with the same seed
// and the same inputs must produce the same hash on every tick.

export function hashState(state) {
  const text = JSON.stringify(state, (key, value) => (key === "events" ? undefined : value));
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
