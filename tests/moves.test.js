import { test } from "node:test";
import assert from "node:assert/strict";
import { step, BTN, CHARACTERS } from "../src/index.js";
import { OBJ } from "../src/objects.js";
import { testMatch, place, onTile, run, tileAt, ROW_Y, ROW_X, SLAB } from "./helpers.js";

const KEY = [BTN.PLACE, BTN.TRICK, BTN.BREAK];

function match(a, b = "mason") {
  return testMatch({ seats: [{ kind: "human", character: a }, { kind: "human", character: b }] });
}

// Press a move key for one tick (plus any held buttons), then release.
function cast(s, slot, held = 0, seat = 0) {
  const inputs = [0, 0];
  inputs[seat] = KEY[slot] | held;
  step(s, inputs);
  const done = s.events.find((e) => e.type === "cast" && e.seat === seat);
  const r = [0, 0];
  r[seat] = held;
  step(s, r);
  return done;
}

function stand(s, seat, i) {
  const p = place(s, s.players[seat], onTile(i), ROW_Y);
  step(s, []);
  return p;
}

const objs = (s, type) => s.objects.filter((o) => o.type === type);

test("every move has a cooldown: it cannot be spammed", () => {
  for (const id of Object.keys(CHARACTERS)) {
    for (let slot = 0; slot < 3; slot++) {
      const s = match(id);
      const p = stand(s, 0, 8);
      p.facing = 1;
      assert.ok(cast(s, slot), `${id} move ${slot} casts`);
      assert.ok(p.cd[slot] >= 60, `${id} move ${slot} has a cooldown of at least a second`);
      p.drill = 0;
      assert.equal(cast(s, slot), undefined, `${id} move ${slot} cannot recast at once`);
    }
  }
});

test("no move touches another player directly", () => {
  for (const id of Object.keys(CHARACTERS)) {
    for (let slot = 0; slot < 3; slot++) {
      const s = match(id);
      const p = stand(s, 0, 8);
      p.facing = 1;
      const q = stand(s, 1, 9);
      q.x = p.x + 30; // right in front
      step(s, []);
      cast(s, slot);
      for (let i = 0; i < 8; i++) {
        step(s, []);
        assert.equal(q.vx, 0, `${id} move ${slot} does not push`);
        assert.ok(q.vy >= 0, `${id} move ${slot} does not launch`);
      }
    }
  }
});

test("Mason's wall blocks movement and reflects a saw; two at once", () => {
  const s = match("mason", "fuse");
  const p = stand(s, 0, 4);
  p.facing = 1;
  cast(s, 0);
  const [wall] = objs(s, "wall");
  assert.ok(wall && wall.solid);
  const q = stand(s, 1, 10);
  q.facing = -1;
  run(s, 60, [0, BTN.LEFT]);
  assert.ok(q.x >= wall.x + wall.w - 0.01, "the walker is stopped at the wall");
  assert.equal(q.blame.seat, 0);
  // A saw thrown at the wall comes back.
  q.cd[2] = 0;
  cast(s, 2, 0, 1);
  const [saw] = objs(s, "saw");
  run(s, 30);
  assert.equal(saw.dir, 1, "reflected");
  // A third wall removes the oldest.
  const s2 = match("mason");
  const m = place(s2, s2.players[0], SLAB.x + 90, SLAB.y);
  step(s2, []);
  for (let i = 0; i < 3; i++) {
    m.cd[0] = 0;
    cast(s2, 0, i === 1 ? BTN.LEFT : i === 2 ? BTN.RIGHT : 0);
  }
  assert.equal(objs(s2, "wall").length, 2);
  // Walls expire.
  run(s2, OBJ.wall.life + 5);
  assert.equal(objs(s2, "wall").length, 0);
});

test("Mason's ledge catches him in the air and vanishes later", () => {
  const s = match("mason");
  const p = place(s, s.players[0], 100, 300);
  p.vy = 2;
  cast(s, 1);
  run(s, 10);
  assert.ok(p.ground, "standing on the ledge");
  assert.equal(s.tiles.find((t) => t.id === p.ground.id).kind, "ledge");
  run(s, OBJ.ledge.life);
  assert.equal(p.ground, null, "the ledge is gone");
});

test("Mason's anvil punches through crumble tiles and cracks slabs", () => {
  const s = match("mason");
  const p = place(s, s.players[0], onTile(5), ROW_Y - 200);
  p.vy = -1;
  p.facing = 1;
  cast(s, 2);
  run(s, 60);
  assert.ok(p.stats.tilesBroken >= 1, "broke a tile");
  const s2 = match("mason");
  const m = place(s2, s2.players[0], SLAB.x + 60, SLAB.y);
  step(s2, []);
  m.facing = 1;
  cast(s2, 2);
  run(s2, 60);
  const slab = tileAt(s2, SLAB.x + 10, SLAB.y);
  assert.equal(slab.hp, slab.maxHp - 2);
});

test("Glim's glue pins you: you crawl and the tile crumbles under you", () => {
  const s = match("glim");
  const g = stand(s, 0, 2);
  g.facing = 1;
  cast(s, 0);
  run(s, 40);
  const [coat] = objs(s, "coat");
  assert.ok(coat && coat.coat === "glue", "a glue patch");
  const q = place(s, s.players[1], (coat.x0 + coat.x1) / 2 - 13, ROW_Y);
  step(s, [0, 0]);
  run(s, 20, [0, BTN.RIGHT]);
  assert.equal(q.surface, "glue");
  assert.ok(Math.abs(q.vx) < 1.1, `crawling (${q.vx})`);
  assert.equal(q.blame.seat, 0);
  let fell = false;
  for (let i = 0; i < 90 && !fell; i++) {
    step(s, [0, BTN.RIGHT]);
    fell = !q.ground;
  }
  assert.ok(fell, "the glued tile gave way");
});

test("Glim's oil keeps you sliding", () => {
  const s = match("glim");
  const g = stand(s, 0, 2);
  g.facing = 1;
  cast(s, 1, BTN.RIGHT);
  run(s, 40);
  const [coat] = objs(s, "coat");
  assert.equal(coat.coat, "oil");
  const q = place(s, s.players[1], coat.x0 - 60, ROW_Y);
  step(s, []);
  run(s, 14, [0, BTN.RIGHT]);
  run(s, 3);
  assert.equal(q.surface, "oil");
  const v = q.vx;
  run(s, 4);
  assert.ok(q.vx > v * 0.95, `momentum kept (${v} -> ${q.vx})`);
});

test("Glim's acid dissolves the tiles it lands on", () => {
  const s = match("glim");
  const g = stand(s, 0, 2);
  g.facing = 1;
  cast(s, 2);
  run(s, 30);
  const [coat] = objs(s, "coat");
  assert.equal(coat.coat, "acid");
  const ids = coat.supports.slice();
  run(s, 60);
  for (const id of ids) assert.notEqual(s.tiles[id].state, "solid");
  assert.ok(g.stats.tilesBroken >= ids.length);
});

test("Pip's spring launches whoever steps on it, angled if placed so", () => {
  const s = match("pip");
  const p = stand(s, 0, 4);
  p.facing = 1;
  cast(s, 0);
  const [spr] = objs(s, "spring");
  assert.equal(spr.angle, 0);
  const q = stand(s, 1, 9);
  let launched = false;
  for (let i = 0; i < 80 && !launched; i++) {
    step(s, [0, BTN.LEFT]);
    launched = q.vy < -10;
  }
  assert.ok(launched, "launched");
  assert.equal(q.blame.seat, 0);
  // Angled.
  const s2 = match("pip");
  const p2 = stand(s2, 0, 4);
  p2.facing = 1;
  cast(s2, 0, BTN.RIGHT);
  assert.equal(objs(s2, "spring")[0].angle, 1);
});

test("Pip's spring in the air launches Pip", () => {
  const s = match("pip");
  const p = place(s, s.players[0], 100, 500);
  p.vy = 5;
  cast(s, 0);
  assert.ok(p.vy < -10);
});

test("Pip's gust pushes players standing in it", () => {
  const s = match("pip");
  const p = stand(s, 0, 2);
  p.facing = 1;
  cast(s, 1);
  run(s, OBJ.gust.arm);
  const q = stand(s, 1, 8);
  run(s, 10);
  assert.ok(q.vx > 1, `pushed (${q.vx})`);
  assert.equal(q.blame.seat, 0);
});

test("Pip's drill breaks the floor it lands on and shakes the tiles around", () => {
  const s = match("pip");
  const p = place(s, s.players[0], onTile(8), ROW_Y - 150);
  p.vy = 0;
  cast(s, 2);
  let hit = false;
  for (let i = 0; i < 30 && !hit; i++) {
    step(s, []);
    hit = s.events.some((e) => e.type === "drillHit");
  }
  assert.ok(hit);
  const under = tileAt(s, onTile(8) + 13, ROW_Y);
  assert.notEqual(under.state, "solid");
  const near = tileAt(s, onTile(10) + 13, ROW_Y);
  assert.ok(near.stress >= 0.35, `shaken (${near.stress})`);
  assert.ok(p.vy < 0, "Pip bounces");
});

test("Fuse's bumper arms first, then bounces, and wears out", () => {
  const s = match("fuse");
  const p = stand(s, 0, 4);
  p.facing = 1;
  cast(s, 0);
  const [b] = objs(s, "bumper");
  assert.ok(b.armed > 0, "arming");
  const q = place(s, s.players[1], b.x - 13, ROW_Y);
  step(s, []);
  assert.equal(q.vx, 0, "no effect while arming");
  run(s, OBJ.bumper.arm);
  assert.ok(Math.abs(q.vx) + Math.abs(q.vy) > 5, "bounced once armed");
  assert.equal(q.blame.seat, 0);
  assert.equal(b.uses, OBJ.bumper.uses - 1);
});

test("Fuse's charge breaks everything nearby when the fuse runs out", () => {
  const s = match("fuse", "mason");
  const p = stand(s, 0, 2);
  p.facing = 1;
  const m = stand(s, 1, 9);
  m.facing = -1;
  cast(s, 0, 0, 1); // Mason puts a wall near where the charge will land
  cast(s, 1);
  run(s, 30);
  const [c] = objs(s, "charge");
  assert.ok(c, "stuck");
  const cx = c.x + c.w / 2;
  run(s, OBJ.charge.fuse);
  const broken = s.tiles.filter((t) => t.y === ROW_Y && t.state !== "solid" && Math.abs(t.x + 24 - cx) < 90);
  assert.ok(broken.length >= 3, `broke ${broken.length} tiles`);
  assert.equal(objs(s, "charge").length, 0);
});

test("Fuse's saw rolls along the floor and dooms what it crosses", () => {
  const s = match("fuse");
  const p = stand(s, 0, 1);
  p.facing = 1;
  cast(s, 2);
  run(s, 40);
  const doomed = s.tiles.filter((t) => t.y === ROW_Y && (t.stress >= 0.8 || t.state !== "solid") && t.x > ROW_X + 48 * 2);
  assert.ok(doomed.length >= 4, `doomed ${doomed.length}`);
  run(s, 60);
  assert.ok(p.stats.tilesBroken >= 4, "credited");
});

test("combinations: glue slows a saw, a spring launches it, a charge clears placeables", () => {
  const s = match("glim", "fuse");
  const g = stand(s, 0, 2);
  g.facing = 1;
  cast(s, 0); // glue ahead
  run(s, 40);
  const [coat] = objs(s, "coat");
  g.status = "dead"; // Glim steps out of the way
  const f = stand(s, 1, 5);
  f.facing = 1;
  cast(s, 2, 0, 1);
  const [saw] = objs(s, "saw");
  let slowest = 99;
  for (let i = 0; i < 90 && !saw.dead; i++) {
    const x0 = saw.x;
    step(s, []);
    if (saw.x > coat.x0 && saw.x < coat.x1 && saw.onTop !== null) slowest = Math.min(slowest, saw.x - x0);
  }
  assert.ok(slowest < 4, `slowed on glue (${slowest})`);

  const s2 = match("pip", "fuse");
  const p = stand(s2, 0, 6);
  p.facing = 1;
  cast(s2, 0);
  p.status = "dead"; // Pip steps out of the way
  run(s2, 20);
  const f2 = stand(s2, 1, 2);
  f2.facing = 1;
  cast(s2, 2, 0, 1);
  const [saw2] = objs(s2, "saw");
  let rose = false;
  for (let i = 0; i < 70; i++) {
    step(s2, []);
    if (saw2.vy < -5) rose = true;
  }
  assert.ok(rose, "the spring launched the saw");

  const s3 = match("fuse", "mason");
  const fz = stand(s3, 0, 3);
  fz.facing = 1;
  cast(s3, 1); // a charge lands ahead
  run(s3, 32);
  const [c] = objs(s3, "charge");
  const m = place(s3, s3.players[1], c.x + 60, ROW_Y);
  step(s3, []);
  m.facing = -1;
  cast(s3, 0, 0, 1); // Mason walls right next to it
  assert.equal(objs(s3, "wall").length, 1);
  run(s3, OBJ.charge.fuse);
  assert.equal(objs(s3, "wall").length, 0, "the blast cleared the wall");
});
