// The browser client: screens (title, players, stage, how to play, controls,
// match, pause, results), the fixed-step game loop, keyboard input, sound
// and rendering. All game rules live in ../src/.

import { createMatch, step, STAGES, CHARACTERS, CHARACTER_IDS } from "../src/index.js";
import { Keyboard, getClusters, setBindings, shortLabel } from "./keys.js";
import { bind, reset, sanitize, keyName, isBindable } from "./bindings.js";
import { Renderer, SEAT_COLORS, SEAT_NAMES, drawStageThumb, drawPortrait } from "./render.js";
import { playEvent, sfx, unlock, isMuted, setMuted } from "./audio.js";

const TICK_MS = 1000 / 60;
const canvas = document.getElementById("game");
const ui = document.getElementById("ui");
const toastEl = document.getElementById("toast");
const renderer = new Renderer(canvas);
const keys = new Keyboard();

// ---- Settings (remembered per browser when storage works) ---------------

const defaults = {
  seats: [
    { kind: "human", character: "mason", difficulty: "normal" },
    { kind: "bot", character: "glim", difficulty: "normal" },
    { kind: "off", character: "pip", difficulty: "normal" },
    { kind: "off", character: "fuse", difficulty: "normal" },
  ],
  stage: "yard",
  stocks: 3,
};
let settings = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem("lf-settings") || "null");
    if (s && Array.isArray(s.seats) && s.seats.length === 4) return { ...defaults, ...s };
  } catch {
    /* fall back to defaults */
  }
  return structuredClone(defaults);
}

function save() {
  try {
    localStorage.setItem("lf-settings", JSON.stringify(settings));
  } catch {
    /* storage may be unavailable */
  }
}

// Rebound keys: { seat: { action: code } }, remembered per browser.
let bindings = loadBindings();
setBindings(bindings);

function loadBindings() {
  try {
    return sanitize(JSON.parse(localStorage.getItem("lf-keys") || "null"));
  } catch {
    return {};
  }
}

function setKeys(next) {
  bindings = next;
  setBindings(bindings);
  try {
    localStorage.setItem("lf-keys", JSON.stringify(bindings));
  } catch {
    /* storage may be unavailable */
  }
}

// ---- App state ----------------------------------------------------------

let screen = null; // { name, ...screen state }
let match = null; // the live match (or the attract-mode demo)
let demo = true; // is `match` the background demo?
let acc = 0;
let last = performance.now();
let paused = false;

function toast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove("show"), 1600);
}

function startDemo() {
  const stage = STAGES[Math.floor(Math.random() * STAGES.length)].id;
  const ids = [...CHARACTER_IDS].sort(() => Math.random() - 0.5).slice(0, 4);
  match = createMatch({
    seed: Math.floor(Math.random() * 1e9),
    stage,
    stocks: 2,
    seats: ids.map((c) => ({ kind: "bot", character: c, difficulty: "hard" })),
  });
  demo = true;
  renderer.reset();
}

function startMatch() {
  const seats = [];
  settings.seats.forEach((s, i) => {
    if (s.kind !== "off") seats.push({ kind: s.kind, character: s.character, difficulty: s.difficulty, slot: i });
  });
  const stage = settings.stage === "random" ? STAGES[Math.floor(Math.random() * STAGES.length)].id : settings.stage;
  match = createMatch({ seed: Math.floor(Math.random() * 1e9), stage, stocks: settings.stocks, seats });
  match.chosenStage = settings.stage;
  demo = false;
  paused = false;
  keys.clearTaps();
  renderer.reset();
  show("game");
}

// ---- Screens --------------------------------------------------------------

function show(name, extra = {}) {
  screen = { name, sel: 0, ...extra };
  render();
}

function render() {
  const s = screen;
  switch (s.name) {
    case "title":
      ui.innerHTML = `
        <div class="screen clear">
          <h1 class="logo"><span class="lost">LOST</span> <span class="footing">FOOTING</span></h1>
          <p class="tagline">Nobody can touch anybody. So make the ground go away.</p>
          <div class="menu">${["Play", "How to play", "Controls", `Sound: ${isMuted() ? "off" : "on"}`]
            .map((t, i) => `<div class="item ${i === s.sel ? "sel" : ""}">${t}</div>`)
            .join("")}</div>
          <p class="hint">Move with any player's keys (<kbd>W</kbd><kbd>S</kbd> or <kbd>↑</kbd><kbd>↓</kbd>), choose with <kbd>Enter</kbd>. <kbd>M</kbd> mutes.</p>
        </div>`;
      break;
    case "setup":
      ui.innerHTML = setupHtml();
      drawSetupPortraits();
      break;
    case "stage":
      ui.innerHTML = stageHtml();
      document.querySelectorAll("canvas[data-stage]").forEach((c) => {
        const st = STAGES.find((x) => x.id === c.dataset.stage);
        if (st) drawStageThumb(c, st);
        else drawRandomThumb(c);
      });
      break;
    case "help":
      ui.innerHTML = helpHtml();
      break;
    case "controls":
      ui.innerHTML = controlsHtml();
      break;
    case "game":
      ui.innerHTML = paused ? pauseHtml() : "";
      break;
    case "results":
      ui.innerHTML = resultsHtml();
      break;
  }
}

function seatCtl(i) {
  const l = (a) => `<kbd>${shortLabel(i, a)}</kbd>`;
  return `${l("left")}${l("right")} character · ${l("place")} join · ${l("brk")} leave · <kbd>${i + 1}</kbd> bot`;
}

function setupHtml() {
  const cards = settings.seats
    .map((seat, i) => {
      const color = SEAT_COLORS[i];
      const ch = CHARACTERS[seat.character];
      const head = `<div class="tag" style="color:${color}">${SEAT_NAMES[i]} <span class="kind">${getClusters()[i].name}</span></div>`;
      if (seat.kind === "off") {
        return `<div class="seat off" style="border-color:${color}55">${head}
          <div class="join">Press ${`<kbd>${shortLabel(i, "place")}</kbd>`} to join<br>or <kbd>${i + 1}</kbd> to add a bot</div>
          <div class="ctl">${seatCtl(i)}</div></div>`;
      }
      const kind = seat.kind === "bot" ? `Bot · ${seat.difficulty}` : "Human";
      const moves = ch.moves
        .map((m, k) => `<div><kbd style="border-color:${color}">${seat.kind === "bot" ? k + 1 : shortLabel(i, ["place", "trick", "brk"][k])}</kbd><span><b>${m.name}</b> ${m.desc}</span></div>`)
        .join("");
      return `<div class="seat" style="border-color:${color}">${head}
        <div class="kind">${kind}</div>
        <canvas width="120" height="96" data-portrait="${i}"></canvas>
        <div class="cname">◂ ${ch.name} ▸</div><div class="ctitle">${ch.title}</div>
        <div class="trait">${ch.trait}</div>
        <div class="moves">${moves}</div>
        <div class="ctl">${seatCtl(i)}${seat.kind === "bot" ? " (again: difficulty / off)" : ""}</div></div>`;
    })
    .join("");
  const active = settings.seats.filter((s) => s.kind !== "off").length;
  return `<div class="screen">
    <h2>Players</h2>
    <p class="sub">Each player uses their own keys to join and pick a character. Number keys <kbd>1</kbd>–<kbd>4</kbd> add or change bots.</p>
    <div class="seats">${cards}</div>
    <p class="hint">${active >= 2 ? "<kbd>Enter</kbd> choose a stage" : "At least two players or bots"} · <kbd>Esc</kbd> back</p>
  </div>`;
}

function drawSetupPortraits() {
  document.querySelectorAll("canvas[data-portrait]").forEach((c) => {
    const i = +c.dataset.portrait;
    drawPortrait(c, settings.seats[i].character, i);
  });
}

function stageHtml() {
  const list = [...STAGES.map((s) => ({ id: s.id, name: s.name, blurb: s.blurb })), { id: "random", name: "Random", blurb: "Any of them." }];
  const sel = Math.max(0, list.findIndex((s) => s.id === settings.stage));
  return `<div class="screen">
    <h2>Stage</h2>
    <p class="sub">Every stage is crumbling ground over a pit, plus a hazard that makes its sturdy slabs dangerous.</p>
    <div class="stages">${list
      .map(
        (s, i) => `<div class="stagecard ${i === sel ? "sel" : ""}"><canvas width="320" height="180" data-stage="${s.id}"></canvas>
        <div class="sname">${s.name}</div><div class="sblurb">${s.blurb}</div></div>`,
      )
      .join("")}</div>
    <div class="row"><div class="stocks">Stocks: ◂ ${settings.stocks} ▸ <span class="hint">(up / down)</span></div></div>
    <p class="hint">Left / right choose · <kbd>Enter</kbd> or any Place key to start · <kbd>Esc</kbd> back</p>
  </div>`;
}

function drawRandomThumb(c) {
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#ffcf6e";
  ctx.font = "900 90px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", c.width / 2, c.height / 2);
}

function helpHtml() {
  const rows = CHARACTER_IDS.map((id) => {
    const c = CHARACTERS[id];
    return `<tr><td><b>${c.name}</b><br><span style="color:var(--muted)">${c.title}</span><br><span style="color:var(--accent);font-size:12px">${c.trait}</span></td>${c.moves
      .map((m) => `<td><b>${m.name}</b><br>${m.desc}</td>`)
      .join("")}</tr>`;
  }).join("");
  return `<div class="screen">
    <h2>How to play</h2>
    <div class="big-rule">You can never hit anyone. Nothing you do touches another player.<br>You win by taking the ground out from under them.</div>
    <div class="cols">
      <div class="rule"><h3>The ground crumbles</h3><p>Almost every platform is made of brick tiles. Stand still and the tiles under you shake, then fall (in about a second). Keep moving and they hold. Broken tiles come back after a few seconds. Platforms are one-way: jump up through them, press down to drop through.</p></div>
      <div class="rule"><h3>Sturdy slabs are never safe for long</h3><p>Metal and stone slabs don't crumble when you stand on them, but every stage aims a hazard at them on a rhythm: comets, falling rocks, the tide, gales. Warnings come first (a flashing lane, a shadow, a siren). Moves can break slabs too.</p></div>
      <div class="rule"><h3>Fall out and you lose a stock</h3><p>Fall into the pit, get blown off a side or launched off the top, or touch the tide. You come back on a halo that lasts until you step off it. Last player with stocks wins. After 1:30 the stage comes back slower; after 3:30 it stops coming back.</p></div>
      <div class="rule"><h3>Bodies only touch top to bottom</h3><p>Walk straight through each other. But land on someone's head and you <b>stomp</b> them (you bounce, they sink and their tiles crack); jump into someone's feet and you <b>bump</b> them up. Land gently and you ride on their head.</p></div>
      <div class="rule"><h3>Three moves each</h3><p>Every character has <b>Place</b> (an obstacle), <b>Trick</b> (a second tool) and <b>Break</b> (wreck the floor). Everything you place affects everyone, you too. Each move has a cooldown. Throws go further if you hold forward and higher if you hold up.</p></div>
      <div class="rule"><h3>Credit is indirect</h3><p>If something you made (glue, a spring, a broken tile, a stomp, a comet your wall bounced back) sends someone out within five seconds, the elimination is yours. Combine things: glue + saw, oil + gust, a wall in a comet's path.</p></div>
    </div>
    <table class="kits"><tr><th>Character</th><th>1 Place</th><th>2 Trick</th><th>3 Break</th></tr>${rows}</table>
    <p class="hint">Up / down scroll · <kbd>Esc</kbd> back</p>
  </div>`;
}

const ACTION_ROWS = [
  ["left", "Left"],
  ["right", "Right"],
  ["up", "Jump (twice for air jump)"],
  ["down", "Drop through / fast fall"],
  ["place", "1 Place"],
  ["trick", "2 Trick"],
  ["brk", "3 Break"],
];
const RESET_ROW = ACTION_ROWS.length; // the "reset this seat" row

function controlsHtml() {
  const edit = screen.edit; // { seat, row, waiting } while rebinding
  const cards = getClusters()
    .map((c, i) => {
      const cell = (row, inner) => `<div class="${edit && edit.seat === i && edit.row === row ? "pick" : ""}">${inner}</div>`;
      const rows = ACTION_ROWS.map(([a, label], row) => {
        const waiting = edit && edit.waiting && edit.seat === i && edit.row === row;
        const caps = waiting ? `<kbd>press a key…</kbd>` : c.keys[a].map((code) => `<kbd data-code="${code}">${keyName(code)}</kbd>`).join(" ");
        return cell(row, caps) + cell(row, label);
      }).join("");
      const resetRow = edit ? cell(RESET_ROW, `<span class="dim">reset</span>`) + cell(RESET_ROW, `<span class="dim">this seat's keys</span>`) : "";
      return `<div class="cluster" style="border-color:${SEAT_COLORS[i]}"><div class="tag" style="color:${SEAT_COLORS[i]};font-weight:900;font-size:20px;margin-bottom:8px">${SEAT_NAMES[i]} · ${c.name}</div><div class="grid">${rows}${resetRow}</div></div>`;
    })
    .join("");
  const sub = edit
    ? edit.waiting
      ? "Press the key for this action. <kbd>Esc</kbd> cancels."
      : "Move with the arrow keys or your seat's keys. <kbd>Enter</kbd> rebinds the highlighted action, <kbd>Backspace</kbd> puts its default back."
    : "Up to four players share one keyboard. Press keys to test them: each lights up while the keyboard reports it. <kbd>Enter</kbd> to change keys.";
  return `<div class="screen">
    <h2>Controls</h2>
    <p class="sub">${sub}</p>
    <div class="clusters">${cards}</div>
    <div class="cols" style="margin-top:18px">
      <div class="rule"><h3>Everyone</h3><p><kbd data-code="Escape">Esc</kbd> pause · <kbd data-code="KeyM">M</kbd> sound on/off · <kbd data-code="Enter">Enter</kbd> confirm in menus. These and <kbd>1</kbd>–<kbd>4</kbd>, <kbd>Space</kbd>, <kbd>Tab</kbd> and <kbd>Backspace</kbd> can't be rebound.</p></div>
      <div class="rule"><h3>Ghosting</h3><p>Many keyboards can't report every combination of three or more keys held at once. If a key here doesn't light up while others are held, try another seat's cluster for that player, or play with fewer humans and fill seats with bots. Right Shift rarely ghosts.</p></div>
    </div>
    <p class="hint">${edit ? "<kbd>Esc</kbd> done" : "<kbd>Esc</kbd> back"}</p>
  </div>`;
}

function controlsInput(code, d) {
  const edit = screen.edit;
  if (!edit) {
    if (d === "up" || d === "down") {
      const el = ui.querySelector(".screen");
      if (el) el.scrollBy({ top: d === "up" ? -160 : 160, behavior: "smooth" });
      return;
    }
    if (code === "Enter" || code === "NumpadEnter") {
      sfx.confirm();
      screen.edit = { seat: 0, row: 0, waiting: false };
      return render();
    }
    if (d === "back") {
      sfx.back();
      show("title", { sel: 2 });
    }
    return;
  }
  if (edit.waiting) {
    if (code === "Escape") edit.waiting = false;
    else if (!isBindable(code)) return toast(`${keyName(code)} can't be used as a game key`);
    else {
      const r = bind(bindings, edit.seat, ACTION_ROWS[edit.row][0], code);
      if (!r.ok) return toast(r.reason);
      setKeys(r.overrides);
      edit.waiting = false;
      sfx.confirm();
    }
    return render();
  }
  if (code === "Escape") {
    sfx.back();
    delete screen.edit;
    return render();
  }
  if (code === "Backspace") {
    setKeys(edit.row === RESET_ROW ? reset(bindings, edit.seat) : reset(bindings, edit.seat, ACTION_ROWS[edit.row][0]));
    sfx.back();
    return render();
  }
  const rows = RESET_ROW + 1;
  if (code.startsWith("Arrow") || d === "up" || d === "down" || d === "left" || d === "right") {
    const dir = code.startsWith("Arrow") ? code.slice(5).toLowerCase() : d;
    if (dir === "up") edit.row = (edit.row + rows - 1) % rows;
    else if (dir === "down") edit.row = (edit.row + 1) % rows;
    else if (dir === "left") edit.seat = (edit.seat + 3) % 4;
    else if (dir === "right") edit.seat = (edit.seat + 1) % 4;
    else return;
    sfx.menu();
    return render();
  }
  if (code === "Enter" || code === "NumpadEnter") {
    if (edit.row === RESET_ROW) {
      setKeys(reset(bindings, edit.seat));
      sfx.back();
    } else {
      edit.waiting = true;
      sfx.confirm();
    }
    render();
  }
}

function pauseHtml() {
  return `<div class="screen" style="width:min(420px, calc(100vw - 32px))">
    <h2 style="text-align:center">Paused</h2>
    <div class="menu" style="margin-top:14px">${["Resume", "Restart", "Players and stage", "Quit to title"]
      .map((t, i) => `<div class="item ${i === screen.sel ? "sel" : ""}">${t}</div>`)
      .join("")}</div>
    <p class="hint"><kbd>Esc</kbd> resume</p>
  </div>`;
}

function fmtTime(ticks) {
  const t = Math.round(ticks / 60);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

function awards(m) {
  const ps = m.players;
  const out = [];
  const best = (fn, min = 1) => {
    let top = null;
    for (const p of ps) if (fn(p) >= min && (!top || fn(p) > fn(top))) top = p;
    return top;
  };
  const nm = (p) => `<span style="color:${SEAT_COLORS[p.slot]}">${SEAT_NAMES[p.slot]}</span>`;
  const a1 = best((p) => p.stats.kos);
  if (a1) out.push(`<b>Puppeteer</b>${nm(a1)} caused ${a1.stats.kos} elimination${a1.stats.kos > 1 ? "s" : ""}`);
  const a2 = best((p) => p.stats.tilesBroken + p.stats.slabsBroken * 4, 4);
  if (a2) out.push(`<b>Wrecking crew</b>${nm(a2)} broke ${a2.stats.tilesBroken} tiles${a2.stats.slabsBroken ? ` and ${a2.stats.slabsBroken} slabs` : ""}`);
  const a3 = best((p) => p.stats.airTicks, 60);
  if (a3) out.push(`<b>Frequent flyer</b>${nm(a3)} spent ${fmtTime(a3.stats.airTicks)} in the air`);
  const a4 = best((p) => p.stats.stomps);
  if (a4) out.push(`<b>Head stomper</b>${nm(a4)} landed on ${a4.stats.stomps} head${a4.stats.stomps > 1 ? "s" : ""}`);
  const a5 = best((p) => p.stats.headTicks, 30);
  if (a5) out.push(`<b>Hitchhiker</b>${nm(a5)} rode on heads for ${fmtTime(a5.stats.headTicks)}`);
  const a6 = best((p) => p.stats.falls);
  if (a6) out.push(`<b>Own worst enemy</b>${nm(a6)} fell ${a6.stats.falls} time${a6.stats.falls > 1 ? "s" : ""} with nobody to blame`);
  const a7 = best((p) => p.stats.placed, 1);
  if (a7) out.push(`<b>Busy hands</b>${nm(a7)} used ${a7.stats.placed} moves`);
  return out;
}

function resultsHtml() {
  const m = match;
  const w = m.players[m.result.winner];
  const rows = m.result.ranking
    .map((seat, i) => {
      const p = m.players[seat];
      const st = p.stats;
      return `<tr><td><b style="color:${SEAT_COLORS[p.slot]}">${i + 1}. ${SEAT_NAMES[p.slot]}</b> ${CHARACTERS[p.character].name}${p.kind === "bot" ? " (bot)" : ""}</td>
      <td>${st.kos}</td><td>${st.falls}</td><td>${st.tilesBroken + st.slabsBroken}</td><td>${st.placed}</td><td>${st.stomps}</td><td>${fmtTime(st.airTicks)}</td><td>${fmtTime(st.longestLife)}</td></tr>`;
    })
    .join("");
  return `<div class="screen results">
    <p class="winner" style="color:${SEAT_COLORS[w.slot]}">${SEAT_NAMES[w.slot]} WINS</p>
    <p class="sub" style="text-align:center">${CHARACTERS[w.character].name} kept their footing longest${m.result.tied ? " (a tie on the last tick, broken by credited eliminations)" : ""} · match time ${fmtTime(m.result.ticks)}</p>
    <div class="awards">${awards(m)
      .map((a) => `<div class="award">${a}</div>`)
      .join("")}</div>
    <table class="stats"><tr><th>Player</th><th>Eliminations caused</th><th>Self-eliminations</th><th>Platforms broken</th><th>Moves used</th><th>Stomps</th><th>Time airborne</th><th>Longest life</th></tr>${rows}</table>
    <div class="menu" style="flex-direction:row;justify-content:center;margin-top:18px">${["Rematch", "Players and stage", "Title"]
      .map((t, i) => `<div class="item ${i === screen.sel ? "sel" : ""}" style="min-width:200px">${t}</div>`)
      .join("")}</div>
  </div>`;
}

// ---- Input on screens ------------------------------------------------------

function dirOf(code, actions) {
  if (code === "Enter" || code === "NumpadEnter" || code === "Space") return "ok";
  if (code === "Escape" || code === "Backspace") return "back";
  for (const a of actions) {
    if (a.action === "up") return "up";
    if (a.action === "down") return "down";
    if (a.action === "left") return "left";
    if (a.action === "right") return "right";
    if (a.action === "place") return "ok";
    if (a.action === "brk") return "back";
  }
  return null;
}

keys.onPress((code, actions) => {
  unlock();
  if (code === "KeyM") {
    setMuted(!isMuted());
    toast(isMuted() ? "Sound off" : "Sound on");
    if (screen.name === "title") render();
    return;
  }
  const d = dirOf(code, actions);
  switch (screen.name) {
    case "title":
      return titleInput(d);
    case "setup":
      return setupInput(code, actions, d);
    case "stage":
      return stageInput(d);
    case "help":
      if (d === "up" || d === "down") {
        const el = ui.querySelector(".screen");
        if (el) el.scrollBy({ top: d === "up" ? -160 : 160, behavior: "smooth" });
        return;
      }
      if (d === "back" || code === "Enter") {
        sfx.back();
        show("title", { sel: 1 });
      }
      return;
    case "controls":
      return controlsInput(code, d);
    case "game":
      return gameInput(code, d);
    case "results":
      return resultsInput(d);
  }
});

function moveSel(d, n, vertical = true) {
  const prev = vertical ? "up" : "left";
  const next = vertical ? "down" : "right";
  if (d === prev) screen.sel = (screen.sel + n - 1) % n;
  else if (d === next) screen.sel = (screen.sel + 1) % n;
  else return false;
  sfx.menu();
  render();
  return true;
}

function titleInput(d) {
  if (moveSel(d, 4)) return;
  if (d !== "ok") return;
  sfx.confirm();
  if (screen.sel === 0) show("setup");
  else if (screen.sel === 1) show("help");
  else if (screen.sel === 2) show("controls");
  else {
    setMuted(!isMuted());
    render();
  }
}

function setupInput(code, actions, d) {
  const digit = /^Digit([1-4])$/.exec(code);
  if (digit) {
    const s = settings.seats[+digit[1] - 1];
    const order = ["normal", "hard", "easy"];
    if (s.kind !== "bot") {
      s.kind = "bot";
      s.difficulty = "normal";
    } else {
      const i = order.indexOf(s.difficulty);
      if (i === order.length - 1) s.kind = "off";
      else s.difficulty = order[i + 1];
    }
    sfx.menu();
    save();
    return render();
  }
  if (code === "Escape") {
    sfx.back();
    return show("title");
  }
  if (code === "Enter" || code === "NumpadEnter") {
    if (settings.seats.filter((s) => s.kind !== "off").length < 2) return sfx.fizzle(), toast("Add at least two players or bots");
    sfx.confirm();
    return show("stage");
  }
  for (const { seat, action } of actions) {
    const s = settings.seats[seat];
    if (action === "place") {
      if (s.kind !== "human") {
        s.kind = "human";
        sfx.confirm();
      } else if (settings.seats.filter((x) => x.kind !== "off").length >= 2) {
        sfx.confirm();
        save();
        return show("stage");
      }
    } else if (action === "brk") {
      if (s.kind !== "off") {
        s.kind = "off";
        sfx.back();
      } else {
        sfx.back();
        return show("title");
      }
    } else if ((action === "left" || action === "right") && s.kind !== "off") {
      const i = CHARACTER_IDS.indexOf(s.character);
      const n = CHARACTER_IDS.length;
      s.character = CHARACTER_IDS[(i + (action === "left" ? n - 1 : 1)) % n];
      sfx.menu();
    } else continue;
    save();
    return render();
  }
}

function stageInput(d) {
  const ids = [...STAGES.map((s) => s.id), "random"];
  let i = Math.max(0, ids.indexOf(settings.stage));
  if (d === "left" || d === "right") {
    i = (i + (d === "left" ? ids.length - 1 : 1)) % ids.length;
    settings.stage = ids[i];
    sfx.menu();
  } else if (d === "up" || d === "down") {
    settings.stocks = Math.max(1, Math.min(5, settings.stocks + (d === "up" ? 1 : -1)));
    sfx.menu();
  } else if (d === "ok") {
    sfx.confirm();
    save();
    return startMatch();
  } else if (d === "back") {
    sfx.back();
    return show("setup");
  } else return;
  save();
  render();
}

function gameInput(code, d) {
  if (!paused) {
    if (code === "Escape") {
      paused = true;
      screen.sel = 0;
      sfx.back();
      render();
    }
    return;
  }
  if (code === "Escape") {
    paused = false;
    keys.clearTaps();
    return render();
  }
  if (moveSel(d, 4)) return;
  if (d !== "ok") return;
  sfx.confirm();
  paused = false;
  keys.clearTaps();
  if (screen.sel === 0) render();
  else if (screen.sel === 1) startMatch();
  else if (screen.sel === 2) {
    startDemo();
    show("setup");
  } else {
    startDemo();
    show("title");
  }
}

function resultsInput(d) {
  if (moveSel(d, 3, false)) return;
  if (d === "back") {
    startDemo();
    return show("title");
  }
  if (d !== "ok") return;
  sfx.confirm();
  if (screen.sel === 0) startMatch();
  else if (screen.sel === 1) {
    startDemo();
    show("setup");
  } else {
    startDemo();
    show("title");
  }
}

// ---- The loop ----------------------------------------------------------------

function sampleInputs() {
  const inputs = match.players.map((p) => (p.kind === "human" ? keys.sample(p.slot) : 0));
  keys.clearTaps();
  return inputs;
}

function frame(now) {
  const dt = Math.min(100, now - last);
  last = now;
  const running = screen.name !== "game" || !paused;
  if (running && match) {
    acc += dt;
    let steps = 0;
    while (acc >= TICK_MS && steps < 4) {
      acc -= TICK_MS;
      steps++;
      step(match, demo ? [] : sampleInputs());
      renderer.handleEvents(match.events, match);
      if (!demo && screen.name === "game") for (const e of match.events) playEvent(e);
      if (demo && match.phase === "over" && match.phaseTimer <= 0) startDemo();
    }
    if (steps === 4) acc = 0;
    if (!demo && match.phase === "over" && match.phaseTimer <= 0 && screen.name === "game") {
      show("results");
    }
  } else {
    acc = 0;
  }
  if (match) renderer.draw(match, { noHud: demo, calm: demo, dim: demo && screen.name !== "title" ? 0.45 : demo ? 0.15 : 0 });
  if (screen.name === "controls") {
    document.querySelectorAll("kbd[data-code]").forEach((k) => k.classList.toggle("on", keys.isHeld(k.dataset.code)));
  }
  requestAnimationFrame(frame);
}

window.addEventListener("resize", () => renderer.resize());
window.addEventListener("pointerdown", () => unlock());
startDemo();
show("title");
requestAnimationFrame(frame);

// For debugging from the console: the live match, and a bot demo on a chosen stage.
window.lostFooting = {
  get match() {
    return match;
  },
  demo(stage, n = 4) {
    match = createMatch({ seed: Math.floor(Math.random() * 1e9), stage, stocks: 3, seats: CHARACTER_IDS.slice(0, n).map((c) => ({ kind: "bot", character: c, difficulty: "hard" })) });
    demo = false;
    renderer.reset();
    show("game");
  },
};
