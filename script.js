/* ════════════════════════════════════════════════════
   game.js  –  Flappy Bird
   Depends on: index.html  +  style.css
   ════════════════════════════════════════════════════ */

"use strict";

/* ── Canvas ──────────────────────────────────────── */
const canvas = document.getElementById("gameCanvas");
const ctx    = canvas.getContext("2d");
const W      = canvas.width;   // 360
const H      = canvas.height;  // 640

/* ── DOM refs ────────────────────────────────────── */
const scoreDisplay = document.getElementById("score-display");
const screenEl     = document.getElementById("screen");
const startScreen  = document.getElementById("start-screen");
const overScreen   = document.getElementById("over-screen");
const finalScoreEl = document.getElementById("final-score");
const bestBadgeEl  = document.getElementById("best-badge");
const medalIconEl  = document.getElementById("medal-icon");

/* ── Constants ───────────────────────────────────── */
const GRAVITY       = 0.42;
const FLAP_FORCE    = -8.8;
const PIPE_SPEED    = 2.8;
const PIPE_GAP      = 162;
const PIPE_W        = 58;
const PIPE_MS       = 1700;   // ms between pipe spawns
const GROUND_H      = 82;
const BIRD_X        = 88;
const BIRD_R        = 17;     // bird body radius

/* ── Game state ──────────────────────────────────── */
let phase;          // "start" | "playing" | "dead"
let score, best, frame, groundOff, lastPipeTime, flashFrames;
let bird, pipes;

best = parseInt(localStorage.getItem("fb_best") || "0", 10);

/* ── Clouds (purely decorative) ──────────────────── */
const CLOUDS = [
  { x: 50,  y: 75,  s: 0.28 },
  { x: 200, y: 48,  s: 0.18 },
  { x: 300, y: 115, s: 0.32 },
];

/* ════════════════════════════════════════════════════
   AUDIO  (Web Audio API – zero external files)
   ════════════════════════════════════════════════════ */
let _ac = null;
function ac() {
  if (!_ac) _ac = new (window.AudioContext || window.webkitAudioContext)();
  return _ac;
}

function tone(freq0, freq1, dur, type, vol, when) {
  try {
    const t   = when ?? ac().currentTime;
    const osc = ac().createOscillator();
    const gain= ac().createGain();
    osc.connect(gain);
    gain.connect(ac().destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(freq1, 1), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
  } catch (_) {}
}

function sfxFlap()  { tone(400, 560, 0.09, "sine",     0.25); }
function sfxScore() {
  tone(880,  1320, 0.13, "sine", 0.30);
  tone(1100, 1540, 0.10, "sine", 0.18, ac().currentTime + 0.07);
}
function sfxHit() {
  tone(220, 55,  0.20, "sawtooth", 0.55);
  tone(600, 80,  0.38, "square",   0.28, ac().currentTime + 0.08);
}
function sfxSmack() { tone(130, 40, 0.14, "sawtooth", 0.65); }

/* ════════════════════════════════════════════════════
   INIT / RESET
   ════════════════════════════════════════════════════ */
function init() {
  bird = {
    x: BIRD_X,
    y: H / 2 - 60,
    vy: 0,
    rot: 0,          // degrees
    wing: 0,         // wing flap angle
    alive: true,
  };
  pipes        = [];
  score        = 0;
  frame        = 0;
  groundOff    = 0;
  lastPipeTime = 0;
  flashFrames  = 0;
  setScore(0);
}

function setScore(v) {
  scoreDisplay.textContent = v;
  scoreDisplay.classList.remove("bump");
  void scoreDisplay.offsetWidth;    // force reflow
  scoreDisplay.classList.add("bump");
}

/* ════════════════════════════════════════════════════
   INPUT
   ════════════════════════════════════════════════════ */
function onFlap() {
  if (phase === "start") {
    phase = "playing";
    startScreen.style.display  = "none";
    screenEl.style.pointerEvents = "none";
    lastPipeTime = performance.now();
    doFlap();
    return;
  }
  if (phase === "playing" && bird.alive) {
    doFlap();
    return;
  }
  if (phase === "dead") {
    phase = "start";
    overScreen.style.display   = "none";
    startScreen.style.display  = "flex";
    screenEl.style.pointerEvents = "all";
    init();
  }
}

function doFlap() {
  bird.vy  = FLAP_FORCE;
  bird.rot = -28;
  sfxFlap();
}

document.addEventListener("keydown", e => {
  if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); onFlap(); }
});
document.getElementById("game-wrapper").addEventListener("pointerdown", onFlap);

/* ════════════════════════════════════════════════════
   COLLISION
   ════════════════════════════════════════════════════ */
function hits(pipe) {
  const bx = bird.x, by = bird.y, br = BIRD_R - 4;
  if (bx + br < pipe.x || bx - br > pipe.x + PIPE_W) return false;
  return (by - br < pipe.topH) || (by + br > pipe.topH + PIPE_GAP);
}

/* ════════════════════════════════════════════════════
   DEATH
   ════════════════════════════════════════════════════ */
function killBird() {
  bird.alive  = false;
  bird.vy     = -5;
  flashFrames = 8;
  sfxHit();
  setTimeout(sfxSmack, 380);
  setTimeout(() => {
    phase = "dead";
    if (score > best) { best = score; localStorage.setItem("fb_best", best); }
    finalScoreEl.textContent = "Score: " + score;
    bestBadgeEl.textContent  = "\uD83C\uDFC6 BEST: " + best;
    medalIconEl.textContent  = score >= 30 ? "\uD83E\uDD47"
                             : score >= 15 ? "\uD83E\uDD48"
                             : score >= 5  ? "\uD83E\uDD49"
                             : "\uD83D\uDC80";
    overScreen.style.display    = "flex";
    screenEl.style.pointerEvents = "all";
  }, 950);
}

/* ════════════════════════════════════════════════════
   UPDATE
   ════════════════════════════════════════════════════ */
function update(now) {
  frame++;

  /* clouds drift */
  CLOUDS.forEach(c => { c.x -= c.s; if (c.x < -130) c.x = W + 20; });

  if (phase !== "playing") {
    /* idle hover */
    bird.y    = H / 2 - 60 + Math.sin(frame * 0.055) * 9;
    bird.wing += 0.15;
    bird.rot   = Math.sin(frame * 0.055) * 7;
    return;
  }

  /* physics */
  bird.vy   += GRAVITY;
  bird.y    += bird.vy;
  bird.wing += 0.28;

  const targetRot = Math.min(Math.max(bird.vy * 4.5, -30), 88);
  bird.rot       += (targetRot - bird.rot) * 0.14;

  groundOff += PIPE_SPEED;

  /* spawn pipes */
  if (now - lastPipeTime > PIPE_MS) {
    const minH = 80;
    const maxH = H - GROUND_H - PIPE_GAP - 80;
    pipes.push({ x: W + 10, topH: minH + Math.random() * (maxH - minH), passed: false });
    lastPipeTime = now;
  }

  /* move + score + collide */
  pipes.forEach(p => {
    p.x -= PIPE_SPEED;
    if (!p.passed && p.x + PIPE_W < bird.x) {
      p.passed = true;
      score++;
      setScore(score);
      sfxScore();
    }
    if (bird.alive && hits(p)) killBird();
  });
  pipes = pipes.filter(p => p.x + PIPE_W + 20 > 0);

  /* boundaries */
  if (bird.alive) {
    if (bird.y + BIRD_R > H - GROUND_H) { bird.y = H - GROUND_H - BIRD_R; killBird(); }
    if (bird.y - BIRD_R < 0)            { bird.y = BIRD_R; bird.vy = 1; }
  } else {
    if (bird.y + BIRD_R > H - GROUND_H + 50) bird.vy = 0;
  }

  if (flashFrames > 0) flashFrames--;
}

/* ════════════════════════════════════════════════════
   DRAW HELPERS
   ════════════════════════════════════════════════════ */
function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H - GROUND_H);
  g.addColorStop(0,   "#3ab8d0");
  g.addColorStop(0.6, "#82d8e8");
  g.addColorStop(1,   "#c0eef5");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H - GROUND_H);
}

function drawClouds() {
  CLOUDS.forEach(c => {
    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle   = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.08)";
    ctx.shadowBlur  = 6;
    function puff(ox, oy, r) {
      ctx.beginPath(); ctx.arc(c.x + ox, c.y + oy, r, 0, Math.PI * 2); ctx.fill();
    }
    puff(0,   0,  22);
    puff(28, -8,  18);
    puff(55,  0,  20);
    puff(80,  5,  15);
    ctx.restore();
  });
}

function drawGround() {
  /* dirt */
  const g = ctx.createLinearGradient(0, H - GROUND_H, 0, H);
  g.addColorStop(0, "#ddd890");
  g.addColorStop(1, "#c2a850");
  ctx.fillStyle = g;
  ctx.fillRect(0, H - GROUND_H, W, GROUND_H);

  /* grass */
  ctx.fillStyle = "#58bb58";
  ctx.fillRect(0, H - GROUND_H, W, 14);

  /* grass detail */
  ctx.fillStyle = "#3d9e3d";
  const off = groundOff % 24;
  for (let gx = -24 + off; gx < W + 24; gx += 24) {
    ctx.fillRect(gx,      H - GROUND_H,      3, 12);
    ctx.fillRect(gx + 8,  H - GROUND_H,      3, 16);
    ctx.fillRect(gx + 16, H - GROUND_H,      3, 10);
  }

  /* dirt line */
  ctx.strokeStyle = "#9a7228";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(0, H - GROUND_H + 14);
  ctx.lineTo(W, H - GROUND_H + 14);
  ctx.stroke();
}

function drawPipe(p) {
  const { x, topH } = p;
  const cap = 22, capX = 6;

  function bodyGrad() {
    const g = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
    g.addColorStop(0,    "#3aaa3a");
    g.addColorStop(0.22, "#68cc68");
    g.addColorStop(0.78, "#3aaa3a");
    g.addColorStop(1,    "#1e6e1e");
    return g;
  }
  function capGrad() {
    const g = ctx.createLinearGradient(x - capX, 0, x + PIPE_W + capX, 0);
    g.addColorStop(0,    "#2e8a2e");
    g.addColorStop(0.28, "#70d870");
    g.addColorStop(0.72, "#2e8a2e");
    g.addColorStop(1,    "#1a5a1a");
    return g;
  }

  /* top pipe body */
  ctx.fillStyle = bodyGrad();
  ctx.fillRect(x, 0, PIPE_W, topH - cap);
  /* top pipe shine */
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(x + 9, 0, 9, topH - cap);
  /* top cap */
  ctx.fillStyle = capGrad();
  ctx.beginPath();
  ctx.roundRect(x - capX, topH - cap, PIPE_W + capX * 2, cap, [5, 5, 0, 0]);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(x - capX + 10, topH - cap + 5, 14, cap - 10);

  /* bottom pipe body */
  const botY = topH + PIPE_GAP;
  const botH = H - GROUND_H - botY;
  ctx.fillStyle = bodyGrad();
  ctx.fillRect(x, botY + cap, PIPE_W, botH - cap);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(x + 9, botY + cap, 9, botH - cap);
  /* bottom cap */
  ctx.fillStyle = capGrad();
  ctx.beginPath();
  ctx.roundRect(x - capX, botY, PIPE_W + capX * 2, cap, [0, 0, 5, 5]);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(x - capX + 10, botY + 5, 14, cap - 10);
}

/* ════════════════════════════════════════════════════
   DRAW BIRD  –  proper bird silhouette
   ════════════════════════════════════════════════════ */
function drawBird() {
  const { x, y, rot, wing, alive } = bird;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rot * Math.PI) / 180);

  const R = BIRD_R;

  /* ── drop shadow ── */
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(2, R + 5, R * 0.85, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* ── tail feathers ── */
  ctx.save();
  ctx.fillStyle = "#1a6ba0";
  /* three overlapping feather triangles fanning left */
  [[-8, 3], [-6, 8], [-6, -3]].forEach(([ox, oy]) => {
    ctx.beginPath();
    ctx.moveTo(-R + 2, oy);
    ctx.lineTo(-R - 14 + ox, oy - 4);
    ctx.lineTo(-R - 10 + ox, oy + 5);
    ctx.closePath();
    ctx.fill();
  });
  ctx.restore();

  /* ── lower wing (behind body) ── */
  const wFold = Math.sin(wing) * 0.55; // -0.55..0.55
  ctx.save();
  ctx.fillStyle = "#1d8fd0";
  ctx.beginPath();
  ctx.ellipse(-3, 4 + wFold * 10, R * 0.72, R * 0.36, -0.25 + wFold * 0.3, 0, Math.PI * 2);
  ctx.fill();
  // wing tip darker
  ctx.fillStyle = "#1570aa";
  ctx.beginPath();
  ctx.ellipse(-8, 6 + wFold * 12, R * 0.4, R * 0.18, -0.4 + wFold * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* ── body ── */
  const bodyGrad = ctx.createRadialGradient(-4, -5, 2, 0, 0, R);
  bodyGrad.addColorStop(0,   "#ffe566");
  bodyGrad.addColorStop(0.5, "#f5c000");
  bodyGrad.addColorStop(1,   "#c88000");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  /* slightly oval body */
  ctx.ellipse(0, 0, R, R * 0.88, 0, 0, Math.PI * 2);
  ctx.fill();

  /* body outline */
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, R, R * 0.88, 0, 0, Math.PI * 2);
  ctx.stroke();

  /* ── chest / belly patch ── */
  const bellyGrad = ctx.createRadialGradient(4, 5, 1, 4, 5, R * 0.55);
  bellyGrad.addColorStop(0, "rgba(255,245,200,0.80)");
  bellyGrad.addColorStop(1, "rgba(255,220,120,0.00)");
  ctx.fillStyle = bellyGrad;
  ctx.beginPath();
  ctx.ellipse(5, 5, R * 0.55, R * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  /* ── upper wing stripe ── */
  ctx.save();
  ctx.fillStyle = "#e8a000";
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.ellipse(-2, -3 + wFold * 6, R * 0.55, R * 0.22, -0.3 + wFold * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* ── eye white ── */
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(7, -5, 6.5, 0, Math.PI * 2);
  ctx.fill();

  /* ── eye ring ── */
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.arc(7, -5, 6.5, 0, Math.PI * 2);
  ctx.stroke();

  /* ── pupil ── */
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(8.2, -5, 3.2, 0, Math.PI * 2);
  ctx.fill();

  /* ── eye gleam ── */
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(9.4, -6.5, 1.4, 0, Math.PI * 2);
  ctx.fill();

  /* ── beak – two triangular halves ── */
  // upper mandible
  ctx.fillStyle = "#f07010";
  ctx.beginPath();
  ctx.moveTo(R - 1, -2);
  ctx.lineTo(R + 11, 1);
  ctx.lineTo(R - 1,  1);
  ctx.closePath();
  ctx.fill();
  // lower mandible
  ctx.fillStyle = "#d05000";
  ctx.beginPath();
  ctx.moveTo(R - 1, 1);
  ctx.lineTo(R + 10, 3);
  ctx.lineTo(R - 1,  5);
  ctx.closePath();
  ctx.fill();
  // beak outline
  ctx.strokeStyle = "rgba(0,0,0,0.25)";
  ctx.lineWidth   = 0.8;
  ctx.beginPath();
  ctx.moveTo(R - 1, -2);
  ctx.lineTo(R + 11, 1);
  ctx.lineTo(R - 1,  5);
  ctx.stroke();
  // beak gap line
  ctx.beginPath();
  ctx.moveTo(R, 1); ctx.lineTo(R + 10, 1);
  ctx.stroke();

  /* ── dead eyes X ── */
  if (!alive) {
    ctx.strokeStyle = "#e00";
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = "round";
    [[-2, -2, 2, 2], [-2, 2, 2, -2]].forEach(([x1,y1,x2,y2]) => {
      ctx.beginPath();
      ctx.moveTo(7 + x1, -5 + y1);
      ctx.lineTo(7 + x2, -5 + y2);
      ctx.stroke();
    });
  }

  ctx.restore();
}

/* ════════════════════════════════════════════════════
   DRAW (full frame)
   ════════════════════════════════════════════════════ */
function draw() {
  ctx.clearRect(0, 0, W, H);

  if (flashFrames > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flashFrames / 8})`;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  drawSky();
  drawClouds();
  pipes.forEach(drawPipe);
  drawGround();
  drawBird();
}

/* ════════════════════════════════════════════════════
   MAIN LOOP
   ════════════════════════════════════════════════════ */
function loop(now) {
  update(now);
  draw();
  requestAnimationFrame(loop);
}

/* ── Boot ────────────────────────────────────────── */
bestBadgeEl.textContent = "\uD83C\uDFC6 BEST: " + best;
phase = "start";
init();
requestAnimationFrame(loop);
