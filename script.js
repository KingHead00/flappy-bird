// ── Canvas setup ──────────────────────────────────────
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const W      = canvas.width;
const H      = canvas.height;

// ── DOM refs ──────────────────────────────────────────
const scoreDisplay = document.getElementById('score-display');
const screenEl     = document.getElementById('screen');
const startScreen  = document.getElementById('start-screen');
const overScreen   = document.getElementById('over-screen');
const finalScore   = document.getElementById('final-score');
const bestBadge    = document.getElementById('best-badge');
const medalIcon    = document.getElementById('medal-icon');

// ── Game config ───────────────────────────────────────
const GRAVITY       = 0.45;
const FLAP_FORCE    = -8.5;
const PIPE_SPEED    = 2.8;
const PIPE_GAP      = 160;
const PIPE_WIDTH    = 58;
const PIPE_INTERVAL = 1700; // ms
const GROUND_H      = 80;
const BIRD_X        = 90;

// ── State ─────────────────────────────────────────────
let state       = 'start'; // start | playing | dead
let score       = 0;
let best        = parseInt(localStorage.getItem('flappy_best') || '0');
let bird, pipes, lastPipe, frame, animId, groundOffset;
let flashTimer  = 0;

// ── Cloud positions ───────────────────────────────────
const clouds = [
  { x: 60,  y: 80,  w: 80,  speed: 0.3  },
  { x: 200, y: 50,  w: 100, speed: 0.2  },
  { x: 310, y: 110, w: 70,  speed: 0.35 },
];

// ══════════════════════════════════════════════════════
//  SOUND ENGINE  (Web Audio API – no external files)
// ══════════════════════════════════════════════════════
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/**
 * Generic synth helper.
 * @param {number}   freq       - start frequency (Hz)
 * @param {number}   endFreq    - end frequency for sweep
 * @param {number}   duration   - sound duration (s)
 * @param {string}   type       - oscillator type
 * @param {number}   gainPeak   - peak gain (0–1)
 * @param {string}   curve      - 'exp' | 'linear'
 */
function playTone(freq, endFreq, duration, type = 'square', gainPeak = 0.4, curve = 'exp') {
  try {
    const ac  = getAudioCtx();
    const osc = ac.createOscillator();
    const gn  = ac.createGain();

    osc.connect(gn);
    gn.connect(ac.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ac.currentTime);

    if (curve === 'exp') {
      osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), ac.currentTime + duration);
    } else {
      osc.frequency.linearRampToValueAtTime(endFreq, ac.currentTime + duration);
    }

    gn.gain.setValueAtTime(gainPeak, ac.currentTime);
    gn.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);

    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + duration);
  } catch (e) {
    // AudioContext not available – silently skip
  }
}

/** Wing flap – short upward chirp */
function soundFlap() {
  playTone(380, 520, 0.1, 'sine', 0.28, 'exp');
}

/** Pipe passed – bright ding */
function soundScore() {
  playTone(880, 1320, 0.15, 'sine', 0.35, 'exp');
  // harmony
  setTimeout(() => playTone(1100, 1540, 0.12, 'sine', 0.2, 'exp'), 60);
}

/** Hit / death – crunch then descending noise */
function soundHit() {
  // thud
  playTone(200, 60, 0.18, 'sawtooth', 0.6, 'exp');
  // descending whine
  setTimeout(() => playTone(600, 80, 0.4, 'square', 0.3, 'exp'), 80);
}

/** Ground smack */
function soundSmack() {
  playTone(120, 40, 0.12, 'sawtooth', 0.7, 'exp');
}

// ══════════════════════════════════════════════════════
//  BIRD
// ══════════════════════════════════════════════════════
function createBird() {
  return {
    x:         BIRD_X,
    y:         H / 2 - 60,
    vy:        0,
    radius:    16,
    rotation:  0,
    wingAngle: 0,
    wingDir:   1,
    alive:     true,
  };
}

// ── Pipe generation ───────────────────────────────────
function createPipe() {
  const minTop = 80;
  const maxTop = H - GROUND_H - PIPE_GAP - 80;
  const topH   = minTop + Math.random() * (maxTop - minTop);
  return { x: W + 20, topH, scored: false };
}

// ── Init / reset ──────────────────────────────────────
function init() {
  bird         = createBird();
  pipes        = [];
  score        = 0;
  frame        = 0;
  groundOffset = 0;
  lastPipe     = 0;
  flashTimer   = 0;
  updateScoreDisplay(0);
}

// ── Flap ──────────────────────────────────────────────
function flap() {
  if (state === 'start') {
    state = 'playing';
    startScreen.style.display = 'none';
    screenEl.style.pointerEvents = 'none';
    lastPipe = performance.now();
  }

  if (state === 'playing' && bird.alive) {
    bird.vy       = FLAP_FORCE;
    bird.rotation = -28;
    soundFlap();
  }

  if (state === 'dead') {
    state = 'start';
    overScreen.style.display  = 'none';
    startScreen.style.display = 'flex';
    screenEl.style.pointerEvents = 'all';
    init();
  }
}

// ── Input ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    flap();
  }
});
document.getElementById('game-wrapper').addEventListener('pointerdown', flap);

// ── Collision ─────────────────────────────────────────
function checkCollision(pipe) {
  const bx = bird.x, by = bird.y, br = bird.radius - 3;
  const px = pipe.x, pw = PIPE_WIDTH;
  if (bx + br < px || bx - br > px + pw) return false;
  if (by - br < pipe.topH) return true;
  if (by + br > pipe.topH + PIPE_GAP) return true;
  return false;
}

// ── Score bump animation ──────────────────────────────
function updateScoreDisplay(val) {
  scoreDisplay.textContent = val;
  scoreDisplay.classList.remove('bump');
  void scoreDisplay.offsetWidth;
  scoreDisplay.classList.add('bump');
  setTimeout(() => scoreDisplay.classList.remove('bump'), 120);
}

// ── Die ───────────────────────────────────────────────
function die() {
  bird.alive = false;
  bird.vy    = -6;
  flashTimer = 8;
  soundHit();

  setTimeout(() => {
    soundSmack();
  }, 350);

  setTimeout(() => {
    state = 'dead';
    if (score > best) {
      best = score;
      localStorage.setItem('flappy_best', best);
    }
    finalScore.textContent = 'Score: ' + score;
    bestBadge.textContent  = '🏆 BEST: ' + best;
    medalIcon.textContent  = score >= 30 ? '🥇' : score >= 15 ? '🥈' : score >= 5 ? '🥉' : '💀';
    overScreen.style.display     = 'flex';
    screenEl.style.pointerEvents = 'all';
  }, 900);
}

// ══════════════════════════════════════════════════════
//  DRAWING
// ══════════════════════════════════════════════════════
function drawSky() {
  const grad = ctx.createLinearGradient(0, 0, 0, H - GROUND_H);
  grad.addColorStop(0, '#4ec0ca');
  grad.addColorStop(1, '#b8e8f0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H - GROUND_H);
}

function drawClouds() {
  clouds.forEach(c => {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle   = '#fff';
    ctx.beginPath();
    ctx.arc(c.x,              c.y,              c.w * 0.30,  0, Math.PI * 2);
    ctx.arc(c.x + c.w * 0.25, c.y - c.w * 0.12, c.w * 0.22, 0, Math.PI * 2);
    ctx.arc(c.x + c.w * 0.50, c.y,              c.w * 0.28,  0, Math.PI * 2);
    ctx.arc(c.x + c.w * 0.75, c.y + c.w * 0.05, c.w * 0.20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawGround() {
  // dirt
  const grad = ctx.createLinearGradient(0, H - GROUND_H, 0, H);
  grad.addColorStop(0, '#ded895');
  grad.addColorStop(1, '#c8b060');
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
  // grass strip
  ctx.fillStyle = '#5abf5a';
  ctx.fillRect(0, H - GROUND_H, W, 12);
  // tufts
  ctx.fillStyle = '#3fa33f';
  for (let gx = (groundOffset % 20) - 20; gx < W; gx += 20) {
    ctx.fillRect(gx,      H - GROUND_H,      2, 10);
    ctx.fillRect(gx + 6,  H - GROUND_H,      2, 14);
    ctx.fillRect(gx + 12, H - GROUND_H,      2,  8);
  }
  // ground line
  ctx.strokeStyle = '#a07830';
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(0, H - GROUND_H + 12);
  ctx.lineTo(W, H - GROUND_H + 12);
  ctx.stroke();
}

function drawPipe(pipe) {
  const { x, topH } = pipe;
  const pw      = PIPE_WIDTH;
  const capH    = 22;
  const capExtra = 6;

  // helper: horizontal gradient for pipe body
  function pipeBodyGrad(x) {
    const g = ctx.createLinearGradient(x, 0, x + pw, 0);
    g.addColorStop(0,    '#4aad4a');
    g.addColorStop(0.25, '#6dcc6d');
    g.addColorStop(0.75, '#4aad4a');
    g.addColorStop(1,    '#2e7a2e');
    return g;
  }
  function pipeCapGrad(x) {
    const g = ctx.createLinearGradient(x - capExtra, 0, x + pw + capExtra, 0);
    g.addColorStop(0,   '#3a9a3a');
    g.addColorStop(0.3, '#68cc68');
    g.addColorStop(0.7, '#3a9a3a');
    g.addColorStop(1,   '#1e6a1e');
    return g;
  }

  // ── Top pipe ──────────────────────────────────────────
  ctx.fillStyle = pipeBodyGrad(x);
  ctx.fillRect(x, 0, pw, topH);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 8, 0, 8, topH);

  ctx.fillStyle = pipeCapGrad(x);
  ctx.beginPath();
  ctx.roundRect(x - capExtra, topH - capH, pw + capExtra * 2, capH, [4, 4, 0, 0]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x - capExtra + 8, topH - capH + 4, 12, capH - 8);

  // ── Bottom pipe ──────────────────────────────────────
  const botY = topH + PIPE_GAP;
  const botH = H - GROUND_H - botY;

  ctx.fillStyle = pipeBodyGrad(x);
  ctx.fillRect(x, botY, pw, botH);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(x + 8, botY, 8, botH);

  ctx.fillStyle = pipeCapGrad(x);
  ctx.beginPath();
  ctx.roundRect(x - capExtra, botY, pw + capExtra * 2, capH, [0, 0, 4, 4]);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(x - capExtra + 8, botY + 4, 12, capH - 8);
}

function drawBird() {
  const { x, y, rotation, wingAngle } = bird;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation * Math.PI / 180);

  const r = bird.radius;

  // shadow
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle   = '#000';
  ctx.beginPath();
  ctx.ellipse(2, r + 4, r * 0.8, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // wing
  ctx.fillStyle = '#e8a820';
  ctx.beginPath();
  const wingY = Math.sin(wingAngle) * 5;
  ctx.ellipse(-4, 2 + wingY, r * 0.6, r * 0.35, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // body
  const bg = ctx.createRadialGradient(-4, -4, 2, 0, 0, r);
  bg.addColorStop(0,   '#ffe84e');
  bg.addColorStop(0.6, '#f7c818');
  bg.addColorStop(1,   '#d99000');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  // belly
  ctx.fillStyle = 'rgba(255,255,220,0.55)';
  ctx.beginPath();
  ctx.ellipse(3, 4, r * 0.55, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // eye white
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(6, -4, 6, 0, Math.PI * 2);
  ctx.fill();
  // pupil
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(7.5, -4, 3, 0, Math.PI * 2);
  ctx.fill();
  // gleam
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(8.5, -5.5, 1.2, 0, Math.PI * 2);
  ctx.fill();

  // beak
  ctx.fillStyle = '#f07828';
  ctx.beginPath();
  ctx.moveTo(r - 2,  -1);
  ctx.lineTo(r + 9,   2);
  ctx.lineTo(r - 2,   6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c05010';
  ctx.lineWidth   = 1;
  ctx.stroke();

  ctx.restore();
}

// ══════════════════════════════════════════════════════
//  UPDATE
// ══════════════════════════════════════════════════════
function update(now) {
  frame++;

  // drift clouds
  clouds.forEach(c => {
    c.x -= c.speed;
    if (c.x + c.w < 0) c.x = W + 20;
  });

  if (state !== 'playing') {
    // idle hover
    bird.y         = H / 2 - 60 + Math.sin(frame * 0.06) * 8;
    bird.wingAngle += 0.18;
    bird.rotation  = Math.sin(frame * 0.06) * 6;
    return;
  }

  // physics
  bird.vy        += GRAVITY;
  bird.y         += bird.vy;
  bird.wingAngle += 0.25;

  // smooth rotation
  const targetRot = Math.min(Math.max(bird.vy * 4, -28), 85);
  bird.rotation  += (targetRot - bird.rotation) * 0.12;

  groundOffset += PIPE_SPEED;

  // spawn pipes
  if (now - lastPipe > PIPE_INTERVAL) {
    pipes.push(createPipe());
    lastPipe = now;
  }

  // move pipes
  pipes.forEach(p => {
    p.x -= PIPE_SPEED;

    // score point
    if (!p.scored && p.x + PIPE_WIDTH < bird.x) {
      p.scored = true;
      score++;
      updateScoreDisplay(score);
      soundScore();
    }

    // collision
    if (bird.alive && checkCollision(p)) die();
  });

  // remove off-screen pipes
  pipes = pipes.filter(p => p.x + PIPE_WIDTH + 30 > 0);

  // boundaries
  if (bird.alive) {
    if (bird.y + bird.radius > H - GROUND_H) {
      bird.y  = H - GROUND_H - bird.radius;
      bird.vy = 0;
      die();
    }
    if (bird.y - bird.radius < 0) {
      bird.y  = bird.radius;
      bird.vy = 2;
    }
  } else {
    // dead fall – stop at ground
    if (bird.y + bird.radius > H - GROUND_H + 40) {
      bird.vy = 0;
    }
  }

  if (flashTimer > 0) flashTimer--;
}

// ══════════════════════════════════════════════════════
//  DRAW
// ══════════════════════════════════════════════════════
function draw() {
  ctx.clearRect(0, 0, W, H);

  // death flash
  if (flashTimer > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flashTimer / 8})`;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  drawSky();
  drawClouds();
  pipes.forEach(drawPipe);
  drawGround();
  drawBird();
}

// ══════════════════════════════════════════════════════
//  LOOP & BOOT
// ══════════════════════════════════════════════════════
function loop(now) {
  update(now);
  draw();
  requestAnimationFrame(loop);
}

bestBadge.textContent = '🏆 BEST: ' + best;
init();
requestAnimationFrame(loop);
