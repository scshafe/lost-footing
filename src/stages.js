// Stage layouts. A stage is rows of crumble tiles, a few sturdy slabs, spawn
// points (where respawn halos appear) and the stage hazards that make the
// sturdy slabs dangerous on a rhythm. Everything is in the 1600x900 world.
//
// rows:   { x, y, n }        n crumble tiles of TILE.w starting at x, top at y
// slabs:  { x, y, w, hp? }   one sturdy slab
// spawns: { x, y }           halo centre x and halo top y
// hazards: see src/hazards.js

import { TILE, STURDY } from "./constants.js";

export const STAGES = [
  {
    id: "yard",
    name: "Crumble Yard",
    blurb: "Brick tiers over a pit. Comets skim the sturdy slabs.",
    theme: { skyTop: "#1b1f3b", skyBottom: "#3c2a4d", tile: "#c9733c", tileEdge: "#7a3d1c", slab: "#8a93a6", accent: "#ffcf6e", hazard: "#ff8a3d" },
    rows: [
      { x: 260, y: 640, n: 8 },
      { x: 956, y: 640, n: 8 },
      { x: 400, y: 510, n: 4 },
      { x: 1008, y: 510, n: 4 },
      { x: 584, y: 380, n: 3 },
      { x: 872, y: 380, n: 3 },
      { x: 656, y: 250, n: 6 },
      { x: 392, y: 770, n: 3 },
      { x: 1064, y: 770, n: 3 },
    ],
    slabs: [
      { x: 700, y: 640, w: 200 },
      { x: 150, y: 470, w: 130 },
      { x: 1320, y: 470, w: 130 },
    ],
    spawns: [
      { x: 470, y: 420 },
      { x: 1130, y: 420 },
      { x: 300, y: 300 },
      { x: 1300, y: 300 },
    ],
    hazards: [{ type: "comet", lanes: [640, 470], every: [360, 520], warn: 90, speed: 8.5 }],
  },
  {
    id: "quarry",
    name: "The Quarry",
    blurb: "A great stone ledge over the pit. The cliffs above keep dropping rocks on it.",
    theme: { skyTop: "#2a2118", skyBottom: "#5e4630", tile: "#b48a5a", tileEdge: "#6b4d2c", slab: "#9b968c", accent: "#ffe0a3", hazard: "#ff6a3d" },
    rows: [
      { x: 150, y: 610, n: 5 },
      { x: 1210, y: 610, n: 5 },
      { x: 380, y: 480, n: 4 },
      { x: 1028, y: 480, n: 4 },
      { x: 704, y: 350, n: 4 },
      { x: 520, y: 220, n: 3 },
      { x: 936, y: 220, n: 3 },
    ],
    slabs: [
      { x: 600, y: 620, w: 400, hp: 8 },
      { x: 140, y: 350, w: 130 },
      { x: 1330, y: 350, w: 130 },
    ],
    spawns: [
      { x: 470, y: 400 },
      { x: 1130, y: 400 },
      { x: 300, y: 270 },
      { x: 1300, y: 270 },
    ],
    hazards: [{ type: "rockfall", every: [200, 300], warn: 80, sturdyBias: 0.6 }],
  },
  {
    id: "tide",
    name: "Tide Pools",
    blurb: "Low stone islands are the only sturdy ground, until the tide comes in.",
    theme: { skyTop: "#0f2a3a", skyBottom: "#1f5c6b", tile: "#5fa39a", tileEdge: "#2c5d58", slab: "#a9b7b5", accent: "#bff7ee", hazard: "#59d0ff" },
    rows: [
      { x: 380, y: 640, n: 5 },
      { x: 980, y: 640, n: 5 },
      { x: 680, y: 530, n: 5 },
      { x: 220, y: 480, n: 4 },
      { x: 1188, y: 480, n: 4 },
      { x: 500, y: 390, n: 3 },
      { x: 956, y: 390, n: 3 },
      { x: 704, y: 270, n: 4 },
    ],
    slabs: [
      { x: 140, y: 770, w: 200 },
      { x: 700, y: 770, w: 200 },
      { x: 1260, y: 770, w: 200 },
    ],
    spawns: [
      { x: 470, y: 320 },
      { x: 1130, y: 320 },
      { x: 800, y: 450 },
      { x: 800, y: 190 },
    ],
    hazards: [
      { type: "tide", every: [720, 900], warn: 120, rise: 150, hold: 240, fall: 150, low: 960, high: 735 },
      { type: "comet", lanes: [530], every: [540, 840], warn: 90, speed: 7.5 },
    ],
  },
  {
    id: "gale",
    name: "Gale Bridge",
    blurb: "One long bridge over nothing. Gales sweep it from either side.",
    theme: { skyTop: "#1d2b4f", skyBottom: "#7a8fb8", tile: "#d6c08a", tileEdge: "#7d6a3e", slab: "#7f8798", accent: "#e8f1ff", hazard: "#9fd8ff" },
    rows: [
      { x: 200, y: 640, n: 25 },
      { x: 360, y: 500, n: 4 },
      { x: 1048, y: 500, n: 4 },
      { x: 640, y: 420, n: 7 },
      { x: 420, y: 280, n: 4 },
      { x: 988, y: 280, n: 4 },
      { x: 728, y: 170, n: 3 },
    ],
    slabs: [
      { x: 180, y: 380, w: 130 },
      { x: 1290, y: 380, w: 130 },
      { x: 740, y: 760, w: 120 },
    ],
    spawns: [
      { x: 480, y: 560 },
      { x: 1120, y: 560 },
      { x: 300, y: 300 },
      { x: 1300, y: 300 },
    ],
    hazards: [
      { type: "gale", every: [600, 780], warn: 100, duration: 200, force: 0.34 },
      { type: "comet", lanes: [380], every: [540, 780], warn: 90, speed: 8 },
    ],
  },
];

// A flat test stage for unit tests: one long row of crumble tiles and one slab.
export const TEST_STAGE = {
  id: "test",
  name: "Test Floor",
  blurb: "",
  theme: STAGES[0].theme,
  rows: [{ x: 200, y: 700, n: 20 }],
  slabs: [{ x: 1200, y: 700, w: 200 }],
  spawns: [
    { x: 400, y: 600 },
    { x: 800, y: 600 },
    { x: 1000, y: 600 },
    { x: 1300, y: 600 },
  ],
  hazards: [],
};

export function stageById(id) {
  if (id === "test") return TEST_STAGE;
  return STAGES.find((s) => s.id === id) || STAGES[0];
}

// Build the tile list of a stage. Tile ids are their index in the list.
export function buildTiles(stage) {
  const tiles = [];
  const add = (t) => tiles.push({ id: tiles.length, ...t });
  for (const row of stage.rows) {
    for (let i = 0; i < row.n; i++) {
      add({
        kind: "crumble",
        x: row.x + i * TILE.w,
        y: row.y,
        w: TILE.w,
        h: TILE.h,
        state: "solid",
        stress: 0,
        load: 0,
        timer: 0,
        fallY: 0,
        fallVy: 0,
        hp: 1,
        maxHp: 1,
        stressBy: -1,
        stressAt: -9999,
        stressCause: "",
        owner: -1,
        life: -1,
        hollow: 0,
        hollowArm: 0,
        hollowBy: -1,
      });
    }
  }
  for (const slab of stage.slabs) {
    const hp = slab.hp || STURDY.hp;
    add({
      kind: "sturdy",
      x: slab.x,
      y: slab.y,
      w: slab.w,
      h: TILE.h + 6,
      state: "solid",
      stress: 0,
      load: 0,
      timer: 0,
      fallY: 0,
      fallVy: 0,
      hp,
      maxHp: hp,
      stressBy: -1,
      stressAt: -9999,
      stressCause: "",
      owner: -1,
      life: -1,
      hollow: 0,
      hollowArm: 0,
      hollowBy: -1,
    });
  }
  return tiles;
}
