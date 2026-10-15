// Player-to-player contact. Bodies pass through each other side to side;
// only vertical contact matters. Landing on someone (a stomp) or jumping up
// into their feet (a bump) pops the upper body up and pushes the lower one
// down; a gentle landing lets you ride on their head.

import { CONTACT, CRUMBLE } from "./constants.js";
import { addEvent, blame } from "./common.js";
import { getTile } from "./tiles.js";

export function resolveContacts(state) {
  const ps = state.players;
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i];
      const b = ps[j];
      if (a.status !== "play" || b.status !== "play") continue;
      if (a.invuln > 0 || b.invuln > 0 || a.noContact > 0 || b.noContact > 0) continue;
      contactPair(state, a, b);
    }
  }
}

function pairKey(a, b) {
  return a.seat * 4 + b.seat;
}

function contactPair(state, a, b) {
  // Horizontal overlap (with a small margin so grazing edges do not count).
  if (a.x + a.w <= b.x + 2 || a.x >= b.x + b.w - 2) return;
  // Previous positions decide who is above: vertical contact only.
  const aPrevBottom = a.y + a.h - a.vy;
  const bPrevBottom = b.y + b.h - b.vy;
  const aPrevTop = a.y - a.vy;
  const bPrevTop = b.y - b.vy;
  let upper;
  let lower;
  if (aPrevBottom <= bPrevTop + CONTACT.sideSlop && a.y + a.h >= b.y - 0.5) {
    upper = a;
    lower = b;
  } else if (bPrevBottom <= aPrevTop + CONTACT.sideSlop && b.y + b.h >= a.y - 0.5) {
    upper = b;
    lower = a;
  } else {
    return; // side by side, or no contact: pass through
  }
  if (upper.y + upper.h < lower.y - 0.5) return;

  const closing = upper.vy - lower.vy;
  const key = pairKey(upper, lower);
  const cooling = state.contactCooldown[key] > state.tick;

  if (closing >= CONTACT.stompSpeed && !cooling) {
    // A stomp (upper falling onto lower) or a bump (lower jumping into upper):
    // the same exchange of vertical speed either way.
    const upperVy = upper.vy;
    const bounce = Math.min(CONTACT.bounceMax, CONTACT.bounceBase + CONTACT.bounceScale * closing);
    upper.y = lower.y - upper.h;
    upper.vy = lower.vy - bounce;
    upper.ground = null;
    upper.jumpsLeft = 1;
    upper.jumpHeld = false;
    upper.drill = 0;
    if (lower.ground) {
      // Grounded: driven into the floor, slowed for a moment.
      lower.slow = CONTACT.slowTicks;
      if (lower.ground.kind === "tile") {
        for (const id of lower.supportTiles) {
          const t = getTile(state, id);
          if (t && t.kind === "crumble") {
            t.stress = Math.min(1, t.stress + CRUMBLE.stompStress);
            t.stressBy = upper.seat;
            t.stressAt = state.tick;
          }
        }
      }
    } else {
      lower.vy = Math.max(lower.vy, upperVy * CONTACT.pushShare);
      lower.jumpHeld = false;
    }
    const stomp = upperVy > 0;
    if (stomp) upper.stats.stomps++;
    blame(state, lower, upper.seat, stomp ? "stomp" : "bump");
    blame(state, upper, lower.seat, stomp ? "stomp" : "bump");
    state.contactCooldown[key] = state.tick + CONTACT.pairCooldown;
    addEvent(state, {
      type: stomp ? "stomp" : "bump",
      upper: upper.seat,
      lower: lower.seat,
      x: lower.x + lower.w / 2,
      y: lower.y,
    });
  } else if (closing > -0.5) {
    // Gentle: the upper body rides on the lower one's head.
    upper.y = lower.y - upper.h;
    upper.vy = lower.vy;
    if (!upper.ground) {
      upper.ground = { kind: "player", id: lower.seat };
      upper.groundTop = lower.y;
      upper.supportTiles.length = 0;
      upper.jumpsLeft = 1;
    }
  }
}
