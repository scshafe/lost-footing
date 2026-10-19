// Synthesized sound effects (WebAudio): no audio files. The context starts
// on the first key press (browsers block audio until then).

let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
const lastPlayed = new Map();

try {
  muted = localStorage.getItem("lf-muted") === "1";
} catch {
  muted = false;
}

export function isMuted() {
  return muted;
}

export function setMuted(m) {
  muted = m;
  try {
    localStorage.setItem("lf-muted", m ? "1" : "0");
  } catch {
    /* storage may be unavailable */
  }
  if (master) master.gain.value = muted ? 0 : 0.5;
}

export function unlock() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp);
  comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function ok(key, gapMs) {
  if (!ctx || muted) return false;
  const now = performance.now();
  if (key && gapMs) {
    if (now - (lastPlayed.get(key) || 0) < gapMs) return false;
    lastPlayed.set(key, now);
  }
  return true;
}

function tone({ f = 440, f2 = null, dur = 0.12, type = "square", vol = 0.2, delay = 0, attack = 0.005 }) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise({ dur = 0.2, freq = 1200, q = 1, vol = 0.3, type = "lowpass", delay = 0, f2 = null }) {
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(freq, t);
  if (f2) filt.frequency.exponentialRampToValueAtTime(f2, t + dur);
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

const SEAT_PITCH = [1, 1.12, 0.9, 1.25];

export const sfx = {
  menu() {
    if (ok("menu", 30)) tone({ f: 660, dur: 0.05, type: "square", vol: 0.08 });
  },
  confirm() {
    if (!ok()) return;
    tone({ f: 523, dur: 0.07, vol: 0.12 });
    tone({ f: 784, dur: 0.1, vol: 0.12, delay: 0.06 });
  },
  back() {
    if (ok()) tone({ f: 440, f2: 260, dur: 0.12, vol: 0.1 });
  },
  jump(seat) {
    if (ok("jump" + seat, 40)) tone({ f: 300 * SEAT_PITCH[seat], f2: 620 * SEAT_PITCH[seat], dur: 0.1, type: "square", vol: 0.07 });
  },
  airJump(seat) {
    if (ok("jump" + seat, 40)) tone({ f: 420 * SEAT_PITCH[seat], f2: 900 * SEAT_PITCH[seat], dur: 0.1, type: "triangle", vol: 0.1 });
  },
  land(hard) {
    if (ok("land", 50)) noise({ dur: hard ? 0.12 : 0.06, freq: hard ? 500 : 900, vol: hard ? 0.25 : 0.1 });
  },
  shake() {
    if (ok("shake", 120)) noise({ dur: 0.25, freq: 300, q: 4, vol: 0.06, type: "bandpass" });
  },
  tileBreak(kind) {
    if (!ok("break", 45)) return;
    if (kind === "sturdy") {
      noise({ dur: 0.5, freq: 1800, f2: 200, vol: 0.4 });
      tone({ f: 120, f2: 50, dur: 0.4, type: "sawtooth", vol: 0.15 });
    } else {
      noise({ dur: 0.18, freq: 700, f2: 200, vol: 0.18 });
    }
  },
  slabHit() {
    if (ok("slab", 60)) tone({ f: 180, f2: 90, dur: 0.15, type: "square", vol: 0.12 });
  },
  tileBack() {
    if (ok("back", 150)) tone({ f: 1200, dur: 0.04, type: "sine", vol: 0.025 });
  },
  place(obj) {
    if (!ok("place", 30)) return;
    const f = { wall: 140, spring: 520, gust: 300, bumper: 700, ledge: 240, decoy: 620, hollow: 330, rub: 260, vine: 480, roots: 150, magnet: 380 }[obj] || 400;
    tone({ f, f2: f * 1.5, dur: 0.12, type: "square", vol: 0.12 });
    if (obj === "wall" || obj === "ledge") noise({ dur: 0.15, freq: 400, vol: 0.15 });
    if (obj === "roots") noise({ dur: 0.25, freq: 250, vol: 0.15 });
    if (obj === "rub") noise({ dur: 0.3, freq: 1200, f2: 500, type: "bandpass", q: 1.5, vol: 0.12 });
  },
  throw() {
    if (ok("throw", 30)) noise({ dur: 0.12, freq: 2000, f2: 600, type: "bandpass", q: 2, vol: 0.12 });
  },
  splat(coat) {
    if (!ok("splat", 40)) return;
    noise({ dur: 0.2, freq: coat === "oil" ? 500 : 900, q: 3, type: "bandpass", vol: 0.25 });
    tone({ f: coat === "acid" ? 900 : 200, f2: coat === "acid" ? 1400 : 120, dur: 0.15, type: "sine", vol: 0.1 });
  },
  spring() {
    if (ok("spring", 40)) tone({ f: 220, f2: 1100, dur: 0.25, type: "triangle", vol: 0.2 });
  },
  bumper() {
    if (!ok("bumper", 40)) return;
    tone({ f: 880, dur: 0.08, type: "square", vol: 0.15 });
    tone({ f: 1320, dur: 0.12, type: "square", vol: 0.1, delay: 0.05 });
  },
  beep(fuse) {
    if (ok()) tone({ f: fuse < 40 ? 1500 : 1100, dur: 0.05, type: "square", vol: 0.08 });
  },
  explode() {
    if (!ok()) return;
    noise({ dur: 0.8, freq: 2400, f2: 120, vol: 0.6 });
    tone({ f: 90, f2: 30, dur: 0.6, type: "sine", vol: 0.5 });
  },
  drill() {
    if (ok()) tone({ f: 900, f2: 200, dur: 0.25, type: "sawtooth", vol: 0.1 });
  },
  drillHit() {
    if (!ok()) return;
    noise({ dur: 0.35, freq: 1200, f2: 150, vol: 0.4 });
    tone({ f: 100, f2: 40, dur: 0.3, type: "square", vol: 0.2 });
  },
  saw() {
    if (ok("saw", 60)) tone({ f: 1400, f2: 1100, dur: 0.12, type: "sawtooth", vol: 0.05 });
  },
  anvil() {
    if (!ok("anvil", 60)) return;
    tone({ f: 1800, dur: 0.3, type: "triangle", vol: 0.15 });
    noise({ dur: 0.2, freq: 600, vol: 0.3 });
  },
  stomp() {
    if (!ok("stomp", 40)) return;
    tone({ f: 600, f2: 150, dur: 0.15, type: "square", vol: 0.2 });
  },
  bump() {
    if (ok("stomp", 40)) tone({ f: 200, f2: 500, dur: 0.12, type: "square", vol: 0.18 });
  },
  warn(hazard) {
    if (!ok("warn", 200)) return;
    if (hazard === "comet") for (let i = 0; i < 3; i++) tone({ f: 880, f2: 660, dur: 0.18, type: "sawtooth", vol: 0.08, delay: i * 0.25 });
    else if (hazard === "rock") tone({ f: 300, f2: 200, dur: 0.4, type: "triangle", vol: 0.1 });
    else if (hazard === "tide") for (let i = 0; i < 2; i++) tone({ f: 220, f2: 330, dur: 0.5, type: "sine", vol: 0.15, delay: i * 0.6 });
    else if (hazard === "belts") for (let i = 0; i < 3; i++) tone({ f: 330 - i * 50, dur: 0.2, type: "square", vol: 0.08, delay: i * 0.25 });
    else if (hazard === "gale") noise({ dur: 1.2, freq: 400, f2: 1600, type: "bandpass", q: 1.5, vol: 0.15 });
  },
  beltsFlip() {
    if (ok("beltsFlip", 200)) tone({ f: 200, f2: 400, dur: 0.25, type: "square", vol: 0.1 });
  },
  comet() {
    if (ok()) noise({ dur: 1.4, freq: 300, f2: 1400, type: "bandpass", q: 2, vol: 0.2 });
  },
  hit() {
    if (!ok("hit", 40)) return;
    noise({ dur: 0.25, freq: 1500, f2: 300, vol: 0.35 });
    tone({ f: 160, f2: 60, dur: 0.2, type: "square", vol: 0.2 });
  },
  rockSmash() {
    if (ok("rock", 60)) noise({ dur: 0.5, freq: 900, f2: 100, vol: 0.45 });
  },
  gale() {
    if (ok()) noise({ dur: 3, freq: 500, f2: 900, type: "bandpass", q: 0.8, vol: 0.18 });
  },
  tide() {
    if (ok()) noise({ dur: 2.5, freq: 300, f2: 700, type: "lowpass", vol: 0.25 });
  },
  ko() {
    if (!ok()) return;
    noise({ dur: 0.9, freq: 3000, f2: 100, vol: 0.5 });
    tone({ f: 70, f2: 30, dur: 0.8, type: "sine", vol: 0.6 });
    tone({ f: 880, f2: 110, dur: 0.6, type: "sawtooth", vol: 0.1 });
  },
  respawn() {
    if (ok()) tone({ f: 400, f2: 800, dur: 0.3, type: "sine", vol: 0.12 });
  },
  count(n) {
    if (ok()) tone({ f: 440, dur: 0.15, type: "square", vol: 0.15 });
  },
  go() {
    if (!ok()) return;
    tone({ f: 880, dur: 0.35, type: "square", vol: 0.18 });
    tone({ f: 1320, dur: 0.35, type: "square", vol: 0.1 });
  },
  overtime() {
    if (!ok()) return;
    for (let i = 0; i < 3; i++) tone({ f: 330 - i * 40, dur: 0.25, type: "sawtooth", vol: 0.12, delay: i * 0.22 });
  },
  win() {
    if (!ok()) return;
    [523, 659, 784, 1047].forEach((f, i) => tone({ f, dur: 0.25, type: "square", vol: 0.12, delay: i * 0.13 }));
    tone({ f: 1047, dur: 0.7, type: "triangle", vol: 0.15, delay: 0.55 });
  },
  polarity() {
    if (!ok("polarity", 100)) return;
    tone({ f: 180, f2: 900, dur: 0.18, type: "sawtooth", vol: 0.14 });
    noise({ dur: 0.2, freq: 800, f2: 200, type: "bandpass", q: 2, vol: 0.12 });
  },
  grow() {
    if (ok("grow", 70)) tone({ f: 400, f2: 700, dur: 0.12, type: "sine", vol: 0.1 });
  },
  rootBurst() {
    if (!ok("rootBurst", 100)) return;
    noise({ dur: 0.35, freq: 220, f2: 80, vol: 0.3 });
    tone({ f: 120, f2: 60, dur: 0.25, type: "square", vol: 0.12 });
  },
  fooled() {
    if (ok("fooled", 60)) tone({ f: 700, f2: 180, dur: 0.3, type: "triangle", vol: 0.15 });
  },
  hollow() {
    if (ok("hollow", 60)) tone({ f: 260, f2: 130, dur: 0.2, type: "sine", vol: 0.1 });
  },
  rubOut() {
    if (ok("rubOut", 80)) noise({ dur: 0.25, freq: 600, f2: 150, type: "bandpass", q: 1, vol: 0.22 });
  },
  fizzle() {
    if (ok("fizzle", 100)) tone({ f: 200, f2: 120, dur: 0.08, type: "square", vol: 0.06 });
  },
};

// Map a simulation event to a sound.
export function playEvent(e) {
  switch (e.type) {
    case "jump":
      return sfx.jump(e.seat);
    case "airJump":
      return sfx.airJump(e.seat);
    case "land":
      return sfx.land(e.hard);
    case "tileShake":
      return sfx.shake();
    case "tileBreak":
      return sfx.tileBreak(e.kind);
    case "slabHit":
      return sfx.slabHit();
    case "tileBack":
      return sfx.tileBack();
    case "place":
      return sfx.place(e.obj);
    case "throw":
      return sfx.throw();
    case "splat":
      return sfx.splat(e.coat);
    case "spring":
      return sfx.spring();
    case "bumper":
      return sfx.bumper();
    case "beep":
      return sfx.beep(e.fuse);
    case "explode":
      return sfx.explode();
    case "drill":
      return sfx.drill();
    case "drillHit":
      return sfx.drillHit();
    case "cut":
      return sfx.saw();
    case "anvilHit":
      return sfx.anvil();
    case "stomp":
      return sfx.stomp();
    case "bump":
      return sfx.bump();
    case "warn":
      return sfx.warn(e.hazard);
    case "comet":
      return sfx.comet();
    case "cometHit":
    case "rockHit":
      return sfx.hit();
    case "rockSmash":
      return sfx.rockSmash();
    case "beltsFlip":
      return sfx.beltsFlip();
    case "galeBlow":
      return sfx.gale();
    case "tideRise":
      return sfx.tide();
    case "ko":
      return sfx.ko();
    case "respawn":
      return sfx.respawn();
    case "count":
      return sfx.count(e.n);
    case "go":
      return sfx.go();
    case "overtime":
    case "collapse":
      return sfx.overtime();
    case "win":
      return sfx.win();
    case "polarity":
      return sfx.polarity();
    case "grow":
      return sfx.grow();
    case "rootBurst":
      return sfx.rootBurst();
    case "fooled":
      return sfx.fooled();
    case "hollow":
      return sfx.hollow();
    case "rubOut":
      return sfx.rubOut();
    case "fizzle":
      return sfx.fizzle();
  }
}
