// Tunable numbers. Units: pixels and ticks (60 ticks per second). The design
// doc (docs/design.md) explains them; keep the two in step.

export const TICK_HZ = 60;

// The playfield every stage is laid out in. The camera shows all of it.
export const WORLD = Object.freeze({ w: 1600, h: 900 });

// Leaving these bounds eliminates a player.
export const BLAST = Object.freeze({ left: -260, right: 1860, top: -420, bottom: 980 });

export const TILE = Object.freeze({ w: 48, h: 18 });

export const PLAYER = Object.freeze({
  w: 26,
  h: 38,
  gravity: 0.6,
  maxFall: 13,
  fastFallGravity: 1.0,
  fastFallMax: 17,
  jumpV: -13,
  airJumpV: -11.2,
  jumpCutV: -5, // releasing jump while rising faster than this cuts the rise
  runMax: 5.4,
  groundAccel: 0.9,
  groundFriction: 0.72,
  airAccel: 0.45,
  airDrag: 0.985,
  overGroundDecay: 0.88, // speed above runMax bleeds off at this rate
  overAirDecay: 0.975,
  coyote: 6, // ticks after leaving a ledge that a ground jump still works
  jumpBuffer: 6, // ticks a jump press waits for the ground
  dropTicks: 12, // ticks one-way platforms are ignored after dropping
  launchedTicks: 18, // reduced air control after a spring/bumper/hazard launch
  stillSpeed: 1.1, // slower than this counts as standing still
  landOverlap: 3, // pixels of horizontal overlap needed to land on a surface
});

export const CRUMBLE = Object.freeze({
  stillRate: 1 / 56, // stress per tick from a player standing still
  moveRate: 1 / 110, // stress per tick from a player moving on it
  decay: 1 / 260, // stress shed per tick with nobody on it
  shakeAt: 0.45, // visible shaking from here
  doomAt: 0.75, // past this the tile keeps going by itself
  doomRate: 1 / 80,
  landStress: 0.06,
  hardLandStress: 0.12, // landing faster than hardLandSpeed
  hardLandSpeed: 10,
  riderShare: 0.6, // a player riding someone's head adds this share of their load
  stompStress: 0.25, // a stomp drives the victim into the floor
  fallTicks: 40, // a broken tile falls (not solid) this long
  respawnTicks: 200, // then is gone this long
  reappearTicks: 45, // then flickers back (not solid) this long
});

// Tile tricks (Dab): hollowed tiles look solid but only their painter can stand on them.
export const HOLLOW = Object.freeze({
  arm: 24, // a hollowed tile shimmers this long before it gives way
  ticks: 150, // then is hollow this long
});

export const STURDY = Object.freeze({
  hp: 4,
  respawnTicks: 480,
});

export const CONTACT = Object.freeze({
  stompSpeed: 4, // closing speed at which vertical contact becomes a stomp/bump
  bounceBase: 3,
  bounceScale: 0.4,
  bounceMax: 9.5,
  pushShare: 0.75, // share of the upper body's speed passed down to an airborne lower body
  slowTicks: 30, // a grounded player stomped on moves slowly this long
  slowMult: 0.55,
  pairCooldown: 8,
  sideSlop: 6, // how far "above" still counts as above, in pixels
});

export const MATCH = Object.freeze({
  introTicks: 150,
  respawnDelay: 90,
  invulnTicks: 120,
  haloTicks: 180,
  haloWidth: 84,
  blameWindow: 300, // ticks an indirect cause stays credited
  endDelay: 120,
  overtimeAt: 90 * 60,
  overtimeStep: 30 * 60,
  collapseAt: 210 * 60,
  collapseEvery: 30, // during collapse a tile is doomed this often
  collapseSturdyEvery: 120, // and every sturdy slab loses 1 hp this often
});
