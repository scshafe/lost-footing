// Platform tiles: crumble tiles (stress from standing, shake, fall, respawn),
// sturdy slabs (hit points, broken only by moves and hazards) and temporary
// tiles (respawn halos, Mason's ledge).

import { CRUMBLE, STURDY, MATCH } from "./constants.js";
import { addEvent, blame, creditBreak } from "./common.js";

export function getTile(state, id) {
  if (id < state.baseTiles) return state.tiles[id];
  for (let i = state.baseTiles; i < state.tiles.length; i++) if (state.tiles[i].id === id) return state.tiles[i];
  return null;
}

export function isSolid(tile) {
  return !!tile && tile.state === "solid";
}

// Add a temporary tile (a halo or a ledge).
export function addTempTile(state, { kind, x, y, w, h, owner, life, hp = 1 }) {
  const tile = {
    id: state.nextTileId++,
    kind,
    x,
    y,
    w,
    h,
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
    owner,
    life,
    age: 0,
  };
  state.tiles.push(tile);
  return tile;
}

// Add stress to a crumble tile on behalf of a player's move (by >= 0) or the
// stage (by = -1). A sturdy slab ignores stress.
export function stressTile(state, tile, amount, by, cause = "crumble") {
  if (!isSolid(tile) || tile.kind !== "crumble") return;
  tile.stress = Math.min(1, tile.stress + amount);
  if (by >= 0) {
    tile.stressBy = by;
    tile.stressAt = state.tick;
    tile.stressCause = cause;
  }
  if (tile.stress >= 1) breakTile(state, tile, by >= 0 ? by : creditFor(state, tile), tile.stressCause || cause);
}

// Damage a sturdy slab or a temporary tile; a crumble tile breaks outright.
export function damageTile(state, tile, amount, by, cause = "break") {
  if (!isSolid(tile)) return;
  if (tile.kind === "crumble") {
    breakTile(state, tile, by, cause);
    return;
  }
  if (tile.kind === "halo") return;
  tile.hp -= amount;
  if (by >= 0) {
    tile.stressBy = by;
    tile.stressAt = state.tick;
  }
  addEvent(state, { type: "slabHit", x: tile.x + tile.w / 2, y: tile.y, hp: tile.hp, id: tile.id });
  if (tile.hp <= 0) breakTile(state, tile, by, cause);
}

function creditFor(state, tile) {
  return tile.stressBy >= 0 && state.tick - tile.stressAt <= MATCH.blameWindow ? tile.stressBy : -1;
}

// Break a tile now: it stops being solid and falls away. `by` is the seat
// whose move broke it (-1 for the stage or plain standing).
export function breakTile(state, tile, by = -1, cause = "break") {
  if (!isSolid(tile)) return;
  tile.state = "falling";
  tile.timer = 0;
  tile.fallY = 0;
  tile.fallVy = 0;
  tile.stress = 1;
  if (by >= 0) creditBreak(state, by, tile);
  // Players standing on it lose their footing; credit the breaker.
  for (const p of state.players) {
    if (p.status === "play" && p.supportTiles.includes(tile.id)) {
      if (by >= 0 && by !== p.seat) blame(state, p, by, cause);
    }
  }
  addEvent(state, { type: "tileBreak", kind: tile.kind, x: tile.x + tile.w / 2, y: tile.y, w: tile.w, by, id: tile.id });
}

export function updateTiles(state) {
  const respawnMult = state.respawnMult;
  let removeTemp = false;
  for (const tile of state.tiles) {
    switch (tile.state) {
      case "solid": {
        if (tile.kind === "crumble") {
          if (tile.load > 0) {
            tile.stress += tile.load;
          } else if (tile.stress < CRUMBLE.doomAt) {
            tile.stress = Math.max(0, tile.stress - CRUMBLE.decay);
          }
          if (tile.stress >= CRUMBLE.doomAt) tile.stress += CRUMBLE.doomRate;
          if (tile.stress >= CRUMBLE.shakeAt && !tile.shaking) {
            tile.shaking = true;
            addEvent(state, { type: "tileShake", x: tile.x + tile.w / 2, y: tile.y });
          } else if (tile.stress < CRUMBLE.shakeAt) {
            tile.shaking = false;
          }
          if (tile.stress >= 1) breakTile(state, tile, creditFor(state, tile), tile.stressCause || "crumble");
        } else if (tile.life >= 0) {
          tile.age++;
          tile.life--;
          if (tile.life <= 0) {
            tile.state = "gone";
            removeTemp = true;
            addEvent(state, { type: "tileVanish", kind: tile.kind, x: tile.x + tile.w / 2, y: tile.y, w: tile.w });
          }
        }
        tile.load = 0;
        break;
      }
      case "falling": {
        tile.fallVy += 0.5;
        tile.fallY += tile.fallVy;
        tile.timer++;
        if (tile.timer >= CRUMBLE.fallTicks) {
          tile.state = "gone";
          if (tile.life >= 0) removeTemp = true;
          const base = tile.kind === "crumble" ? CRUMBLE.respawnTicks : STURDY.respawnTicks;
          tile.timer = Math.round(base * respawnMult);
        }
        break;
      }
      case "gone": {
        if (tile.life >= 0) {
          removeTemp = true;
          break;
        }
        if (state.collapse) break; // nothing comes back once the stage collapses
        tile.timer--;
        if (tile.timer <= 0) {
          tile.state = "respawning";
          tile.timer = CRUMBLE.reappearTicks;
        }
        break;
      }
      case "respawning": {
        tile.timer--;
        if (tile.timer <= 0) {
          tile.state = "solid";
          tile.stress = 0;
          tile.shaking = false;
          tile.hp = tile.maxHp;
          tile.fallY = 0;
          tile.stressBy = -1;
          addEvent(state, { type: "tileBack", x: tile.x + tile.w / 2, y: tile.y });
        }
        break;
      }
    }
  }
  if (removeTemp) {
    state.tiles = state.tiles.filter((t) => t.life < 0 || t.state === "solid" || t.state === "falling");
  }
}
