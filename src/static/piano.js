"use strict";

// ---------------------------------------------------------------------------
// Notes: two octaves, C4 (MIDI 60) up to and including C6 (MIDI 84).
// ---------------------------------------------------------------------------

const FIRST_MIDI = 60;
const LAST_MIDI = 84;

// Per pitch class: letter name, whether it's a sharp, and its diatonic step
// (C=0 … B=6), which is what decides its vertical position on the staff.
const PITCH_CLASSES = [
  { name: "C", sharp: false, step: 0 },
  { name: "C", sharp: true, step: 0 },
  { name: "D", sharp: false, step: 1 },
  { name: "D", sharp: true, step: 1 },
  { name: "E", sharp: false, step: 2 },
  { name: "F", sharp: false, step: 3 },
  { name: "F", sharp: true, step: 3 },
  { name: "G", sharp: false, step: 4 },
  { name: "G", sharp: true, step: 4 },
  { name: "A", sharp: false, step: 5 },
  { name: "A", sharp: true, step: 5 },
  { name: "B", sharp: false, step: 6 },
];

// Computer keyboard layout (by physical key, so it works on QWERTZ/AZERTY
// too): bottom two rows = lower octave, top two rows = upper octave.
const KEY_CODES = [
  "KeyZ", "KeyS", "KeyX", "KeyD", "KeyC", "KeyV", "KeyG", "KeyB", "KeyH", "KeyN", "KeyJ", "KeyM",
  "KeyQ", "Digit2", "KeyW", "Digit3", "KeyE", "KeyR", "Digit5", "KeyT", "Digit6", "KeyY", "Digit7", "KeyU",
  "KeyI",
];

function noteInfo(midi) {
  const pc = PITCH_CLASSES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return {
    midi,
    sharp: pc.sharp,
    label: pc.name + (pc.sharp ? "♯" : "") + octave,
    // Diatonic index across octaves; E4 (bottom staff line) = 30.
    diatonic: octave * 7 + pc.step,
    freq: 440 * Math.pow(2, (midi - 69) / 12),
  };
}

const NOTES = [];
for (let m = FIRST_MIDI; m <= LAST_MIDI; m++) NOTES.push(noteInfo(m));

// ---------------------------------------------------------------------------
// Sound: a small additive "piano-ish" synth on the Web Audio API.
// ---------------------------------------------------------------------------

let audio = null;
let master = null;
let wave = null;

function ensureAudio() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    master = audio.createDynamicsCompressor();
    master.connect(audio.destination);
    // Harmonic amplitudes roughly shaped like a struck string.
    const harmonics = [0, 1, 0.45, 0.25, 0.14, 0.08, 0.05, 0.03];
    wave = audio.createPeriodicWave(
      new Float32Array(harmonics.length),
      new Float32Array(harmonics),
    );
  }
  if (audio.state === "suspended") audio.resume();
}

const voices = new Map(); // midi -> { osc, gain, filter }

function startVoice(note) {
  ensureAudio();
  stopVoice(note.midi, 0.03);

  const now = audio.currentTime;
  const osc = audio.createOscillator();
  osc.setPeriodicWave(wave);
  osc.frequency.value = note.freq;

  // Brightness fades as the note decays, like a real string.
  const filter = audio.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.min(note.freq * 8, 12000), now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(note.freq * 2, 400), now + 1.5);

  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.4);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 4);

  osc.connect(filter).connect(gain).connect(master);
  osc.start(now);
  osc.stop(now + 4.1);
  voices.set(note.midi, { osc, gain });
}

function stopVoice(midi, release = 0.25) {
  const v = voices.get(midi);
  if (!v) return;
  voices.delete(midi);
  const now = audio.currentTime;
  v.gain.gain.cancelScheduledValues(now);
  v.gain.gain.setValueAtTime(Math.max(v.gain.gain.value, 0.0001), now);
  v.gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
  v.osc.stop(now + release + 0.05);
}

// ---------------------------------------------------------------------------
// Keyboard UI
// ---------------------------------------------------------------------------

const keyboardEl = document.getElementById("keyboard");
const keyEls = new Map(); // midi -> element

function buildKeyboard() {
  const whiteCount = NOTES.filter((n) => !n.sharp).length;
  const whiteWidth = 100 / whiteCount;
  const blackWidth = whiteWidth * 0.62;
  let whiteIndex = 0;

  NOTES.forEach((note, i) => {
    const el = document.createElement("div");
    el.className = "key " + (note.sharp ? "black" : "white");
    el.dataset.midi = note.midi;
    el.setAttribute("aria-label", note.label);

    const label = document.createElement("span");
    label.className = "label";
    const keyName = KEY_CODES[i].replace(/^Key|^Digit/, "");
    label.innerHTML = `<span>${note.label}</span><kbd>${keyName}</kbd>`;
    el.appendChild(label);

    if (note.sharp) {
      el.style.left = `calc(${whiteIndex * whiteWidth - blackWidth / 2}%)`;
      el.style.width = `${blackWidth}%`;
    } else {
      whiteIndex++;
    }
    keyboardEl.appendChild(el);
    keyEls.set(note.midi, el);
  });
}

const held = new Set(); // midi numbers currently held, from any input

function press(midi) {
  if (held.has(midi)) return;
  held.add(midi);
  const note = NOTES[midi - FIRST_MIDI];
  startVoice(note);
  keyEls.get(midi).classList.add("down");
  recordNote(midi);
}

function release(midi) {
  if (!held.has(midi)) return;
  held.delete(midi);
  stopVoice(midi);
  keyEls.get(midi).classList.remove("down");
  renderStaff();
}

// Pointer input: each pointer (finger / mouse) tracks which key it's on, so
// you can slide across keys (glissando) and use several fingers at once.
const pointerKeys = new Map(); // pointerId -> midi

function keyAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const key = el && el.closest(".key");
  return key ? Number(key.dataset.midi) : null;
}

function movePointerTo(pointerId, midi) {
  const prev = pointerKeys.get(pointerId);
  if (prev === midi) return;
  if (prev != null) {
    pointerKeys.delete(pointerId);
    if (![...pointerKeys.values()].includes(prev)) release(prev);
  }
  if (midi != null) {
    pointerKeys.set(pointerId, midi);
    press(midi);
  }
}

keyboardEl.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  keyboardEl.setPointerCapture(e.pointerId);
  movePointerTo(e.pointerId, keyAt(e.clientX, e.clientY));
});

keyboardEl.addEventListener("pointermove", (e) => {
  if (!pointerKeys.has(e.pointerId)) return;
  movePointerTo(e.pointerId, keyAt(e.clientX, e.clientY));
});

for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
  keyboardEl.addEventListener(type, (e) => movePointerTo(e.pointerId, null));
}

// Computer keyboard input.
const codeToMidi = new Map(KEY_CODES.map((code, i) => [code, FIRST_MIDI + i]));

window.addEventListener("keydown", (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  const midi = codeToMidi.get(e.code);
  if (midi == null) return;
  e.preventDefault();
  press(midi);
});

window.addEventListener("keyup", (e) => {
  const midi = codeToMidi.get(e.code);
  if (midi != null) release(midi);
});

// Don't leave notes stuck if the window loses focus mid-press.
window.addEventListener("blur", () => {
  for (const midi of [...held]) release(midi);
  pointerKeys.clear();
});

document.getElementById("show-labels").addEventListener("change", (e) => {
  keyboardEl.classList.toggle("show-labels", e.target.checked);
});

// ---------------------------------------------------------------------------
// Staff: treble clef, recently played notes left to right. Notes pressed
// while the latest column still has a held note join it as a chord.
// ---------------------------------------------------------------------------

const SVG_NS = "http://www.w3.org/2000/svg";
const staffEl = document.getElementById("staff");

const SPACE = 12; // distance between staff lines
const BOTTOM_LINE_Y = 110; // E4
const BOTTOM_LINE_DIATONIC = 30; // E4
const STAFF_LEFT = 8;
let viewWidth = 800; // narrower on small screens so notes stay readable
const FIRST_COLUMN_X = 100;
const COLUMN_GAP = 62;
const NAMES_TOP_Y = 152;
const NAME_LINE = 15;
const MAX_HISTORY = 12;

function maxColumns() {
  return Math.floor((viewWidth - 20 - FIRST_COLUMN_X) / COLUMN_GAP) + 1;
}

let columns = []; // [{ notes: [midi, ...] }]

function recordNote(midi) {
  const last = columns[columns.length - 1];
  if (last && last.notes.some((m) => m !== midi && held.has(m))) {
    if (!last.notes.includes(midi)) last.notes.push(midi);
  } else {
    columns.push({ notes: [midi] });
    if (columns.length > MAX_HISTORY) columns.shift();
  }
  renderStaff();
}

function yFor(diatonic) {
  return BOTTOM_LINE_Y - (diatonic - BOTTOM_LINE_DIATONIC) * (SPACE / 2);
}

function svg(tag, attrs = {}, parent = staffEl) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  parent.appendChild(el);
  return el;
}

function drawStaffLines() {
  for (let i = 0; i < 5; i++) {
    const y = BOTTOM_LINE_Y - i * SPACE;
    svg("line", { x1: STAFF_LEFT, x2: viewWidth - STAFF_LEFT, y1: y, y2: y, stroke: "currentColor", "stroke-width": 1.2 });
  }
  const clef = svg("text", { class: "glyph", x: 18, y: BOTTOM_LINE_Y + 1, "font-size": 50 });
  clef.textContent = "\u{1D11E}";
}

function drawWholeNote(g, x, y) {
  // Filled tilted ellipse with a tilted "hole" punched in it.
  svg("ellipse", { cx: x, cy: y, rx: 8, ry: 5.6, fill: "currentColor" }, g);
  svg("ellipse", {
    cx: x, cy: y, rx: 4.2, ry: 2.6,
    fill: "var(--surface)",
    transform: `rotate(-35 ${x} ${y})`,
  }, g);
}

function drawLedgerLines(g, x, diatonic) {
  const lines = [];
  for (let d = 28; d >= diatonic; d -= 2) lines.push(d); // below: C4, A3, …
  for (let d = 40; d <= diatonic; d += 2) lines.push(d); // above: A5, C6, …
  for (const d of lines) {
    const y = yFor(d);
    svg("line", { x1: x - 13, x2: x + 13, y1: y, y2: y, stroke: "currentColor", "stroke-width": 1.2 }, g);
  }
}

function renderStaff() {
  staffEl.replaceChildren();
  drawStaffLines();

  const visible = columns.slice(-maxColumns());
  visible.forEach((col, ci) => {
    const x = FIRST_COLUMN_X + ci * COLUMN_GAP;
    const notes = col.notes.map((m) => NOTES[m - FIRST_MIDI]).sort((a, b) => a.diatonic - b.diatonic);

    let prevDiatonic = null;
    let prevShifted = false;
    let sharpIndex = 0;

    notes.forEach((note) => {
      // Notes a second apart in a chord sit on opposite sides of the stem line.
      const shifted = prevDiatonic !== null && note.diatonic - prevDiatonic <= 1 && !prevShifted;
      const nx = x + (shifted ? 17 : 0);
      const y = yFor(note.diatonic);

      const g = svg("g", { class: "note" + (held.has(note.midi) ? " held" : "") });
      drawLedgerLines(g, nx, note.diatonic);
      drawWholeNote(g, nx, y);
      if (note.sharp) {
        const sx = x - 20 - (sharpIndex % 2) * 12;
        const s = svg("text", { class: "glyph", x: sx, y: y + 7, "font-size": 22, "text-anchor": "middle" }, g);
        s.textContent = "♯";
        sharpIndex++;
      }
      prevDiatonic = note.diatonic;
      prevShifted = shifted;
    });

    // Note names under the staff, stacked like the chord (highest on top).
    notes.slice().reverse().forEach((note, i) => {
      const g = svg("g", { class: "note" + (held.has(note.midi) ? " held" : "") });
      const t = svg("text", { class: "note-name", x, y: NAMES_TOP_Y + i * NAME_LINE }, g);
      t.textContent = note.label;
    });
  });

  // Grow the drawing downwards if a big chord needs more name rows.
  const rows = Math.max(1, ...visible.map((c) => c.notes.length));
  staffEl.setAttribute("viewBox", `0 0 ${viewWidth} ${NAMES_TOP_Y + (rows - 1) * NAME_LINE + 12}`);
}

function fitStaff() {
  const w = staffEl.clientWidth < 560 ? 420 : 800;
  if (w !== viewWidth) {
    viewWidth = w;
    renderStaff();
  }
}

window.addEventListener("resize", fitStaff);

buildKeyboard();
renderStaff();
fitStaff();
