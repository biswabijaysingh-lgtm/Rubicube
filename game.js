(() => {
'use strict';

/* ======================================================================
   Cube model
   Coordinates are CSS coordinates: x right, y down, z toward the viewer.
   Every cubie keeps a position and a 3x3 integer orientation matrix.
   A move is { axis, layer, q }: turn the slice at `layer` along `axis`
   by q quarter-turns, positive = +90deg about +axis (right-hand rule).
   ====================================================================== */

const HALF = Math.PI / 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// face index = axis * 2 + (sign > 0 ? 1 : 0)  ->  -x +x -y +y -z +z
const FACE_CLASS = ['f-nx', 'f-px', 'f-ny', 'f-py', 'f-nz', 'f-pz'];
const faceIndex = (axis, sign) => axis * 2 + (sign > 0 ? 1 : 0);

const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const Q90 = [
  [1, 0, 0, 0, 0, -1, 0, 1, 0],
  [0, 0, 1, 0, 1, 0, -1, 0, 0],
  [0, -1, 0, 1, 0, 0, 0, 0, 1],
];

const mul3 = (A, B) => {
  const C = new Array(9);
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return C;
};
const mulV = (A, v) => [
  A[0] * v[0] + A[1] * v[1] + A[2] * v[2],
  A[3] * v[0] + A[4] * v[1] + A[5] * v[2],
  A[6] * v[0] + A[7] * v[1] + A[8] * v[2],
];
const transpose = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sameMat = (A, B) => A.every((v, i) => v === B[i]);

function axisRot(axis, a) {
  const c = Math.cos(a), s = Math.sin(a);
  if (axis === 0) return [1, 0, 0, 0, c, -s, 0, s, c];
  if (axis === 1) return [c, 0, s, 0, 1, 0, -s, 0, c];
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

function quarterMat(axis, q) {
  const step = q > 0 ? Q90[axis] : transpose(Q90[axis]);
  let M = IDENT;
  for (let i = 0; i < Math.abs(q); i++) M = mul3(step, M);
  return M;
}

/* ======================================================================
   Look: palette
   ====================================================================== */

const PAL = { r: '#E4262D', b: '#2563B0', y: '#F6CF1D', w: '#FBFAF6', o: '#F2721C', g: '#1F9D5B', i: '#141414' };

// one colour per face  (-x +x -y +y -z +z): left green, right blue, top white, bottom yellow, back orange, front red
const CLASSIC = ['g', 'b', 'w', 'y', 'o', 'r'];

const stickerColor = (axis, sign) => PAL[CLASSIC[faceIndex(axis, sign)]];

/* ======================================================================
   Sound: tiny synthesised effects (Web Audio, no files) + phone haptics
   ====================================================================== */

const sfx = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false, lastClick = 0;
  try { muted = localStorage.getItem('cube.muted') === '1'; } catch (_) {}

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.1, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // a short note with a fast decay
  function tone(c, freq, at, dur, vol, type = 'sine', toFreq = freq) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    o.frequency.exponentialRampToValueAtTime(toFreq, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(master);
    o.start(at); o.stop(at + dur + 0.02);
  }

  // plastic "tock": a filtered noise snap on top of a short low thump
  function click(vol = 1) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime, r = 0.92 + Math.random() * 0.16;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseBuf;
    f.type = 'bandpass'; f.frequency.value = 2100 * r; f.Q.value = 1.1;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + 0.06);
    tone(c, 190 * r, t, 0.09, 0.45 * vol, 'sine', 90);
  }

  function win() {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, t + i * 0.09, 0.5, 0.22, 'triangle'));
    tone(c, 1318.5, t + 0.4, 0.7, 0.16, 'triangle');
  }

  const buzz = (p) => { if (!muted && navigator.vibrate) { try { navigator.vibrate(p); } catch (_) {} } };

  return {
    turn(kind) {
      const now = performance.now();
      if (now - lastClick < 55) return;
      lastClick = now;
      click(kind === 'scramble' || kind === 'solve' || kind === 'pattern' || kind === 'step' ? 0.55 : 1);
      if (kind === 'user') buzz(8);
    },
    win() { win(); buzz([40, 60, 40, 60, 120]); },
    unlock() { ensure(); },
    get muted() { return muted; },
    setMuted(m) {
      muted = m;
      try { localStorage.setItem('cube.muted', m ? '1' : '0'); } catch (_) {}
      if (!m) click(0.8);
    },
  };
})();

/* ======================================================================
   State
   ====================================================================== */

const $ = (id) => document.getElementById(id);
const setAll = (sel, text) => document.querySelectorAll(sel).forEach((el) => { el.textContent = text; });
const stage = $('stage'), world = $('world'), shadow = $('shadow');

let N = 3;              // cube size
let S = 100;            // cubie pitch in px
let cubies = [];
let turn = null;        // { axis, layer, angle } — the layer currently being turned
let raf = 0;
let epoch = 0;        // bumped when the cube is rebuilt, so stale animations/timers bail out
let tweenId = 0;
let queue = [];         // pending { m, kind, after }
let gapTimer = 0;       // pause between two queued moves
let thinking = false;
let batch = { total: 0, done: 0 };

let rx = -24, ry = -36, zoom = 1;   // view: base view shows front, top and right

// idle | scrambling | ready | running | thinking | solving | pattern | done
let state = 'idle';
let history = [];       // every move since the last reset: { axis, layer, q, u } (u = made by the player)
let redoStack = [];     // moves taken back by Undo
let moves = 0;          // user moves only
let speedT = 0.55;      // animation speed slider, 0 (Slower) .. 1 (Zoomin')
let lastDock = '';
let t0 = 0, elapsed = 0, ticker = 0;

/* ---------- build ---------- */

function build() {
  cancelAnimationFrame(raf);
  clearTimeout(gapTimer);
  gapTimer = 0;
  epoch++;
  tweenId++;
  turn = null;
  queue = [];
  thinking = false;
  world.textContent = '';
  cubies = [];
  const o = (N - 1) / 2;

  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    const pos = [i - o, j - o, k - o];
    const stickers = [];
    for (let ax = 0; ax < 3; ax++) {
      if (Math.abs(pos[ax]) === o) stickers.push({ axis: ax, sign: Math.sign(pos[ax]) });
    }
    if (!stickers.length) continue; // hidden core piece — never visible

    const el = document.createElement('div');
    el.className = 'cubie';
    const idx = cubies.length;
    for (let ax = 0; ax < 3; ax++) for (const sign of [-1, 1]) {
      const fi = faceIndex(ax, sign);
      const face = document.createElement('div');
      face.className = 'face ' + FACE_CLASS[fi];
      if (stickers.some((s) => s.axis === ax && s.sign === sign)) {
        face.dataset.c = idx;
        face.dataset.f = fi;
        const st = document.createElement('div');
        st.className = 'sticker';
        st.style.setProperty('--c', stickerColor(ax, sign));
        face.appendChild(st);
      }
      el.appendChild(face);
    }
    world.appendChild(el);
    cubies.push({
      el, pos, home: pos.slice(), orient: IDENT,
      stickers: stickers.map((s) => ({ ...s, color: faceIndex(s.axis, s.sign) })),
    });
  }
  buildMoveGrid();
  layout();
}

function layout() {
  const W = innerWidth, H = innerHeight;
  const dock = $('dock');
  const desktop = W >= 1100 && H >= 560;
  const side = desktop || W >= H;          // panel on the right (desktop / landscape); otherwise at the bottom

  // the stage is the free area between the top bar and the panel, so a zoomed cube
  // is clipped there and can never slide under a card
  let top = $('top').getBoundingClientRect().bottom, right = 0, bottom = 0;
  if (side) right = dock.offsetWidth;
  else {
    top = $('mhud').getBoundingClientRect().bottom + 10;
    bottom = dock.offsetHeight;
  }
  stage.style.top = top + 'px';
  stage.style.right = right + 'px';
  stage.style.bottom = bottom + 'px';
  $('barbg').style.height = top + 'px';

  const w = stage.clientWidth, h = stage.clientHeight;
  let size = side ? Math.min(w * 0.5, h * (desktop ? 0.5 : 0.48))   // desktop / landscape
                  : Math.min(w * 0.6, h * 0.58);                    // portrait phone
  size = clamp(size, 110, 520);
  const cx = w / 2, cy = h / 2 - size * 0.1;   // lift a little so the floor shadow is centred too
  S = size / N;
  world.style.setProperty('--s', S + 'px');
  stage.style.setProperty('--size', size + 'px');
  stage.style.perspectiveOrigin = `${cx}px ${cy}px`;
  world.style.left = shadow.style.left = cx + 'px';
  world.style.top = shadow.style.top = cy + 'px';
  applyView();
  render();
  lastDock = dock.offsetWidth + 'x' + dock.offsetHeight;
}

/* ---------- rendering ---------- */

const isJelly = () => document.documentElement.dataset.theme === 'jelly';
let wobble = null;       // { axis, t0 } — jelly shiver after a turn

function startWobble(axis) {
  const running = !!wobble;
  wobble = { axis, t0: performance.now() };
  if (running) return;
  const loop = () => {
    if (!wobble || performance.now() - wobble.t0 > 1000) { wobble = null; render(); return; }
    render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

const scaleRows = (M, p, v) => [[M[0] * v[0], M[1] * v[0], M[2] * v[0], M[3] * v[1], M[4] * v[1], M[5] * v[1], M[6] * v[2], M[7] * v[2], M[8] * v[2]], [p[0] * v[0], p[1] * v[1], p[2] * v[2]]];

function render() {
  const R = turn ? axisRot(turn.axis, turn.angle) : null;
  let wob = null;
  if (wobble) {
    const t = performance.now() - wobble.t0;
    const a = 0.09 * Math.exp(-t / 170) * Math.sin(t / 38);
    wob = [1 + a * 0.5, 1 + a * 0.5, 1 + a * 0.5]; wob[wobble.axis] = 1 - a;
  }
  for (const c of cubies) {
    let M = c.orient, p = c.pos;
    if (turn && Math.abs(c.pos[turn.axis] - turn.layer) < 1e-6) {
      M = mul3(R, M);
      p = mulV(R, p);
      if (turn.squish) {
        const q = turn.squish, v = [1 + 0.07 * q, 1 + 0.07 * q, 1 + 0.07 * q];
        v[turn.axis] = 1 - 0.14 * q;
        [M, p] = scaleRows(M, p, v);
      }
    }
    if (wob) [M, p] = scaleRows(M, p, wob);
    c.el.style.transform =
      `matrix3d(${M[0]},${M[3]},${M[6]},0,${M[1]},${M[4]},${M[7]},0,${M[2]},${M[5]},${M[8]},0,${p[0] * S},${p[1] * S},${p[2] * S},1)`;
  }
}

function applyView() {
  world.style.transform = `scale3d(${zoom},${zoom},${zoom}) rotateX(${rx}deg) rotateY(${ry}deg)`;
  shadow.style.transform = `translate(-50%, calc(var(--size, 300px) * ${0.8 * zoom})) scale(${zoom})`;
}

// CSS "rotateX(rx) rotateY(ry)": maps cube-space vectors to screen space
function viewMatrix() {
  const d = Math.PI / 180;
  return mul3(axisRot(0, rx * d), axisRot(1, ry * d));
}

function popSolved() {
  world.classList.remove('pop');
  void world.offsetWidth;
  world.classList.add('pop');
  setTimeout(() => world.classList.remove('pop'), 800);
}

/* ---------- committing moves ---------- */

function commit(m) {
  const R = quarterMat(m.axis, m.q);
  for (const c of cubies) {
    if (Math.abs(c.pos[m.axis] - m.layer) < 1e-6) {
      c.pos = mulV(R, c.pos);
      c.orient = mul3(R, c.orient);
    }
  }
}

const atHome = (c) => c.pos.every((v, i) => v === c.home[i]) && sameMat(c.orient, IDENT);

function isSolved() {
  const seen = [-1, -1, -1, -1, -1, -1];               // one colour per face
  for (const c of cubies) for (const s of c.stickers) {
    const v = [0, 0, 0];
    v[s.axis] = s.sign;
    const wn = mulV(c.orient, v);
    const ax = wn.findIndex((n) => n !== 0);
    const fi = faceIndex(ax, wn[ax]);
    if (seen[fi] === -1) seen[fi] = s.color;
    else if (seen[fi] !== s.color) return false;
  }
  return true;
}

function progress() {
  if (!cubies.length) return 1;
  if (isSolved()) return 1;
  return cubies.filter(atHome).length / cubies.length;
}

/* ---------- animation + queue ---------- */

const busy = () => turn !== null || queue.length > 0 || thinking;

function tween(from, to, dur, done) {
  const start = performance.now();
  const id = ++tweenId;
  const step = () => {
    if (id !== tweenId || !turn) return;
    const k = Math.min(1, Math.max(0, (performance.now() - start) / dur));
    let e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   // easeInOutCubic
    if (isJelly()) { const u = k - 1; e = 1 + 3.2 * u * u * u + 2.2 * u * u; turn.squish = Math.sin(Math.PI * k); }   // overshoot + squash
    turn.angle = from + (to - from) * e;
    render();
    if (k < 1) raf = requestAnimationFrame(step);
    else done();
  };
  raf = requestAnimationFrame(step);
}

function enqueue(m, kind = 'user', after = null) {
  queue.push({ m, kind, after });
  updateUI();
  pump();
}

// The speed is read when a move starts (and the pause when it ends), so dragging the
// Speed slider while the cube is scrambling or solving changes the pace straight away.
function pump() {
  if (turn || gapTimer || !queue.length) return;
  const item = queue.shift();
  turn = { axis: item.m.axis, layer: item.m.layer, angle: 0 };
  updateUI();
  const dur = moveMs() * Math.pow(Math.abs(item.m.q), 0.6);
  tween(0, item.m.q * HALF, dur, () => finishMove(item.m, item.kind, item.after));
}

function finishMove(m, kind, after) {
  commit(m);
  turn = null;
  render();
  if (isJelly()) startWobble(m.axis);
  bookkeep(m, kind);
  if (after) after();
  updateUI();
  // a short pause before the next queued move, so every turn can be followed
  if (queue.length) gapTimer = setTimeout(() => { gapTimer = 0; pump(); }, gapMs());
}

function bookkeep(m, kind) {
  sfx.turn(kind);
  const rec = (u) => { history.push({ axis: m.axis, layer: m.layer, q: m.q, u }); redoStack = []; };
  if (kind === 'user') {
    rec(true);
    moves++;
    if (state === 'ready') startTimer();
    if (state === 'running' && isSolved()) win();
  } else if (kind === 'scramble' || kind === 'solve' || kind === 'pattern') {
    rec(false);
    batch.done++;
  } else if (kind === 'step') {
    rec(false);
  }
}

/* ---------- game actions ---------- */

function randomMoves(count) {
  const o = (N - 1) / 2;
  const layers = [];
  if (N === 3) layers.push(-o, o);                       // classic: outer faces only
  else for (let i = 0; i < N; i++) layers.push(i - o);
  const out = [];
  let last = -1, lastLayer = null;
  while (out.length < count) {
    const axis = Math.floor(Math.random() * 3);
    const layer = layers[Math.floor(Math.random() * layers.length)];
    if (axis === last && layer === lastLayer) continue;  // never the same layer twice in a row
    if (axis === last && N === 3) continue;              // and avoid two turns on one axis (they can merge)
    last = axis; lastLayer = layer;
    const r = Math.random();
    out.push({ axis, layer, q: r < 0.4 ? 1 : r < 0.8 ? -1 : 2 });
  }
  return out;
}

function scramble() {
  if (busy()) return;
  hideWin();
  // keep the move history unless the cube is solved, so Solver can always find its way back
  if (isSolved()) resetCounters();
  else { stopTimer(); moves = 0; elapsed = 0; redoStack = []; }
  state = 'scrambling';
  const list = randomMoves({ 2: 12, 3: 18, 4: 30, 5: 40 }[N]);
  batch = { total: list.length, done: 0 };
  list.forEach((m, i) => enqueue(m, 'scramble', i === list.length - 1
    ? () => { state = 'ready'; elapsed = 0; toast('Go! Timer starts on your first move'); }
    : null));
}

function undo() {
  if (busy() || !history.length) return;
  const e = history.pop();
  redoStack.push(e);
  if (e.u) moves = Math.max(0, moves - 1);
  enqueue({ axis: e.axis, layer: e.layer, q: -e.q }, 'undo');
}

function redo() {
  if (busy() || !redoStack.length) return;
  const e = redoStack.pop();
  history.push(e);
  if (e.u) moves++;
  enqueue({ axis: e.axis, layer: e.layer, q: e.q }, 'redo');
}

function resetCounters() {
  stopTimer();
  history = [];
  redoStack = [];
  moves = 0;
  elapsed = 0;
  state = 'idle';
}

function resetCube() {
  hideWin();
  resetCounters();
  build();
  updateUI();
  popSolved();
}

function setSize(n) {
  if (n === N && cubies.length) return;
  N = n;
  try { localStorage.setItem('cube.size', String(n)); } catch (_) {}
  resetCube();
}

/* ---------- timer / best ---------- */

function startTimer() {
  state = 'running';
  t0 = performance.now();
  clearInterval(ticker);
  ticker = setInterval(() => { elapsed = performance.now() - t0; updateTime(); }, 50);
}
function stopTimer() { clearInterval(ticker); ticker = 0; }

const bestKey = () => `cube.best.${N}.classic`;
function getBest() {
  try { const v = parseFloat(localStorage.getItem(bestKey())); return isFinite(v) ? v : null; }
  catch (_) { return null; }
}

function fmt(ms) {
  const t = Math.floor(ms / 100) / 10;
  const m = Math.floor(t / 60);
  const s = (t - m * 60).toFixed(1).padStart(4, '0');
  return m + ':' + s;
}

function win() {
  stopTimer();
  elapsed = performance.now() - t0;
  state = 'done';
  const best = getBest();
  const isBest = best === null || elapsed < best;
  if (isBest) { try { localStorage.setItem(bestKey(), String(elapsed)); } catch (_) {} }
  sfx.win();
  $('win-time').textContent = fmt(elapsed);
  $('win-info').textContent = `${moves} moves · ${N}×${N}` + (isBest ? ' · new best!' : '');
  updateUI();
  popSolved();
  setTimeout(() => { if (state === 'done') $('win').hidden = false; }, 700);
}
const hideWin = () => { $('win').hidden = true; };

/* ---------- UI ---------- */

const pad2 = (n) => String(n).padStart(2, '0');
const moveText = () => `move ${pad2(Math.min(batch.done + 1, batch.total))} of ${pad2(batch.total)}`;

function describe() {
  switch (state) {
    case 'scrambling': return ['Scrambling', moveText(), 'red'];
    case 'thinking':   return ['Thinking…', 'planning the solve', 'yel'];
    case 'solving':    return ['Solving', moveText(), 'yel'];
    case 'pattern':    return ['Building', moveText(), 'yel'];
    case 'ready':      return ['Your move', 'timer starts on your first turn', ''];
    case 'running':    return ['In play', `${moves} ${moves === 1 ? 'move' : 'moves'}`, ''];
    case 'done':       return ['Solved!', `${fmt(elapsed)} · ${moves} moves`, 'ok'];
    default:
      return isSolved()
        ? ['Solved', `${N}×${N} cube`, 'ok']
        : ['Free play', 'turn any layer', ''];
  }
}

function updateTime() { setAll('.js-time', fmt(elapsed)); }

function updateUI() {
  updateTime();
  setAll('.js-moves', moves);
  setAll('.js-size', `${N}×${N}`);
  const best = getBest();
  setAll('.js-best', best === null ? '—' : fmt(best));

  const [label, detail, tone] = describe();
  $('state').textContent = label;
  $('detail').textContent = detail;
  $('chip-text').textContent = label;
  $('chip-dot').className = 'dot ' + tone;
  $('bar-fill').style.clipPath = `inset(0 ${(1 - progress()) * 100}% 0 0 round 999px)`;

  const b = busy();
  $('btn-scramble').disabled = b;
  $('btn-undo').disabled = b || history.length === 0;
  $('btn-redo').disabled = b || redoStack.length === 0;
  document.querySelectorAll('#sizes button').forEach((el) => el.classList.toggle('on', +el.dataset.n === N));
  refreshTools();
  // tool views change the panel's height on phones: keep the stage fitted around it
  const d = $('dock');
  if (d.offsetWidth + 'x' + d.offsetHeight !== lastDock) layout();
}

let toastTimer = 0;
function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ======================================================================
   Input: drag a sticker to turn a layer, drag the background to orbit
   ====================================================================== */

const pointers = new Map();
let drag = null;
let spin = { x: 0, y: 0, t: 0 };
let spinRaf = 0;

function inertia() {
  cancelAnimationFrame(spinRaf);
  const step = () => {
    spin.x *= 0.92; spin.y *= 0.92;
    if (Math.abs(spin.x) < 0.02 && Math.abs(spin.y) < 0.02) return;
    ry += spin.x;
    rx = clamp(rx + spin.y, -89, 89);
    applyView();
    spinRaf = requestAnimationFrame(step);
  };
  spinRaf = requestAnimationFrame(step);
}

stage.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  cancelAnimationFrame(spinRaf);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2 && drag && drag.mode === 'orbit') {
    const [a, b] = [...pointers.values()];
    drag = { mode: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), zoom0: zoom };
    return;
  }
  if (pointers.size > 1) return;

  const face = e.target.closest ? e.target.closest('.face[data-c]') : null;
  drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, samples: [] };
  if (face && !busy()) {
    const cubie = cubies[+face.dataset.c];
    const fi = +face.dataset.f;
    const local = [0, 0, 0];
    local[fi >> 1] = (fi & 1) ? 1 : -1;
    drag.mode = 'pending';
    drag.cubie = cubie;
    drag.n = mulV(cubie.orient, local);
  } else {
    drag.mode = 'orbit';
    spin = { x: 0, y: 0, t: 0 };
    stage.classList.add('grabbing');
  }
});

stage.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if (!drag) return;

  if (drag.mode === 'pinch') {
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      zoom = clamp(drag.zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / drag.dist, 0.5, 1.7);
      applyView();
    }
    return;
  }
  if (e.pointerId !== drag.id) return;

  if (drag.mode === 'orbit') {
    const dx = (e.clientX - drag.lx) * 0.45, dy = -(e.clientY - drag.ly) * 0.45;
    ry += dx;
    rx = clamp(rx + dy, -89, 89);
    spin = { x: dx, y: dy, t: performance.now() };
    drag.lx = e.clientX; drag.ly = e.clientY;
    applyView();
    return;
  }

  if (drag.mode === 'pending') {
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 7) return;
    beginLayerDrag(e.clientX - drag.sx, e.clientY - drag.sy);
  }
});

// A drag on a sticker picks the layer and the direction; the quarter turn itself then
// plays at the Speed you set, exactly like Undo / Redo / the Moves buttons.
function beginLayerDrag(dx, dy) {
  const n = drag.n;
  const nAxis = n.findIndex((v) => v !== 0);
  const V = viewMatrix();
  let best = null;
  for (let ax = 0; ax < 3; ax++) {
    if (ax === nAxis) continue;
    const e = [0, 0, 0]; e[ax] = 1;
    const v = mulV(V, e);
    const dot = dx * v[0] + dy * v[1];
    if (!best || Math.abs(dot) > Math.abs(best.dot)) best = { ax, dot, px: v[0], py: v[1] };
  }
  const sgn = best.dot >= 0 ? 1 : -1;
  const u = [0, 0, 0]; u[best.ax] = sgn;
  const a = cross(n, u);                       // axis that carries the sticker along u
  const axis = a.findIndex((v) => v !== 0);
  drag.mode = 'turned';                        // one quarter turn per gesture
  enqueue({ axis, layer: drag.cubie.pos[axis], q: a[axis] }, 'user');
}

function endPointer(e) {
  pointers.delete(e.pointerId);
  stage.classList.remove('grabbing');
  if (!drag) return;
  if (drag.mode === 'pinch') { if (pointers.size < 2) drag = null; return; }
  if (e.pointerId !== drag.id) return;

  if (drag.mode === 'orbit' && performance.now() - spin.t < 60) inertia();

  drag = null;
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);

stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoom = clamp(zoom * Math.exp(-e.deltaY * 0.0012), 0.5, 1.7);
  applyView();
}, { passive: false });

stage.addEventListener('contextmenu', (e) => e.preventDefault());

/* ---------- keyboard ---------- */

const FACE_KEYS = { r: [0, 1], l: [0, -1], u: [1, -1], d: [1, 1], f: [2, 1], b: [2, -1] };

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target && e.target.closest && e.target.closest('input, textarea')) return;   // typing a move sequence
  if (!$('help').hidden || !$('win').hidden || !$('styles').hidden) {
    if (e.key === 'Escape' || e.key === 'Enter') { $('help').hidden = true; $('styles').hidden = true; hideWin(); }
    return;
  }
  const k = e.key.toLowerCase();
  if (FACE_KEYS[k]) {
    const [axis, sign] = FACE_KEYS[k];
    // clockwise as seen from outside the face: q has the same sign as the layer side
    enqueue({ axis, layer: sign * (N - 1) / 2, q: e.shiftKey ? -sign : sign }, 'user');
    e.preventDefault();
  } else if (k === ' ') { scramble(); e.preventDefault(); }
  else if (k === 'z') undo();
  else if (k === 'y') redo();
  else if (k === '?' || k === 'h') $('help').hidden = false;
  else if (e.key === 'ArrowLeft')  { ry -= 12; applyView(); e.preventDefault(); }
  else if (e.key === 'ArrowRight') { ry += 12; applyView(); e.preventDefault(); }
  else if (e.key === 'ArrowUp')    { rx = clamp(rx + 12, -89, 89); applyView(); e.preventDefault(); }
  else if (e.key === 'ArrowDown')  { rx = clamp(rx - 12, -89, 89); applyView(); e.preventDefault(); }
});

/* ======================================================================
   Tools: notation, solver, patterns, moves, speed, fullscreen
   ====================================================================== */

const FACE_LETTER = [['L', 'R'], ['U', 'D'], ['B', 'F']];   // [axis][layer side > 0]

// a move as standard cube notation (R, U', F2, 2R ...)
function notate(m) {
  const o = (N - 1) / 2;
  let letter, side, prefix = '';
  if (Math.abs(m.layer) < 1e-9) {                 // middle slice of an odd cube
    letter = ['M', 'E', 'S'][m.axis];
    side = [-1, 1, 1][m.axis];                    // M follows L, E follows D, S follows F
  } else {
    side = m.layer > 0 ? 1 : -1;
    letter = FACE_LETTER[m.axis][side > 0 ? 1 : 0];
    const depth = Math.round(o - Math.abs(m.layer));
    if (depth > 0) prefix = String(depth + 1);
  }
  if (Math.abs(m.q) === 2) return prefix + letter + '2';
  return prefix + letter + (m.q * side > 0 ? '' : "'");
}

// "R U' 2L F2 M" -> moves for the current cube size
function parseMoves(text) {
  const tokens = text.replace(/[’‘]/g, "'").trim().split(/\s+/).filter(Boolean);
  const o = (N - 1) / 2, out = [];
  const FACES = { R: [0, 1], L: [0, -1], U: [1, -1], D: [1, 1], F: [2, 1], B: [2, -1] };
  for (const t of tokens) {
    const mt = /^(\d?)([RLUDFBMES])(2'?|')?$/.exec(t);
    if (!mt) return { error: t };
    const depth = (mt[1] ? +mt[1] : 1) - 1, ch = mt[2], mod = mt[3] || '';
    let axis, side, layer;
    if ('MES'.includes(ch)) {
      if (N % 2 === 0 || mt[1]) return { error: t };
      axis = 'MES'.indexOf(ch); side = [-1, 1, 1][axis]; layer = 0;
    } else {
      [axis, side] = FACES[ch];
      layer = side * (o - depth);
      if (o - depth < 0) return { error: t };
    }
    out.push({ axis, layer, q: mod[0] === '2' ? 2 : (mod === "'" ? -side : side) });
  }
  return { moves: out };
}

// cancel moves that undo each other; moves on one axis commute, so look back through the run
function simplify(list) {
  const out = [];
  for (const m of list) {
    let merged = false;
    for (let j = out.length - 1; j >= 0 && out[j].axis === m.axis; j--) {
      if (out[j].layer === m.layer) {
        const q = (((out[j].q + m.q) % 4) + 4) % 4;
        if (q === 0) out.splice(j, 1); else out[j] = { axis: m.axis, layer: m.layer, q: q === 3 ? -1 : q };
        merged = true;
        break;
      }
    }
    if (!merged) out.push({ axis: m.axis, layer: m.layer, q: m.q });
  }
  return out;
}

// every move so far is recorded, so playing them backwards always solves the cube
const solution = () => simplify(history.slice().reverse().map((e) => ({ axis: e.axis, layer: e.layer, q: -e.q })));

const locked = () => ['scrambling', 'thinking', 'solving', 'pattern'].includes(state);

function playSolution() {
  if (busy()) return;
  const steps = solution();
  if (!steps.length) { toast('Already solved'); return; }
  hideWin();
  stopTimer();
  state = 'thinking';
  thinking = true;
  updateUI();
  const g = epoch;
  setTimeout(() => {
    if (g !== epoch) return;
    thinking = false;
    state = 'solving';
    batch = { total: steps.length, done: 0 };
    steps.forEach((m, i) => enqueue(m, 'solve', i === steps.length - 1
      ? () => { resetCounters(); popSolved(); toast('Solved'); }
      : null));
  }, 700);
}

function stepSolution() {
  if (busy()) return;
  const steps = solution();
  if (!steps.length) { toast('Already solved'); return; }
  if (state === 'ready' || state === 'running') { stopTimer(); state = 'idle'; }   // no record time with hints
  enqueue(steps[0], 'step', () => {
    if (!solution().length) { resetCounters(); popSolved(); toast('Solved'); }
  });
}

const PATTERNS = [
  { name: 'Checkerboard',   note: 'Every face a chess board',           alg: "R2 L2 U2 D2 F2 B2" },
  { name: 'Six Spots',      note: 'One coloured dot on each face',      alg: "U D' R L' F B' U D'" },
  { name: 'Cube in a Cube', note: 'A small cube inside the big one',    alg: "F L F U' R U F2 L2 U' L' B D' B' L2 U" },
  { name: 'Superflip',      note: 'Every edge flipped, corners solved', alg: "U R2 F B R B2 R U2 L B2 R U' D' R2 F R' L B2 U2 F2" },
];

function applyPattern(p) {
  if (busy()) return;
  if (N !== 3) { toast('Patterns are made for the 3×3'); return; }
  setView('main');
  resetCube();
  const list = parseMoves(p.alg).moves;
  state = 'pattern';
  batch = { total: list.length, done: 0 };
  list.forEach((m, i) => enqueue(m, 'pattern', i === list.length - 1
    ? () => { state = 'idle'; toast(p.name); }
    : null));
}

function runMoves(text) {
  if (thinking || locked()) return false;
  const r = parseMoves(text);
  if (r.error) { toast('Unknown move: ' + r.error); return false; }
  if (!r.moves.length) return false;
  hideWin();
  r.moves.forEach((m) => enqueue(m, 'user'));
  return true;
}

/* ---------- panel views (main / solver / patterns / moves) ---------- */

function setView(v) {
  $('dock').dataset.view = v;
  refreshTools();
  layout();
}
document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.open)));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => setView('main')));

function refreshTools() {
  const view = $('dock').dataset.view;
  const b = busy();
  if (view === 'solver') {
    const steps = solution();
    const box = $('solver-chips');
    box.textContent = '';
    steps.forEach((m, i) => {
      const c = document.createElement('span');
      c.className = 'mv' + (i === 0 ? ' next' : '');
      c.textContent = notate(m);
      box.appendChild(c);
    });
    $('solver-info').textContent = steps.length
      ? steps.length + ' move' + (steps.length === 1 ? '' : 's') + ' to solve'
      : 'Nothing to solve — the cube is solved.';
    $('btn-solve-all').disabled = b || !steps.length;
    $('btn-step').disabled = b || !steps.length;
  } else if (view === 'patterns') {
    document.querySelectorAll('.pat').forEach((el) => { el.disabled = b || N !== 3; });
    $('pattern-note').textContent = N === 3
      ? 'Starts from a solved cube.'
      : 'Patterns are made for the 3×3 — switch size to use them.';
  } else if (view === 'moves') {
    document.querySelectorAll('#movegrid button, #moveform button').forEach((el) => { el.disabled = locked() || thinking; });
  }
}

function buildMoveGrid() {
  const grid = $('movegrid');
  if (!grid) return;
  const list = [];
  for (const f of ['U', 'D', 'L', 'R', 'F', 'B']) list.push(f, f + "'", f + '2');
  if (N % 2 === 1) for (const f of ['M', 'E', 'S']) list.push(f, f + "'");
  grid.textContent = '';
  for (const t of list) {
    const btn = document.createElement('button');
    btn.className = 'mini';
    btn.dataset.mv = t;
    btn.textContent = t;
    grid.appendChild(btn);
  }
  $('move-note').textContent = N > 3
    ? 'Inner layers: put a number first, e.g. 2R is the second layer from the right.'
    : "Type a sequence like R U R' U' and press Apply.";
}

(function buildPatternList() {
  const box = $('pattern-list');
  PATTERNS.forEach((p) => {
    const btn = document.createElement('button');
    btn.className = 'pat';
    btn.innerHTML = '<b></b><span></span>';
    btn.firstChild.textContent = p.name;
    btn.lastChild.textContent = p.note;
    btn.addEventListener('click', () => applyPattern(p));
    box.appendChild(btn);
  });
})();

$('movegrid').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) runMoves(b.dataset.mv);
});
$('moveform').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = $('moveinput');
  if (runMoves(inp.value)) inp.value = '';
});
$('btn-solve-all').addEventListener('click', playSolution);
$('btn-step').addEventListener('click', stepSolution);

/* ---------- speed ---------- */

// one quarter turn takes ~450 ms at 'Slower' and ~80 ms at 'Zoomin'' (smooth in between, as measured on the reference)
const moveMs = () => 450 * Math.pow(80 / 450, speedT);
// pause between queued moves: ~450 ms at 'Slower' down to ~40 ms at 'Zoomin''
const gapMs = () => 40 + 410 * Math.pow(1 - speedT, 1.5);
const speedName = () => speedT < 0.15 ? 'Slower' : speedT < 0.3 ? 'Slow' : speedT < 0.5 ? 'Medium' : speedT < 0.68 ? 'Fast' : speedT < 0.92 ? 'Faster' : "Zoomin'";
function paintSpeed() {
  $('speed').value = Math.round(speedT * 100);
  $('speed-label').textContent = speedName();
  $('speed').style.setProperty('--p', Math.round(speedT * 100) + '%');
}
$('speed').addEventListener('input', (e) => {
  speedT = e.target.value / 100;
  try { localStorage.setItem('cube.speed', String(speedT)); } catch (_) {}
  paintSpeed();
});

/* ---------- fullscreen ---------- */

(function () {
  const d = document, btn = $('btn-full');
  if (!(d.fullscreenEnabled || d.webkitFullscreenEnabled)) { btn.hidden = true; return; }   // e.g. iPhone Safari
  btn.addEventListener('click', () => {
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else {
      const el = d.documentElement;
      const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
      if (r && r.catch) r.catch(() => {});
    }
  });
})();

/* ======================================================================
   Styles (themes): everything — cube, background, cards — changes together
   ====================================================================== */

const THEMES = [
  { id: 'classic',  name: 'Sticker',   note: 'The original',     sw: ['#F4EFE6', '#F6CF1D', '#141414'] },
  { id: 'glass',    name: 'Glass',     note: 'Frosted & see-through', sw: ['#0d1b3a', '#7fb2ff', '#e8f4ff'] },
  { id: 'neon',     name: 'Neon Glow', note: 'Lit from within',  sw: ['#05060f', '#00f0ff', '#ff2bd6'] },
  { id: 'plasma',   name: 'Plasma',    note: 'Swirling energy',  sw: ['#12002b', '#ff3df0', '#2de2ff'] },
  { id: 'halftone', name: 'Halftone',  note: 'Pop-art print',    sw: ['#f4ecd8', '#ffd84a', '#111111'] },
  { id: 'clay',     name: 'Clay',      note: 'Soft & puffy',     sw: ['#efe7f7', '#ffe08a', '#9ec5ff'] },
  { id: 'fur',      name: 'Fur',       note: 'Warm & fuzzy',     sw: ['#e7cfae', '#f2b84b', '#4a2f1d'] },
  { id: 'metal',    name: 'Metal',     note: 'Brushed steel',    sw: ['#14181f', '#c9d2de', '#e0b84a'] },
  { id: 'jelly',    name: 'Squishy',   note: 'Wobbles when you twist', sw: ['#bfeaf7', '#6fb6ff', '#ffe47a'] },
  { id: 'pixel',    name: 'Pixel',     note: '8-bit',            sw: ['#1a1c2c', '#38b764', '#ffcd75'] },
];

function applyTheme(id, save = true) {
  if (!THEMES.some((t) => t.id === id)) id = 'classic';
  document.documentElement.dataset.theme = id;
  if (save) { try { localStorage.setItem('cube.theme', id); } catch (_) {} }
  document.querySelectorAll('.theme-tile').forEach((el) => el.classList.toggle('on', el.dataset.theme === id));
  wobble = null;
  if (cubies.length) { layout(); render(); }
}

(function buildThemeGrid() {
  const grid = $('theme-grid');
  THEMES.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'theme-tile';
    b.dataset.theme = t.id;
    b.innerHTML = '<i></i><b></b><span></span>';
    b.querySelector('i').style.background = `linear-gradient(135deg, ${t.sw[0]} 0 45%, ${t.sw[1]} 45% 72%, ${t.sw[2]} 72%)`;
    b.querySelector('b').textContent = t.name;
    b.querySelector('span').textContent = t.note;
    b.addEventListener('click', () => applyTheme(t.id));
    grid.appendChild(b);
  });
})();
const openStyles = () => { $('styles').hidden = false; };
$('btn-style').addEventListener('click', openStyles);
$('btn-style2').addEventListener('click', openStyles);
try { if (!localStorage.getItem('cube.styleHint')) { localStorage.setItem('cube.styleHint', '1'); setTimeout(() => toast('New: tap Style to change how the cube looks', 5200), 900); } } catch (_) {}
$('styles-close').addEventListener('click', () => { $('styles').hidden = true; });
$('styles').addEventListener('click', (e) => { if (e.target === $('styles')) $('styles').hidden = true; });
applyTheme(document.documentElement.dataset.theme || 'classic', false);

/* ---------- buttons ---------- */

$('btn-scramble').addEventListener('click', scramble);
$('btn-undo').addEventListener('click', undo);
$('btn-redo').addEventListener('click', redo);
$('btn-reset').addEventListener('click', resetCube);
function paintSound() {
  const b = $('btn-sound');
  b.classList.toggle('muted', sfx.muted);
  b.setAttribute('aria-pressed', String(!sfx.muted));
  b.setAttribute('aria-label', sfx.muted ? 'Sound off' : 'Sound on');
}
$('btn-sound').addEventListener('click', () => { sfx.setMuted(!sfx.muted); paintSound(); });
paintSound();
// browsers only allow audio after a user gesture
['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => sfx.unlock(), { once: true, capture: true }));
$('btn-help').addEventListener('click', () => { $('help').hidden = false; });
$('help-close').addEventListener('click', () => { $('help').hidden = true; });
$('win-again').addEventListener('click', () => { hideWin(); scramble(); });
$('help').addEventListener('click', (e) => { if (e.target === $('help')) $('help').hidden = true; });
$('sizes').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b && !busy()) setSize(+b.dataset.n);
});

window.addEventListener('resize', layout);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

/* ---------- start ---------- */

try {
  const saved = parseInt(localStorage.getItem('cube.size'), 10);
  if ([2, 3, 4, 5].includes(saved)) N = saved;
  const sp = parseFloat(localStorage.getItem('cube.speed'));
  if (isFinite(sp)) speedT = clamp(sp, 0, 1);
} catch (_) {}
paintSpeed();
build();
updateUI();
setTimeout(popSolved, 300);

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// handy for debugging / automated tests
window.__cube = {
  enqueue, isSolved, scramble, progress,
  get cubies() { return cubies; }, get state() { return state; },
  get history() { return history; }, get N() { return N; },
  parseMoves, notate, solution, simplify, PATTERNS, runMoves, redo, undo, moveMs, gapMs,
  get internals() { return { turn, queue: queue.length, gapTimer, thinking, state, tweenId, epoch }; },
};
})();
