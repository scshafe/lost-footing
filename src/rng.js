// Seeded random numbers for the simulation. The generator state is a uint32
// kept in a plain object field, so it is part of the match state: saving,
// hashing or replaying the state carries the generator with it. Never use
// Math.random or the clock inside src/.

// Mulberry32: advance holder[key] and return the next uint32.
export function nextU32(holder, key = "rng") {
  const s = (holder[key] = (holder[key] + 0x6d2b79f5) >>> 0);
  let t = Math.imul(s ^ (s >>> 15), s | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}

// A float in [0, 1).
export function rand(holder, key = "rng") {
  return nextU32(holder, key) / 4294967296;
}

// An integer in [lo, hi], both inclusive.
export function randInt(holder, lo, hi, key = "rng") {
  return lo + Math.floor(rand(holder, key) * (hi - lo + 1));
}

// A float in [lo, hi).
export function randRange(holder, lo, hi, key = "rng") {
  return lo + rand(holder, key) * (hi - lo);
}

// Turn a number or string seed into a uint32 (FNV-1a over its text).
export function seedToU32(seed) {
  const text = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
