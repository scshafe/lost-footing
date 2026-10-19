// Drawing a match on a Canvas 2D: the stage, players, placeables, hazards,
// particles and the HUD. Presentation only: it reads the simulation state and
// its events and never changes them.

import { stageById } from "../src/stages.js";
import { CHARACTERS, lobVelocity, lobOrigin } from "../src/characters.js";
import { predictLob, OBJ } from "../src/objects.js";
import { CRUMBLE, MATCH, WORLD } from "../src/constants.js";
import { shortLabel } from "./keys.js";

export const VIEW = { w: 1600, h: 980 }; // the world (900 tall) plus a HUD strip
export const SEAT_COLORS = ["#ff5a5f", "#4aa8ff", "#4fdc7b", "#ffc23d"];
export const SEAT_DARK = ["#9e2328", "#1d5d9e", "#1f8a45", "#a3740f"];
export const SEAT_NAMES = ["P1", "P2", "P3", "P4"];
export const TEAM_TINTS = ["#ff7be5", "#7be5ff"];
export const TEAM_LETTERS = ["A", "B"];
const COAT_COLORS = { glue: "#e4f05a", oil: "#3a2b5c", acid: "#7dff4f", thorn: "#4a9a3a" };
const CAUSE_TEXT = {
  fall: "fell",
  side: "flew off",
  top: "flew too high",
  tide: "was swept out by the tide",
  crumble: "crumble",
};

const rnd = (a, b) => a + Math.random() * (b - a);

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.particles = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = "#fff";
    this.banners = [];
    this.feed = [];
    this.frame = 0;
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this.stars = Array.from({ length: 90 }, () => ({ x: Math.random() * 1600, y: Math.random() * 700, r: Math.random() * 1.6 + 0.3, t: Math.random() * 6 }));
    this.resize();
  }

  // Colours and names follow the physical seat (slot), not the player index.
  setSlots(state) {
    this.slots = state.players.map((p) => (p.slot ?? p.seat));
  }

  col(seat) {
    return seat >= 0 && this.slots ? SEAT_COLORS[this.slots[seat]] || "#fff" : "#fff";
  }

  dark(seat) {
    return SEAT_DARK[this.slots ? this.slots[seat] : seat] || "#444";
  }

  name(seat) {
    return SEAT_NAMES[this.slots ? this.slots[seat] : seat] || "?";
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.scale = Math.min((w * dpr) / VIEW.w, (h * dpr) / VIEW.h);
    this.ox = (w * dpr - VIEW.w * this.scale) / 2;
    this.oy = (h * dpr - VIEW.h * this.scale) / 2;
  }

  reset() {
    this.particles = [];
    this.banners = [];
    this.feed = [];
    this.shake = 0;
    this.flash = 0;
  }

  // ---- Events to effects -------------------------------------------------

  handleEvents(events, state) {
    this.setSlots(state);
    const theme = stageById(state.stageId).theme;
    for (const e of events) {
      switch (e.type) {
        case "land":
          if (e.hard) this.dust(e.x, e.y, 8, "#ffffffaa");
          break;
        case "jump":
          this.dust(e.x, e.y, 3, "#ffffff66");
          break;
        case "airJump":
          this.ring(e.x, e.y, this.col(e.seat), 18, 12);
          break;
        case "tileShake":
          this.dust(e.x, e.y + 16, 3, theme.tileEdge);
          break;
        case "tileBreak":
          this.debris(e.x, e.y + 8, e.kind === "sturdy" ? 22 : 8, e.kind === "sturdy" ? theme.slab : theme.tile, e.w || 48);
          if (e.kind === "sturdy") this.addShake(8);
          break;
        case "slabHit":
          this.debris(e.x, e.y + 6, 5, theme.slab, 60);
          break;
        case "splat":
          this.splat(e.x, e.y, COAT_COLORS[e.coat] || "#fff");
          break;
        case "spring":
          this.ring(e.x, e.y, "#ffe27a", 30, 14);
          break;
        case "bumper":
          this.ring(e.x, e.y, this.col(e.owner) || "#fff", 46, 14);
          break;
        case "explode":
          this.ring(e.x, e.y, "#ffb347", e.r, 22);
          this.ring(e.x, e.y, "#fff3", e.r * 0.6, 14);
          this.debris(e.x, e.y, 26, "#ff8a3d", 80);
          this.addShake(16);
          this.doFlash("#ffd9a0", 0.35);
          break;
        case "drillHit":
          this.debris(e.x, e.y, 14, theme.tile, 50);
          this.addShake(7);
          break;
        case "anvilHit":
          this.debris(e.x, e.y, 10, theme.tile, 40);
          this.addShake(5);
          break;
        case "cut":
          this.sparks(e.x, e.y, 4);
          break;
        case "stomp":
        case "bump":
          this.ring(e.x, e.y, "#ffffff", 26, 10);
          this.sparks(e.x, e.y, 6);
          break;
        case "cometHit":
        case "rockHit":
          this.ring(e.x, e.y, "#ffcf6e", 40, 14);
          this.addShake(6);
          break;
        case "rockSmash":
          this.debris(e.x, e.y, 16, "#8a7560", 50);
          this.addShake(7);
          break;
        case "reflect":
          this.ring(e.x, e.y, "#ffffff", 34, 12);
          this.sparks(e.x, e.y, 8);
          break;
        case "polarity":
          this.ring(e.x, e.y, "#ff7a5a", e.r, 22);
          this.ring(e.x, e.y, "#ffffff", e.r * 0.5, 14);
          this.addShake(5);
          break;
        case "grow":
          this.sparks(e.x, e.y, 3);
          this.dust(e.x, e.y + 4, 3, "#49b04a88");
          break;
        case "rootBurst":
          this.debris(e.x, e.y, 16, theme.tile, e.r);
          this.ring(e.x, e.y - 6, "#6bb046", e.r, 18);
          this.addShake(8);
          break;
        case "fooled":
          this.ring(e.x, e.y, this.col(e.owner) || "#fff", 34, 14);
          this.dust(e.x, e.y, 5, (this.col(e.owner) || "#fff") + "99");
          break;
        case "hollow":
          this.dust(e.x, e.y + 8, 4, (this.col(state.tiles.find((t) => t.id === e.id)?.hollowBy) || "#fff") + "99");
          break;
        case "rubOut":
          this.debris((e.x0 + e.x1) / 2, e.y + 8, 14, theme.tile, e.x1 - e.x0);
          this.addShake(4);
          break;
        case "cast":
          this.ring(e.x, e.y + 10, this.col(e.seat) + "aa", 20, 10);
          break;
        case "ko":
          this.koBurst(e);
          this.addShake(18);
          this.doFlash(this.col(e.seat), 0.25);
          this.pushFeed(e, state);
          break;
        case "respawn":
          this.ring(e.x, e.y, "#ffffff", 50, 20);
          break;
        case "count":
          this.banner(String(e.n), "#ffffff", 50, 150);
          break;
        case "go":
          this.banner("GO!", "#ffe27a", 70, 170, "Keep moving: still feet crumble the floor");
          break;
        case "overtime":
          this.banner("OVERTIME", "#ff9f43", 90, 90, "Platforms come back slower; hazards come faster");
          break;
        case "collapse":
          this.banner("COLLAPSE", "#ff4d4d", 110, 90, "Nothing comes back now");
          break;
        case "warn":
          if (e.hazard === "tide") this.banner("TIDE INCOMING", "#59d0ff", 90, 60);
          if (e.hazard === "gale") this.banner(e.dir > 0 ? "GALE  →" : "←  GALE", "#cfe9ff", 80, 60);
          if (e.hazard === "belts") this.banner("BELTS REVERSING", "#ffb347", 80, 60);
          break;
      }
    }
  }

  addShake(n) {
    this.shake = Math.min(24, Math.max(this.shake, n));
  }

  doFlash(color, a) {
    this.flashColor = color;
    this.flash = Math.max(this.flash, a);
  }

  banner(text, color, life, size, sub = "") {
    this.banners = this.banners.filter((b) => b.size !== size || b.text === text);
    this.banners.push({ text, color, life, max: life, size, sub });
  }

  pushFeed(e, state) {
    const victim = this.name(e.seat);
    let text;
    if (e.by >= 0) text = [[this.name(e.by), this.col(e.by)], [` ${e.cause} ▸ `, "#ddd"], [victim, this.col(e.seat)]];
    else text = [[victim, this.col(e.seat)], [" " + (CAUSE_TEXT[e.cause] || "fell"), "#ddd"]];
    this.feed.push({ text, life: 300 });
    if (this.feed.length > 5) this.feed.shift();
  }

  dust(x, y, n, color) {
    for (let i = 0; i < n; i++) this.particles.push({ x: x + rnd(-10, 10), y, vx: rnd(-1.5, 1.5), vy: rnd(-1.6, -0.2), g: 0.02, life: 26, max: 26, color, size: rnd(2, 5), kind: "dot" });
  }

  debris(x, y, n, color, spread) {
    for (let i = 0; i < n; i++)
      this.particles.push({ x: x + rnd(-spread / 2, spread / 2), y: y + rnd(-6, 6), vx: rnd(-3, 3), vy: rnd(-5, 0), g: 0.35, life: 50, max: 50, color, size: rnd(3, 8), kind: "chunk", rot: rnd(0, 6), vr: rnd(-0.3, 0.3) });
  }

  sparks(x, y, n) {
    for (let i = 0; i < n; i++) this.particles.push({ x, y, vx: rnd(-5, 5), vy: rnd(-5, 2), g: 0.2, life: 18, max: 18, color: "#fff2b0", size: 2, kind: "dot" });
  }

  splat(x, y, color) {
    for (let i = 0; i < 12; i++) this.particles.push({ x, y: y - 4, vx: rnd(-3.5, 3.5), vy: rnd(-4, -1), g: 0.3, life: 30, max: 30, color, size: rnd(3, 6), kind: "dot" });
  }

  ring(x, y, color, r, life) {
    this.particles.push({ x, y, life, max: life, color, size: r, kind: "ring", vx: 0, vy: 0, g: 0 });
  }

  koBurst(e) {
    const c = this.col(e.seat);
    // A beam from the blast-zone edge where they went out.
    this.particles.push({ x: e.x, y: e.y, life: 45, max: 45, color: c, size: 0, kind: "beam", vx: 0, vy: 0, g: 0, dir: e.cause === "top" ? "up" : e.x <= 2 ? "left" : e.x >= 1598 ? "right" : "down" });
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const sp = rnd(4, 11);
      this.particles.push({ x: e.x, y: Math.min(e.y, 890), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0.05, life: 50, max: 50, color: i % 3 ? c : "#fff", size: rnd(3, 7), kind: "dot" });
    }
    this.ring(e.x, Math.min(e.y, 890), c, 120, 30);
  }

  // ---- Frame ------------------------------------------------------------

  draw(state, opts = {}) {
    const { ctx } = this;
    this.setSlots(state);
    this.frame++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#06060c";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    let sx = 0;
    let sy = 0;
    if (this.shake > 0.3 && !opts.calm) {
      sx = rnd(-this.shake, this.shake);
      sy = rnd(-this.shake, this.shake);
      this.shake *= 0.86;
    } else this.shake = 0;
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox + sx * this.scale, this.oy + sy * this.scale);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, VIEW.w, VIEW.h);
    ctx.clip();

    const stage = stageById(state.stageId);
    const theme = stage.theme;
    this.drawBackground(state, stage, theme);
    this.drawHazardsBack(state, theme);
    this.drawTiles(state, theme);
    this.drawObjects(state, theme);
    this.drawPlayers(state);
    this.drawHazardsFront(state, theme);
    this.updateParticles();
    this.drawTide(state, theme);
    if (!opts.noHud) {
      this.drawHud(state);
      this.drawOffscreen(state);
      this.drawFeed();
      this.drawBanners();
    }
    if (opts.dim) {
      ctx.fillStyle = `rgba(6,6,14,${opts.dim})`;
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    }
    if (this.flash > 0.01) {
      ctx.globalAlpha = this.flash;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, VIEW.w, VIEW.h);
      ctx.globalAlpha = 1;
      this.flash *= 0.85;
    }
    ctx.restore();
  }

  drawBackground(state, stage, theme) {
    const { ctx } = this;
    const g = ctx.createLinearGradient(0, 0, 0, 900);
    g.addColorStop(0, theme.skyTop);
    g.addColorStop(1, theme.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
    // Stars twinkle.
    for (const s of this.stars) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(this.frame * 0.03 + s.t);
      ctx.fillStyle = "#fff";
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;
    // Distant silhouettes, per stage.
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.beginPath();
    ctx.moveTo(0, 900);
    const seed = stage.id.length * 37;
    for (let x = 0; x <= 1600; x += 80) {
      const h = 120 + 80 * Math.sin(x * 0.006 + seed) + 40 * Math.sin(x * 0.017 + seed * 2);
      ctx.lineTo(x, 900 - h - 200);
    }
    ctx.lineTo(1600, 900);
    ctx.fill();
    // The pit: darkness rising from below, with a faint danger glow.
    const pit = ctx.createLinearGradient(0, 760, 0, 980);
    pit.addColorStop(0, "rgba(0,0,0,0)");
    pit.addColorStop(0.6, "rgba(0,0,0,0.65)");
    pit.addColorStop(1, "rgba(0,0,0,0.95)");
    ctx.fillStyle = pit;
    ctx.fillRect(0, 760, VIEW.w, 220);
    ctx.fillStyle = theme.hazard;
    ctx.globalAlpha = 0.07 + 0.03 * Math.sin(this.frame * 0.05);
    ctx.fillRect(0, 880, VIEW.w, 20);
    ctx.globalAlpha = 1;
  }

  drawTiles(state, theme) {
    const { ctx } = this;
    for (const t of state.tiles) {
      if (t.state === "gone") continue;
      if (t.state === "respawning") {
        const blink = Math.floor(t.timer / 5) % 2 === 0;
        ctx.globalAlpha = blink ? 0.5 : 0.2;
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = t.kind === "sturdy" ? theme.slab : theme.tile;
        ctx.lineWidth = 2;
        ctx.strokeRect(t.x + 2, t.y + 1, t.w - 4, t.h - 2);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        continue;
      }
      let x = t.x;
      let y = t.y;
      let rot = 0;
      let alpha = 1;
      if (t.state === "falling") {
        y += t.fallY;
        rot = (t.timer / 40) * (t.id % 2 ? 0.5 : -0.5);
        alpha = Math.max(0, 1 - t.timer / CRUMBLE.fallTicks);
      } else if (t.kind === "crumble" && t.stress >= CRUMBLE.shakeAt) {
        const amp = 1 + (t.stress - CRUMBLE.shakeAt) * 9;
        x += Math.sin(this.frame * 1.7 + t.id * 3.1) * amp;
        y += Math.cos(this.frame * 2.3 + t.id) * amp * 0.4;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x + t.w / 2, y + t.h / 2);
      ctx.rotate(rot);
      if (t.kind === "crumble") {
        this.drawCrumble(t, theme);
        if (t.hollowArm > 0 || t.hollow > 0) this.drawShimmer(t);
      } else if (t.kind === "decoy") this.drawDecoy(t, theme);
      else if (t.kind === "sturdy") this.drawSlab(t, theme);
      else if (t.kind === "ledge") this.drawLedge(t);
      else if (t.kind === "leaf") this.drawLeaf(t);
      else if (t.kind === "halo") this.drawHalo(t);
      ctx.restore();
    }
  }

  drawCrumble(t, theme) {
    const { ctx } = this;
    const w = t.w;
    const h = t.h;
    const s = t.stress;
    // Colour heats toward red as stress builds.
    ctx.fillStyle = theme.tile;
    ctx.fillRect(-w / 2 + 1, -h / 2, w - 2, h);
    if (s > 0.05) {
      ctx.fillStyle = `rgba(255,60,40,${Math.min(0.6, s * 0.65)})`;
      ctx.fillRect(-w / 2 + 1, -h / 2, w - 2, h);
    }
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(-w / 2 + 1, -h / 2, w - 2, 3);
    ctx.fillStyle = theme.tileEdge;
    ctx.fillRect(-w / 2 + 1, h / 2 - 4, w - 2, 4);
    // Brick seams.
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 1, 0);
    ctx.lineTo(w / 2 - 1, 0);
    ctx.moveTo(-6, -h / 2);
    ctx.lineTo(-6, 0);
    ctx.moveTo(10, 0);
    ctx.lineTo(10, h / 2);
    ctx.stroke();
    if (t.beltDir) this.drawBelt(t, w, h);
    if (s >= CRUMBLE.doomAt || t.state === "falling") {
      ctx.strokeStyle = "rgba(20,0,0,0.8)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, -h / 2);
      ctx.lineTo(-4, -1);
      ctx.lineTo(-10, h / 2);
      ctx.moveTo(4, -h / 2);
      ctx.lineTo(12, 2);
      ctx.lineTo(8, h / 2);
      ctx.stroke();
    }
  }

  // Conveyor chevrons slide the way the belt runs; orange and still while it is stopped.
  drawBelt(t, w, h) {
    const { ctx } = this;
    const running = t.belt !== 0;
    const dir = running ? Math.sign(t.belt) : t.beltDir;
    const off = running ? ((this.frame * Math.abs(t.belt) * 0.6) % 12) * dir : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2 + 1, -h / 2, w - 2, h);
    ctx.clip();
    ctx.strokeStyle = running ? "rgba(255,255,255,0.5)" : "rgba(255,160,60,0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = -w / 2 - 12 + off; x < w / 2 + 12; x += 12) {
      ctx.moveTo(x - 3 * dir, -h / 2 + 4);
      ctx.lineTo(x + 3 * dir, 0);
      ctx.lineTo(x - 3 * dir, h / 2 - 4);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawSlab(t, theme) {
    const { ctx } = this;
    const w = t.w;
    const h = t.h;
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, "#e4e8f0");
    g.addColorStop(0.25, theme.slab);
    g.addColorStop(1, "#3a3f4a");
    ctx.fillStyle = g;
    roundRect(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (let x = -w / 2 + 10; x < w / 2 - 4; x += 30) {
      ctx.beginPath();
      ctx.arc(x, 0, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Damage cracks.
    const dmg = t.maxHp - t.hp;
    if (dmg > 0) {
      ctx.strokeStyle = "rgba(20,10,10,0.85)";
      ctx.lineWidth = 2;
      for (let i = 0; i < dmg; i++) {
        const cx = -w / 2 + ((i * 53 + 17) % (w - 20)) + 10;
        ctx.beginPath();
        ctx.moveTo(cx, -h / 2);
        ctx.lineTo(cx + 6, -2);
        ctx.lineTo(cx - 3, 3);
        ctx.lineTo(cx + 4, h / 2);
        ctx.stroke();
      }
    }
    // HP pips.
    for (let i = 0; i < t.maxHp; i++) {
      ctx.fillStyle = i < t.hp ? "#8dff9a" : "#55303a";
      ctx.fillRect(-w / 2 + 6 + i * 7, h / 2 + 3, 5, 3);
    }
  }

  // A decoy looks like any crumble tile; only a faint wash of its painter's colour gives it away.
  drawDecoy(t, theme) {
    const { ctx } = this;
    if (t.life < 60 && Math.floor(t.life / 5) % 2 === 0) ctx.globalAlpha *= 0.55;
    this.drawCrumble(t, theme);
    this.drawShimmer(t, 0.5);
  }

  // The tell on forged floor: a slow pulse of the painter's colour along the tile.
  drawShimmer(t, strength = 1) {
    const { ctx } = this;
    const c = this.col(t.kind === "decoy" ? t.owner : t.hollowBy) || "#fff";
    const arming = t.hollowArm > 0;
    const pulse = 0.5 + 0.5 * Math.sin(this.frame * (arming ? 0.5 : 0.12) + t.id);
    ctx.save();
    ctx.globalAlpha *= (arming ? 0.45 + 0.4 * pulse : 0.14 + 0.2 * pulse) * strength;
    ctx.fillStyle = c;
    ctx.fillRect(-t.w / 2 + 1, -t.h / 2, t.w - 2, t.h);
    ctx.restore();
  }

  drawLeaf(t) {
    const { ctx } = this;
    const wilt = t.life < 60 ? t.life / 60 : 1;
    ctx.globalAlpha *= 0.5 + 0.5 * wilt;
    ctx.fillStyle = wilt < 1 ? "#a9a24a" : "#49b04a";
    ctx.beginPath();
    ctx.ellipse(0, 0, t.w / 2, t.h / 2 + 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1f6b2a";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-t.w / 2 + 6, 0);
    ctx.lineTo(t.w / 2 - 6, 0);
    ctx.stroke();
    ctx.fillStyle = this.col(t.owner) || "#fff";
    ctx.fillRect(-2, -t.h / 2, 4, 3);
  }

  drawLedge(t) {
    const { ctx } = this;
    const c = this.col(t.owner) || "#ccc";
    ctx.fillStyle = "#9c8f80";
    roundRect(ctx, -t.w / 2, -t.h / 2, t.w, t.h, 3);
    ctx.fill();
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.stroke();
    const frac = Math.max(0, t.life / 240);
    ctx.fillStyle = c;
    ctx.fillRect(-t.w / 2 + 4, t.h / 2 - 4, (t.w - 8) * frac, 2);
  }

  drawHalo(t) {
    const { ctx } = this;
    const c = this.col(t.owner) || "#fff";
    ctx.shadowColor = c;
    ctx.shadowBlur = 16;
    ctx.fillStyle = c + "88";
    roundRect(ctx, -t.w / 2, -t.h / 2, t.w, t.h, t.h / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffffffcc";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawObjects(state) {
    const { ctx } = this;
    for (const o of state.objects) {
      const c = this.col(o.owner);
      switch (o.type) {
        case "wall": {
          const fade = o.life < 60 && Math.floor(o.life / 6) % 2 === 0 ? 0.5 : 1;
          ctx.globalAlpha = fade;
          ctx.fillStyle = "#8b8078";
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = "rgba(0,0,0,0.25)";
          for (let y = o.y + 15; y < o.y + o.h; y += 15) ctx.fillRect(o.x, y, o.w, 2);
          ctx.fillStyle = c;
          ctx.fillRect(o.x, o.y, o.w, 5);
          ctx.strokeStyle = "rgba(0,0,0,0.6)";
          ctx.lineWidth = 2;
          ctx.strokeRect(o.x, o.y, o.w, o.h);
          ctx.globalAlpha = 1;
          break;
        }
        case "coat":
          this.drawCoat(o);
          break;
        case "spring": {
          ctx.globalAlpha = o.armed > 0 ? 0.45 : 1;
          const cx = o.x + o.w / 2;
          const base = o.y + o.h;
          ctx.strokeStyle = "#ddd";
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let i = 0; i <= 4; i++) {
            const yy = base - (i * o.h) / 4;
            ctx.lineTo(cx + (i % 2 ? 9 : -9), yy);
          }
          ctx.stroke();
          ctx.save();
          ctx.translate(cx, o.y);
          ctx.rotate(o.angle * 0.45);
          ctx.fillStyle = c;
          roundRect(ctx, -o.w / 2, -4, o.w, 7, 3);
          ctx.fill();
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.moveTo(0, -14);
          ctx.lineTo(-5, -7);
          ctx.lineTo(5, -7);
          ctx.fill();
          ctx.restore();
          for (let i = 0; i < o.uses; i++) {
            ctx.fillStyle = c;
            ctx.fillRect(o.x + 4 + i * 7, base + 2, 4, 3);
          }
          ctx.globalAlpha = 1;
          break;
        }
        case "bumper": {
          const pulse = 1 + 0.06 * Math.sin(this.frame * 0.3);
          if (o.armed > 0) {
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = c;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(o.x, o.y, o.r * (1 - o.armed / 40), 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 0.35;
          }
          const g = ctx.createRadialGradient(o.x - 6, o.y - 6, 2, o.x, o.y, o.r);
          g.addColorStop(0, "#fff");
          g.addColorStop(0.35, c);
          g.addColorStop(1, "#222");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "#000a";
          ctx.font = "bold 12px system-ui, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(o.uses), o.x, o.y + 1);
          ctx.globalAlpha = 1;
          break;
        }
        case "lob": {
          const col = o.payload === "charge" ? "#ff4d4d" : COAT_COLORS[o.payload] || "#fff";
          ctx.fillStyle = col;
          ctx.strokeStyle = c;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          if (this.frame % 2 === 0) this.particles.push({ x: o.x, y: o.y, vx: 0, vy: 0, g: 0, life: 10, max: 10, color: col + "88", size: 3, kind: "dot" });
          break;
        }
        case "charge": {
          const cx = o.x + o.w / 2;
          const cy = o.y + o.h / 2;
          const blink = o.fuse < 40 ? Math.floor(o.fuse / 4) % 2 : Math.floor(o.fuse / 10) % 2;
          ctx.strokeStyle = `rgba(255,80,60,${blink ? 0.7 : 0.25})`;
          ctx.setLineDash([8, 6]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 115, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#2b2b2b";
          ctx.beginPath();
          ctx.arc(cx, cy, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = blink ? "#ff3b30" : "#661010";
          ctx.beginPath();
          ctx.arc(cx, cy - 3, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = c;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, 10, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }
        case "magnet": {
          const push = o.mode === "push";
          const col = push ? "#ff7a5a" : "#6ab0ff";
          const R = OBJ.magnet.pull;
          ctx.globalAlpha = o.armed > 0 ? 0.4 : o.life < 60 && Math.floor(o.life / 5) % 2 === 0 ? 0.5 : 1;
          // Field rings drift in (pull) or out (push).
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.5;
          for (let k = 0; k < 3; k++) {
            const t = ((this.frame * 1.6 + (k * R) / 3) % R) / R;
            ctx.save();
            ctx.globalAlpha = (o.armed > 0 ? 0.1 : 0.28) * (1 - t);
            ctx.beginPath();
            ctx.arc(o.x, o.y, R * (push ? t : 1 - t), 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          // The horseshoe, open at the top.
          ctx.lineWidth = 7;
          ctx.lineCap = "round";
          ctx.strokeStyle = "#cfd3da";
          ctx.beginPath();
          ctx.arc(o.x, o.y + 2, o.r * 0.75, 0, Math.PI);
          ctx.stroke();
          ctx.strokeStyle = push ? "#ff7a5a" : "#ff5a5f";
          ctx.beginPath();
          ctx.moveTo(o.x - o.r * 0.75, o.y + 2);
          ctx.lineTo(o.x - o.r * 0.75, o.y - 9);
          ctx.stroke();
          ctx.strokeStyle = push ? "#ff5a5f" : "#4aa8ff";
          ctx.beginPath();
          ctx.moveTo(o.x + o.r * 0.75, o.y + 2);
          ctx.lineTo(o.x + o.r * 0.75, o.y - 9);
          ctx.stroke();
          ctx.lineCap = "butt";
          ctx.strokeStyle = c;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(o.x, o.y, o.r + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case "anvil": {
          if (o.ingot) {
            ctx.fillStyle = "#c9ced6";
            roundRect(ctx, o.x, o.y + 6, o.w, o.h - 12, 3);
            ctx.fill();
            ctx.strokeStyle = c;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.fillRect(o.x + 3, o.y + 8, o.w - 6, 2);
            break;
          }
          ctx.fillStyle = "#3d4048";
          ctx.beginPath();
          ctx.moveTo(o.x, o.y);
          ctx.lineTo(o.x + o.w, o.y);
          ctx.lineTo(o.x + o.w - 6, o.y + 9);
          ctx.lineTo(o.x + o.w - 9, o.y + o.h);
          ctx.lineTo(o.x + 9, o.y + o.h);
          ctx.lineTo(o.x + 6, o.y + 9);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = c;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = "#9aa0aa";
          ctx.fillRect(o.x + 2, o.y + 1, o.w - 4, 3);
          break;
        }
        case "vine": {
          // The seed, then a shoot bending toward where the next leaf will come.
          const k = o.step === 0 ? 1 - o.fuse / OBJ.vine.delay : 1;
          ctx.fillStyle = "#6b4a2b";
          ctx.beginPath();
          ctx.ellipse(o.x, o.top - 3, 6, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#49b04a";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(o.x, o.top - 4);
          ctx.quadraticCurveTo(o.x + o.dir * 6, o.top - 16 * k - 8, o.x, o.top - 14 - 40 * k);
          ctx.stroke();
          ctx.fillStyle = c;
          ctx.fillRect(o.x - 3, o.top - 2, 6, 2);
          break;
        }
        case "roots": {
          const k = 1 - o.fuse / OBJ.roots.fuse;
          const r = OBJ.roots.r;
          ctx.strokeStyle = `rgba(110,180,70,${0.35 + 0.4 * k})`;
          ctx.setLineDash([8, 6]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(o.x, o.top - 6, r * (0.55 + 0.45 * k), 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#6b4a2b";
          ctx.beginPath();
          ctx.ellipse(o.x, o.top - 3, 5 + 6 * k, 3 + 3 * k, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#8a5f33";
          ctx.lineWidth = 3;
          for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(o.x, o.top - 3);
            ctx.lineTo(o.x + i * 14 * k, o.top + 6 + 4 * k);
            ctx.stroke();
          }
          ctx.fillStyle = c;
          ctx.fillRect(o.x - 3, o.top - 2, 6, 2);
          break;
        }
        case "rub": {
          const k = 1 - o.fuse / OBJ.rub.delay;
          const w = o.x1 - o.x0;
          ctx.fillStyle = c;
          ctx.globalAlpha = 0.12 + 0.3 * k;
          ctx.fillRect(o.x0, o.y - 6, w * k, 26);
          ctx.globalAlpha = 0.7;
          ctx.setLineDash([10, 6]);
          ctx.strokeStyle = c;
          ctx.lineWidth = 2;
          ctx.strokeRect(o.x0, o.y - 6, w, 26);
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          ctx.fillRect(o.x0 + w * k - 3, o.y - 10, 6, 34);
          break;
        }
        case "gust": {
          const x0 = o.x;
          const x1 = o.x + o.dir * o.len;
          ctx.fillStyle = "rgba(200,230,255,0.06)";
          ctx.fillRect(Math.min(x0, x1), o.y - o.hh, o.len, o.hh * 2);
          if (o.armed === 0 && this.frame % 2 === 0) {
            this.particles.push({ x: o.x + o.dir * 10, y: o.y + rnd(-o.hh, o.hh), vx: o.dir * rnd(7, 10), vy: 0, g: 0, life: Math.round(o.len / 9), max: Math.round(o.len / 9), color: "#e6f4ffaa", size: rnd(10, 22), kind: "streak" });
          }
          // The fan.
          ctx.save();
          ctx.translate(o.x, o.y);
          ctx.fillStyle = "#555c66";
          ctx.fillRect(-6 * o.dir - 3, -16, 6, 32);
          ctx.rotate(this.frame * (o.armed > 0 ? 0.1 : 0.6));
          ctx.fillStyle = c;
          for (let i = 0; i < 3; i++) {
            ctx.rotate((Math.PI * 2) / 3);
            ctx.beginPath();
            ctx.ellipse(0, -9, 4, 9, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          break;
        }
        case "saw": {
          ctx.save();
          ctx.translate(o.x, o.y);
          ctx.rotate(this.frame * 0.5 * o.dir);
          ctx.fillStyle = "#d8dde6";
          ctx.beginPath();
          for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const r = i % 2 ? o.r : o.r - 5;
            ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.arc(0, 0, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          if (o.onTop !== null && this.frame % 3 === 0) this.sparks(o.x - o.dir * 8, o.y + o.r, 1);
          break;
        }
      }
    }
  }

  drawCoat(o) {
    const { ctx } = this;
    const c = this.col(o.owner);
    const w = o.x1 - o.x0;
    const fade = o.life < 60 ? o.life / 60 : 1;
    ctx.globalAlpha = 0.9 * fade;
    if (o.coat === "glue") {
      ctx.fillStyle = COAT_COLORS.glue;
      roundRect(ctx, o.x0, o.y - 5, w, 9, 4);
      ctx.fill();
      for (let x = o.x0 + 8; x < o.x1 - 4; x += 14) {
        ctx.beginPath();
        ctx.ellipse(x, o.y + 6, 3, 4 + ((x * 7) % 5), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (o.coat === "oil") {
      const g = ctx.createLinearGradient(o.x0, 0, o.x1, 0);
      g.addColorStop(0, "#2a1f45");
      g.addColorStop(0.3, "#5b3f8f");
      g.addColorStop(0.5, "#2f6f7f");
      g.addColorStop(0.7, "#7c4f9a");
      g.addColorStop(1, "#2a1f45");
      ctx.fillStyle = g;
      roundRect(ctx, o.x0, o.y - 3, w, 5, 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(o.x0 + ((this.frame * 2) % Math.max(1, w - 10)), o.y - 3, 10, 1);
    } else if (o.coat === "thorn") {
      const grow = o.armed > 0 ? 1 - o.armed / OBJ.thorn.arm : 1;
      ctx.fillStyle = "#2f6b2a";
      ctx.fillRect(o.x0, o.y - 3, w, 3);
      ctx.strokeStyle = COAT_COLORS.thorn;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = o.x0 + 4; x < o.x1 - 2; x += 9) {
        const hgt = (8 + ((x * 7) % 6)) * grow;
        ctx.moveTo(x - 3, o.y - 2);
        ctx.lineTo(x, o.y - 2 - hgt);
        ctx.lineTo(x + 3, o.y - 2);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = COAT_COLORS.acid;
      roundRect(ctx, o.x0, o.y - 4, w, 7, 3);
      ctx.fill();
      if (this.frame % 3 === 0) this.particles.push({ x: o.x0 + Math.random() * w, y: o.y - 4, vx: 0, vy: -rnd(0.5, 1.5), g: -0.01, life: 25, max: 25, color: "#b6ff8f", size: rnd(2, 4), kind: "bubble" });
    }
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x0, o.y - 6);
    ctx.lineTo(o.x1, o.y - 6);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  drawPlayers(state) {
    for (const p of state.players) if (p.status === "play" && p.kind === "human") this.drawAim(p, state);
    for (const p of state.players) if (p.status === "play") this.drawPlayer(p, state);
  }

  // A faint arc and landing mark for a human's ready lobbed move.
  drawAim(p, state) {
    const lobSlots = { glim: [0, 1, 2], fuse: [1] }[p.character];
    if (!lobSlots || !lobSlots.some((k) => p.cd[k] === 0) || p.drill !== 0) return;
    const { ctx } = this;
    const v = lobVelocity(p, p.btn);
    const o = lobOrigin(p);
    const land = predictLob(state, o.x, o.y, v.vx, v.vy, 120);
    ctx.fillStyle = this.col(p.seat);
    ctx.globalAlpha = 0.35;
    let x = o.x;
    let y = o.y;
    let vx = v.vx;
    let vy = v.vy;
    for (let i = 0; i < 90; i++) {
      vy += 0.45;
      x += vx;
      y += vy;
      if (land && ((vx > 0 && x > land.x) || (vx < 0 && x < land.x))) break;
      if (i % 3 === 0) ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    if (land) {
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = this.col(p.seat);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(land.x - 6, land.y - 6);
      ctx.lineTo(land.x + 6, land.y + 6);
      ctx.moveTo(land.x + 6, land.y - 6);
      ctx.lineTo(land.x - 6, land.y + 6);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  drawPlayer(p, state) {
    const { ctx } = this;
    const c = this.col(p.seat);
    const dark = this.dark(p.seat);
    if (p.invuln > 0 && Math.floor(p.invuln / 5) % 2 === 0) ctx.globalAlpha = 0.45;
    const stretch = Math.max(-0.14, Math.min(0.18, -p.vy * 0.016));
    const squash = p.ground ? Math.max(0, (p.action > 0 ? 0.06 : 0)) : 0;
    const h = p.h * (1 + stretch - squash);
    const w = p.w * (1 - stretch * 0.6 + squash);
    const cx = p.x + p.w / 2;
    const by = p.y + p.h;
    ctx.save();
    ctx.translate(cx, by);
    if (p.drill === -1) ctx.rotate(Math.sin(this.frame * 0.9) * 0.15);
    // Body.
    ctx.fillStyle = c;
    roundRect(ctx, -w / 2, -h, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    roundRect(ctx, -w / 2 + 4, -h * 0.45, w - 8, h * 0.35, 5);
    ctx.fill();
    // Eyes look the way you face.
    const ey = -h + 13;
    const f = p.facing;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(f * 3 - 4, ey, 3.6, 4.5, 0, 0, Math.PI * 2);
    ctx.ellipse(f * 3 + 5, ey, 3.6, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(f * 4.5 - 4, ey + 0.5, 1.8, 0, Math.PI * 2);
    ctx.arc(f * 4.5 + 5, ey + 0.5, 1.8, 0, Math.PI * 2);
    ctx.fill();
    // Feet.
    ctx.fillStyle = dark;
    const step = p.ground && Math.abs(p.vx) > 1 ? Math.sin(this.frame * 0.5) * 3 : 0;
    ctx.fillRect(-w / 2 + 2 + step, -4, 9, 4);
    ctx.fillRect(w / 2 - 11 - step, -4, 9, 4);
    this.drawAccessory(p, w, h);
    if (p.surface === "glue") {
      ctx.fillStyle = COAT_COLORS.glue;
      ctx.fillRect(-w / 2 - 2, -6, w + 4, 6);
    }
    ctx.restore();
    // Stomped: stars circle the head.
    if (p.slow > 0) {
      for (let i = 0; i < 3; i++) {
        const a = this.frame * 0.2 + (i * Math.PI * 2) / 3;
        ctx.fillStyle = "#ffe27a";
        ctx.fillRect(cx + Math.cos(a) * 14 - 2, p.y - 6 + Math.sin(a) * 4 - 2, 4, 4);
      }
    }
    // Name tag.
    ctx.globalAlpha = 1;
    ctx.fillStyle = c;
    ctx.font = "bold 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(this.name(p.seat), cx, p.y - 16);
    if (p.team >= 0) {
      const half = ctx.measureText(this.name(p.seat)).width / 2;
      ctx.fillStyle = TEAM_TINTS[p.team];
      ctx.textAlign = "left";
      ctx.fillText(TEAM_LETTERS[p.team], cx + half + 4, p.y - 16);
      ctx.textAlign = "center";
      ctx.fillStyle = c;
    }
    ctx.beginPath();
    ctx.moveTo(cx - 4, p.y - 13);
    ctx.lineTo(cx + 4, p.y - 13);
    ctx.lineTo(cx, p.y - 9);
    ctx.fill();
    if (p.kind === "bot") {
      ctx.font = "10px system-ui, sans-serif";
      ctx.fillStyle = "#ffffff88";
      ctx.fillText("bot", cx, p.y - 30);
    }
  }

  drawAccessory(p, w, h) {
    const { ctx } = this;
    const top = -h;
    switch (p.character) {
      case "mason":
        ctx.fillStyle = "#ffcc33";
        ctx.beginPath();
        ctx.ellipse(0, top + 2, w / 2 - 1, 8, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(-w / 2 - 3, top + 1, w + 6, 3);
        ctx.strokeStyle = "#a07a10";
        ctx.lineWidth = 1;
        ctx.stroke();
        break;
      case "glim":
        ctx.fillStyle = "#6b3fa0";
        ctx.beginPath();
        ctx.moveTo(-w / 2 - 1, top + 9);
        ctx.quadraticCurveTo(0, top - 6, -p.facing * 6, top - 16);
        ctx.quadraticCurveTo(p.facing * 4, top - 2, w / 2 + 1, top + 9);
        ctx.closePath();
        ctx.fill();
        break;
      case "pip": {
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, top);
        const sway = Math.sin(this.frame * 0.25) * 3 - p.vx * 0.8;
        ctx.quadraticCurveTo(sway, top - 8, sway * 1.5, top - 15);
        ctx.stroke();
        ctx.fillStyle = "#ffe27a";
        ctx.beginPath();
        ctx.arc(sway * 1.5, top - 16, 4, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "ferro": {
        // A horseshoe magnet on the head.
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#cfd3da";
        ctx.beginPath();
        ctx.arc(0, top - 1, 7, 0, Math.PI);
        ctx.stroke();
        ctx.strokeStyle = "#ff5a5f";
        ctx.beginPath();
        ctx.moveTo(-7, top - 1);
        ctx.lineTo(-7, top - 8);
        ctx.stroke();
        ctx.strokeStyle = "#4aa8ff";
        ctx.beginPath();
        ctx.moveTo(7, top - 1);
        ctx.lineTo(7, top - 8);
        ctx.stroke();
        break;
      }
      case "fern": {
        // A sprout of two leaves on top.
        ctx.strokeStyle = "#2f7a33";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, top);
        ctx.lineTo(0, top - 7);
        ctx.stroke();
        ctx.fillStyle = "#49b04a";
        const sway = Math.sin(this.frame * 0.15) * 1.5;
        for (const d of [-1, 1]) {
          ctx.beginPath();
          ctx.ellipse(d * 6 + sway, top - 9, 6, 3, d * -0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "dab": {
        // A beret, tilted, with a dab of paint on the cheek.
        ctx.fillStyle = "#d6336c";
        ctx.beginPath();
        ctx.ellipse(-p.facing * 2, top + 1, w / 2 + 2, 6, -0.25 * p.facing, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(-p.facing * 2 - 1, top - 6, 3, 4);
        ctx.fillStyle = this.col(p.seat) || "#fff";
        ctx.beginPath();
        ctx.arc(p.facing * 6, top + 17, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "fuse":
        ctx.fillStyle = "#333";
        ctx.fillRect(-w / 2, top + 9, w, 5);
        ctx.fillStyle = "#9fe3ff";
        ctx.beginPath();
        ctx.arc(p.facing * 3 - 4, top + 11.5, 3.5, 0, Math.PI * 2);
        ctx.arc(p.facing * 3 + 5, top + 11.5, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#444";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, top);
        ctx.lineTo(3, top - 7);
        ctx.stroke();
        ctx.fillStyle = this.frame % 6 < 3 ? "#ffdf5a" : "#ff7a2a";
        ctx.beginPath();
        ctx.arc(3, top - 8, 2.5 + (this.frame % 4) * 0.4, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  }

  drawHazardsBack(state, theme) {
    const { ctx } = this;
    for (const h of state.hazards.list) {
      if (h.type === "cometWarn") {
        const k = 1 - h.timer / h.warn;
        const on = Math.floor(h.timer / 8) % 2 === 0;
        ctx.fillStyle = `rgba(255,120,60,${on ? 0.16 + 0.12 * k : 0.06})`;
        ctx.fillRect(0, h.y - h.speed * 0 - 26, VIEW.w, 52);
        ctx.strokeStyle = `rgba(255,140,80,${0.4 + 0.4 * k})`;
        ctx.setLineDash([16, 12]);
        ctx.lineDashOffset = -this.frame * 2 * h.dir;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, h.y);
        ctx.lineTo(VIEW.w, h.y);
        ctx.stroke();
        ctx.setLineDash([]);
        // Entry arrow with a countdown ring.
        const ex = h.dir > 0 ? 30 : VIEW.w - 30;
        ctx.fillStyle = theme.hazard;
        ctx.beginPath();
        ctx.moveTo(ex + h.dir * 18, h.y);
        ctx.lineTo(ex - h.dir * 10, h.y - 16);
        ctx.lineTo(ex - h.dir * 10, h.y + 16);
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ex, h.y, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
        ctx.stroke();
      } else if (h.type === "rockWarn") {
        const k = 1 - h.timer / h.warn;
        // A column of light and a shadow on every surface under it.
        ctx.fillStyle = `rgba(255,90,50,${0.05 + 0.1 * k})`;
        ctx.fillRect(h.x - 32, 0, 64, 900);
        for (const t of state.tiles) {
          if (t.state !== "solid" || h.x < t.x - 30 || h.x > t.x + t.w + 30) continue;
          ctx.fillStyle = `rgba(0,0,0,${0.25 + 0.35 * k})`;
          ctx.beginPath();
          ctx.ellipse(h.x, t.y + 1, 14 + 22 * k, 4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#ffcf6e";
        ctx.font = "bold 28px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("!", h.x, 34);
      }
    }
    const gale = state.hazards.gale;
    if (gale) {
      if (gale.phase === "warn") {
        const on = Math.floor(gale.timer / 10) % 2 === 0;
        ctx.fillStyle = `rgba(200,230,255,${on ? 0.5 : 0.2})`;
        ctx.font = "bold 40px system-ui, sans-serif";
        ctx.textAlign = "center";
        for (let y = 150; y < 800; y += 160) ctx.fillText(gale.dir > 0 ? "»" : "«", gale.dir > 0 ? 40 : VIEW.w - 40, y);
      } else {
        for (let i = 0; i < 3; i++) {
          this.particles.push({ x: gale.dir > 0 ? -20 : VIEW.w + 20, y: rnd(0, 880), vx: gale.dir * rnd(14, 22), vy: 0, g: 0, life: 110, max: 110, color: "#e6f4ff66", size: rnd(20, 50), kind: "streak" });
        }
      }
    }
  }

  drawHazardsFront(state, theme) {
    const { ctx } = this;
    for (const h of state.hazards.list) {
      if (h.type === "comet") {
        for (let i = 1; i < 8; i++) {
          ctx.fillStyle = `rgba(255,${150 - i * 12},60,${0.35 - i * 0.04})`;
          ctx.beginPath();
          ctx.arc(h.x - Math.sign(h.vx) * i * 12, h.y, h.r * (1 - i * 0.08), 0, Math.PI * 2);
          ctx.fill();
        }
        const g = ctx.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r);
        g.addColorStop(0, "#fffbe0");
        g.addColorStop(0.5, "#ffb347");
        g.addColorStop(1, "#ff5a1f");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
        if (h.redirectedBy >= 0) {
          ctx.strokeStyle = this.col(h.redirectedBy);
          ctx.lineWidth = 4;
          ctx.stroke();
        }
      } else if (h.type === "rock") {
        ctx.fillStyle = "#7a6650";
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2;
          const r = h.r * (0.85 + 0.15 * Math.sin(i * 2.7));
          ctx.lineTo(h.x + Math.cos(a) * r, h.y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#3b2f22";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
  }

  drawTide(state, theme) {
    const t = state.hazards.tide;
    if (!t) return;
    const { ctx } = this;
    const level = t.level;
    if (t.phase === "warn") {
      // Show where the water will reach.
      const on = Math.floor(t.timer / 10) % 2 === 0;
      ctx.strokeStyle = `rgba(89,208,255,${on ? 0.8 : 0.3})`;
      ctx.setLineDash([14, 10]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 735);
      ctx.lineTo(VIEW.w, 735);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (level > 975) return;
    ctx.fillStyle = "rgba(40,140,200,0.55)";
    ctx.beginPath();
    ctx.moveTo(0, VIEW.h);
    for (let x = 0; x <= VIEW.w; x += 20) ctx.lineTo(x, level + Math.sin(x * 0.02 + this.frame * 0.08) * 5);
    ctx.lineTo(VIEW.w, VIEW.h);
    ctx.fill();
    ctx.strokeStyle = "rgba(220,250,255,0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= VIEW.w; x += 20) ctx.lineTo(x, level + Math.sin(x * 0.02 + this.frame * 0.08) * 5);
    ctx.stroke();
  }

  updateParticles() {
    const { ctx } = this;
    const keep = [];
    for (const p of this.particles) {
      p.life--;
      if (p.life <= 0) continue;
      keep.push(p);
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      const a = p.life / p.max;
      ctx.globalAlpha = Math.max(0, Math.min(1, a * 1.3));
      if (p.kind === "ring") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * a + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - a * 0.7), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === "chunk") {
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
        ctx.restore();
      } else if (p.kind === "streak") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - Math.sign(p.vx) * p.size, p.y);
        ctx.stroke();
      } else if (p.kind === "beam") {
        const w = 70 * a;
        ctx.fillStyle = p.color;
        if (p.dir === "down") ctx.fillRect(p.x - w / 2, 0, w, 900);
        else if (p.dir === "up") ctx.fillRect(p.x - w / 2, 0, w, 900);
        else ctx.fillRect(0, p.y - w / 2, 1600, w);
        ctx.fillStyle = "#fff";
        if (p.dir === "down" || p.dir === "up") ctx.fillRect(p.x - w / 6, 0, w / 3, 900);
        else ctx.fillRect(0, p.y - w / 6, 1600, w / 3);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === "bubble" ? 1 : a + 0.3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    this.particles = keep.length > 1500 ? keep.slice(-1500) : keep;
  }

  drawOffscreen(state) {
    const { ctx } = this;
    for (const p of state.players) {
      if (p.status !== "play") continue;
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      let ax = null;
      let ay = null;
      let rot = 0;
      if (cy < 0) {
        ax = Math.max(30, Math.min(VIEW.w - 30, cx));
        ay = 30;
        rot = -Math.PI / 2;
      } else if (cx < 0) {
        ax = 30;
        ay = Math.max(30, Math.min(860, cy));
        rot = Math.PI;
      } else if (cx > VIEW.w) {
        ax = VIEW.w - 30;
        ay = Math.max(30, Math.min(860, cy));
        rot = 0;
      }
      if (ax === null) continue;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = this.col(p.seat);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.rotate(rot);
      ctx.fillStyle = this.col(p.seat);
      ctx.beginPath();
      ctx.moveTo(30, 0);
      ctx.lineTo(20, -8);
      ctx.lineTo(20, 8);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = this.col(p.seat);
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.name(p.seat), ax, ay);
    }
  }

  drawHud(state) {
    const { ctx } = this;
    const n = state.players.length;
    ctx.fillStyle = "rgba(8,8,16,0.88)";
    ctx.fillRect(0, 900, VIEW.w, 80);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, 900, VIEW.w, 2);
    const pw = VIEW.w / n;
    state.players.forEach((p, i) => {
      const x = i * pw;
      const c = this.col(p.seat);
      const ch = CHARACTERS[p.character];
      const out = p.status === "out";
      ctx.globalAlpha = out ? 0.35 : 1;
      ctx.fillStyle = c;
      ctx.fillRect(x + 10, 910, 6, 60);
      ctx.font = "bold 20px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(this.name(p.seat), x + 24, 910);
      ctx.fillStyle = "#e8e8f0";
      ctx.font = "15px system-ui, sans-serif";
      ctx.fillText(ch.name + (p.kind === "bot" ? " · bot" : ""), x + 62, 914);
      // Stocks.
      for (let s = 0; s < (p.startStocks || state.stocks); s++) {
        ctx.fillStyle = s < p.stocks ? c : "#333";
        ctx.beginPath();
        ctx.arc(x + 30 + s * 16, 948, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#bbb";
      ctx.font = "12px system-ui, sans-serif";
      ctx.fillText(`KOs ${p.stats.kos}`, x + 26, 960);
      if (p.team >= 0) {
        ctx.fillStyle = TEAM_TINTS[p.team];
        roundRect(ctx, x + pw - 30, 910, 20, 20, 5);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.font = "bold 14px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(TEAM_LETTERS[p.team], x + pw - 20, 913);
        ctx.textAlign = "left";
      }
      // Moves: key, name, cooldown.
      const mx = x + Math.max(110, pw - 3 * 76 - 10);
      ch.moves.forEach((m, k) => {
        const bx = mx + k * 76;
        const frac = p.cd[k] > 0 ? p.cd[k] / m.cd : 0;
        ctx.fillStyle = "#1c1c2a";
        roundRect(ctx, bx, 936, 70, 36, 6);
        ctx.fill();
        if (frac > 0) {
          ctx.fillStyle = "rgba(255,255,255,0.08)";
          ctx.fillRect(bx, 936 + 36 * (1 - frac), 70, 36 * frac);
        } else {
          ctx.strokeStyle = c;
          ctx.lineWidth = 2;
          roundRect(ctx, bx, 936, 70, 36, 6);
          ctx.stroke();
        }
        ctx.fillStyle = frac > 0 ? "#777" : "#fff";
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(m.name, bx + 35, 940);
        ctx.fillStyle = frac > 0 ? "#666" : c;
        ctx.font = "bold 13px system-ui, sans-serif";
        const key = p.kind === "bot" ? ["1", "2", "3"][k] : shortLabel(this.slots[p.seat], ["place", "trick", "brk"][k]);
        ctx.fillText(key, bx + 35, 955);
      });
      ctx.globalAlpha = 1;
      if (p.status === "dead") {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("respawning…", x + 26 + (p.startStocks || state.stocks) * 16, 942);
      }
    });
    // Clock.
    const t = Math.floor(state.playTicks / 60);
    const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    roundRect(ctx, VIEW.w / 2 - 70, 8, 140, 34, 8);
    ctx.fill();
    ctx.fillStyle = state.collapse ? "#ff4d4d" : state.overtime ? "#ff9f43" : "#fff";
    const label = state.collapse ? "COLLAPSE " : state.overtime ? "OT " : "";
    ctx.fillText(label + clock, VIEW.w / 2, 14);
  }

  drawFeed() {
    const { ctx } = this;
    let y = 16;
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.textBaseline = "top";
    for (const f of this.feed) {
      f.life--;
      ctx.globalAlpha = Math.min(1, f.life / 60);
      let w = 0;
      for (const [t] of f.text) w += ctx.measureText(t).width;
      let x = VIEW.w - 20 - w;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      roundRect(ctx, x - 8, y - 4, w + 16, 24, 6);
      ctx.fill();
      ctx.textAlign = "left";
      for (const [t, col] of f.text) {
        ctx.fillStyle = col;
        ctx.fillText(t, x, y);
        x += ctx.measureText(t).width;
      }
      y += 28;
    }
    ctx.globalAlpha = 1;
    this.feed = this.feed.filter((f) => f.life > 0);
  }

  drawBanners() {
    const { ctx } = this;
    for (const b of this.banners) {
      b.life--;
      const k = b.life / b.max;
      const pop = 1 + Math.max(0, k - 0.8) * 1.5;
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.save();
      ctx.translate(VIEW.w / 2, 380);
      ctx.scale(pop, pop);
      ctx.font = `900 ${b.size}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 10;
      ctx.strokeStyle = "rgba(0,0,0,0.7)";
      ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.color;
      ctx.fillText(b.text, 0, 0);
      if (b.sub) {
        ctx.font = "bold 22px system-ui, sans-serif";
        ctx.lineWidth = 6;
        ctx.strokeText(b.sub, 0, b.size * 0.7);
        ctx.fillStyle = "#fff";
        ctx.fillText(b.sub, 0, b.size * 0.7);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    this.banners = this.banners.filter((b) => b.life > 0);
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// A small picture of a stage's layout, for the stage select.
export function drawStageThumb(canvas, stage) {
  const ctx = canvas.getContext("2d");
  const s = canvas.width / WORLD.w;
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, stage.theme.skyTop);
  g.addColorStop(1, stage.theme.skyBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(0, canvas.height * 0.86, canvas.width, canvas.height * 0.14);
  for (const r of stage.rows) {
    ctx.fillStyle = stage.theme.tile;
    ctx.fillRect(r.x * s, r.y * s, r.n * 48 * s - 1, Math.max(2, 18 * s));
  }
  for (const sl of stage.slabs) {
    ctx.fillStyle = stage.theme.slab;
    ctx.fillRect(sl.x * s, sl.y * s, sl.w * s, Math.max(3, 24 * s));
  }
  for (const h of stage.hazards) {
    ctx.fillStyle = stage.theme.hazard;
    ctx.globalAlpha = 0.5;
    if (h.type === "comet") for (const y of h.lanes) ctx.fillRect(0, (y - 26) * s, canvas.width, 2);
    if (h.type === "tide") ctx.fillRect(0, h.high * s, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
  }
}

export { MATCH };

// A character portrait for the setup screen, in a seat's colours.
export function drawPortrait(canvas, character, slot) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const r = Object.create(Renderer.prototype);
  r.ctx = ctx;
  r.frame = 0;
  r.particles = [];
  r.slots = [slot];
  const p = { seat: 0, slot, character, kind: "human", x: canvas.width / 2 / 2 - 13, y: 0, w: 26, h: 38, vx: 0, vy: 0, facing: 1, ground: {}, invuln: 0, slow: 0, action: 0, drill: 0, surface: "plain" };
  ctx.save();
  ctx.scale(2, 2);
  p.y = canvas.height / 2 - 8 - p.h;
  ctx.fillStyle = "#c9733c";
  ctx.fillRect(p.x - 14, p.y + p.h, 54, 8);
  r.drawPlayer(p, null);
  ctx.restore();
}
