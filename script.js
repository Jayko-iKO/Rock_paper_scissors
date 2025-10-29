
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

function resizeCanvasToDisplaySize() {
  // Get CSS size
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  // Get device pixel ratio
  const dpr = window.devicePixelRatio || 1;
  // Set actual canvas size
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  // Scale context so all drawing is in CSS pixels
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  // Compute RADIUS proportionally so items are slightly larger on small screens
  let scale = 0.03; // default 3% of width
  if (cssWidth < 400) scale = 0.05; // very small phones: a bit larger
  else if (cssWidth < 600) scale = 0.045; // small phones
  else if (cssWidth < 900) scale = 0.038; // tablets / large phones
  else scale = 0.032;
  const computed = Math.round(cssWidth * scale);
  RADIUS = Math.max(10, Math.min(48, computed));
}

let RADIUS = 24;
window.addEventListener('resize', resizeCanvasToDisplaySize);
resizeCanvasToDisplaySize();
const SUBSTEPS = 8; // increased substeps to reduce numeric penetration
const NUM_PER = 10;
const TOTAL = NUM_PER * 3;
const INITIAL = { ROCK: 0, PAPER: 1, SCISSORS: 2 };

let items = [], running = false, last = performance.now(), arenaShape = 'rectangle';
let startTime = 0, elapsed = 0;
const IMG = {};
// End-of-game animation state
let endAnimActive = false, endAnimStart = 0, endTimeVal = 0;
const endAnimDuration = 3000; // ms
let particles = [];
// Debugging helpers
let DEBUG = false;
const debugLogged = new Set();

window.addEventListener('keydown', (e) => {
  if (e.key === 'd' || e.key === 'D') {
    DEBUG = !DEBUG;
    console.log('DEBUG overlay', DEBUG);
  }
});

function startEndAnimation(finalSeconds) {
  endAnimActive = true;
  endAnimStart = performance.now();
  endTimeVal = finalSeconds;
  particles = [];
  // spawn confetti particles
  const count = 80;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 4;
  particles.push({
  x: canvas.clientWidth / 2,
  y: canvas.clientHeight / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      ang: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.3,
      size: 6 + Math.random() * 8,
      color: `hsl(${Math.floor(Math.random()*360)},70%,60%)`,
      life: 1
    });
  }
}

// Load images
['rock', 'paper', 'scissors'].forEach(k => {
  const img = new Image();
  img.src = k + '.png';
  IMG[k] = img;
});

// Draw arena
function drawArena() {
  let w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.save(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.setLineDash([8, 4]); ctx.beginPath();

  if (arenaShape === 'square') {
    const size = Math.min(w, h) - 2 * RADIUS;
    const x0 = (w - size) / 2;
    const y0 = (h - size) / 2;
    ctx.rect(x0, y0, size, size);
  } else if (arenaShape === 'rectangle') {
    ctx.rect(RADIUS, RADIUS, w - 2 * RADIUS, h - 2 * RADIUS);
  } else if (arenaShape === 'circle') {
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - RADIUS;
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  } else if (arenaShape === 'triangle') {
    const A = { x: w / 2, y: RADIUS }, B = { x: RADIUS, y: h - RADIUS }, C = { x: w - RADIUS, y: h - RADIUS };
    ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.lineTo(C.x, C.y); ctx.closePath();
  }
  ctx.stroke(); ctx.restore();
}

// Random position inside shape
function randomInside(shape) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (shape === 'square') {
    const size = Math.min(w, h) - 2 * RADIUS;
    const x0 = (w - size) / 2, y0 = (h - size) / 2;
    return { x: x0 + Math.random() * size, y: y0 + Math.random() * size };
  }
  if (shape === 'rectangle') return { x: RADIUS + Math.random() * (w - 2 * RADIUS), y: RADIUS + Math.random() * (h - 2 * RADIUS) };
  if (shape === 'circle') {
    const cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - RADIUS;
    const a = Math.random() * 2 * Math.PI, rad = Math.sqrt(Math.random()) * r;
    return { x: cx + rad * Math.cos(a), y: cy + rad * Math.sin(a) };
  }
  if (shape === 'triangle') {
    const A = { x: w / 2, y: RADIUS }, B = { x: RADIUS, y: h - RADIUS }, C = { x: w - RADIUS, y: h - RADIUS };
    let t = Math.random(), s = Math.random(); if (t + s > 1) { t = 1 - t; s = 1 - s; }
    return { x: A.x * t + B.x * s + C.x * (1 - t - s), y: A.y * t + B.y * s + C.y * (1 - t - s) };
  }
  return { x: w / 2, y: h / 2 };
}

// Create items
function createItems() {
  items = [];
  const types = [];
  for (let i = 0; i < NUM_PER; i++) types.push(INITIAL.ROCK, INITIAL.PAPER, INITIAL.SCISSORS);
  for (let i = types.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[types[i], types[j]] = [types[j], types[i]]; }
  for (let i = 0; i < TOTAL; i++) {
    const pos = randomInside(arenaShape);
    const speed = Math.random() * 1 + 0.8;
    const angle = Math.random() * Math.PI * 2;
    items.push({ x: pos.x, y: pos.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, type: types[i] });
  }
  updateCounts();
}

// Update counts
function updateCounts() {
  document.getElementById('countRock').innerText = items.filter(i => i.type === INITIAL.ROCK).length;
  document.getElementById('countPaper').innerText = items.filter(i => i.type === INITIAL.PAPER).length;
  document.getElementById('countScissors').innerText = items.filter(i => i.type === INITIAL.SCISSORS).length;
}

// Check beats
function beats(a, b) { return (a === INITIAL.ROCK && b === INITIAL.SCISSORS) || (a === INITIAL.SCISSORS && b === INITIAL.PAPER) || (a === INITIAL.PAPER && b === INITIAL.ROCK); }

// Check point inside triangle
function pointInTriangle(p, A, B, C) {
  const det = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y);
  const l1 = ((B.y - C.y) * (p.x - C.x) + (C.x - B.x) * (p.y - C.y)) / det;
  const l2 = ((C.y - A.y) * (p.x - C.x) + (A.x - C.x) * (p.y - C.y)) / det;
  const l3 = 1 - l1 - l2;
  return l1 >= 0 && l2 >= 0 && l3 >= 0;
}

// Nearest point on segment AB to point P
function nearestPointOnSegment(p, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return { x: a.x, y: a.y };
  const t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2;
  const tt = Math.max(0, Math.min(1, t));
  return { x: a.x + vx * tt, y: a.y + vy * tt };
}

function handleArenaCollision(it, w, h) {
  const reflect = (nx, ny) => {
    const vdot = it.vx * nx + it.vy * ny;
    it.vx -= 2 * vdot * nx;
    it.vy -= 2 * vdot * ny;
  };
  let dbg = { outside: false, proj: null, normal: null, shape: arenaShape };

  if (arenaShape === 'rectangle') {
    const xmin = RADIUS, xmax = w - RADIUS;
    const ymin = RADIUS, ymax = h - RADIUS;

    if (it.x <= xmin) { it.x = xmin; reflect(1, 0); dbg.outside = true; dbg.normal = {x:1,y:0}; dbg.proj = {x:xmin,y:it.y}; }
    else if (it.x >= xmax) { it.x = xmax; reflect(-1, 0); dbg.outside = true; dbg.normal = {x:-1,y:0}; dbg.proj = {x:xmax,y:it.y}; }
    if (it.y <= ymin) { it.y = ymin; reflect(0, 1); dbg.outside = true; dbg.normal = {x:0,y:1}; dbg.proj = {x:it.x,y:ymin}; }
    else if (it.y >= ymax) { it.y = ymax; reflect(0, -1); dbg.outside = true; dbg.normal = {x:0,y:-1}; dbg.proj = {x:it.x,y:ymax}; }
  }

  else if (arenaShape === 'circle') {
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) / 2 - RADIUS;
    const dx = it.x - cx, dy = it.y - cy;
    const d = Math.hypot(dx, dy);
    if (d > r) {
      const nx = dx / d, ny = dy / d;
      // تصحیح دقیق تا سطح دایره
      it.x = cx + nx * r;
      it.y = cy + ny * r;
      reflect(nx, ny);
      dbg.outside = true; dbg.normal = {x:nx,y:ny}; dbg.proj = {x: cx + nx * r, y: cy + ny * r};
    }
  }

  else if (arenaShape === 'triangle') {
    const A = { x: w / 2, y: RADIUS };
    const B = { x: RADIUS, y: h - RADIUS };
    const C = { x: w - RADIUS, y: h - RADIUS };
    if (!pointInTriangle(it, A, B, C)) {
      const edges = [[A, B], [B, C], [C, A]];
      let bestNormal = null, bestDist = Infinity, bestProj = null;

      for (const [P, Q] of edges) {
        const proj = nearestPointOnSegment(it, P, Q);
        const dx = it.x - proj.x, dy = it.y - proj.y;
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist) {
          bestDist = dist;
          let nx = Q.y - P.y, ny = -(Q.x - P.x);
          const len = Math.hypot(nx, ny) || 1;
          nx /= len; ny /= len;
          const cx = (A.x + B.x + C.x) / 3, cy = (A.y + B.y + C.y) / 3;
          if (nx * (cx - proj.x) + ny * (cy - proj.y) < 0) {
            nx = -nx; ny = -ny;
          }
          bestNormal = { x: nx, y: ny };
          bestProj = proj;
        }
      }

      if (bestNormal && bestProj && bestDist < RADIUS) {
        const push = RADIUS - bestDist;
        it.x += bestNormal.x * push;
        it.y += bestNormal.y * push;
        reflect(bestNormal.x, bestNormal.y);
        dbg.outside = true; dbg.normal = bestNormal; dbg.proj = bestProj;
      }
    }
  }

  else if (arenaShape === 'square') {
    const size = Math.min(w, h) - 2 * RADIUS;
    const x0 = (w - size) / 2, y0 = (h - size) / 2;
    const xmin = x0 + RADIUS, xmax = x0 + size - RADIUS;
    const ymin = y0 + RADIUS, ymax = y0 + size - RADIUS;
    if (it.x <= xmin) { it.x = xmin; reflect(1, 0); dbg.outside = true; dbg.normal = {x:1,y:0}; dbg.proj = {x:xmin,y:it.y}; }
    else if (it.x >= xmax) { it.x = xmax; reflect(-1, 0); dbg.outside = true; dbg.normal = {x:-1,y:0}; dbg.proj = {x:xmax,y:it.y}; }
    if (it.y <= ymin) { it.y = ymin; reflect(0, 1); dbg.outside = true; dbg.normal = {x:0,y:1}; dbg.proj = {x:it.x,y:ymin}; }
    else if (it.y >= ymax) { it.y = ymax; reflect(0, -1); dbg.outside = true; dbg.normal = {x:0,y:-1}; dbg.proj = {x:it.x,y:ymax}; }
  }
  if (DEBUG) return dbg;
  return null;
}

function step(dt) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const subSteps = 40; // بالا بردن دقت برخورد
  const subDt = dt / subSteps;

  for (let s = 0; s < subSteps; s++) {
    for (const it of items) {
      // پیش‌بینی موقعیت بعدی
      const nextX = it.x + it.vx * subDt;
      const nextY = it.y + it.vy * subDt;

      // چک کردن اینکه حرکت باعث خروج از مرز میشه یا نه
      const oldX = it.x, oldY = it.y;
      it.x = nextX;
      it.y = nextY;

      handleArenaCollision(it, w, h);

      // اگه در برخورد انرژی زیاد از دست داد، کمی کاهش سرعت بده
      if (Math.abs(it.x - oldX) > RADIUS || Math.abs(it.y - oldY) > RADIUS) {
        it.vx *= 0.98;
        it.vy *= 0.98;
      }
    }

    // برخورد آیتم‌ها با هم
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        const dx = B.x - A.x, dy = B.y - A.y;
        const dist = Math.hypot(dx, dy);
        if (dist < RADIUS * 2 && dist > 0) {
          const nx = dx / dist, ny = dy / dist;
          const overlap = RADIUS * 2 - dist;
          A.x -= nx * overlap / 2; A.y -= ny * overlap / 2;
          B.x += nx * overlap / 2; B.y += ny * overlap / 2;
          const tempVx = A.vx, tempVy = A.vy;
          A.vx = B.vx; A.vy = B.vy;
          B.vx = tempVx; B.vy = tempVy;

          if (A.type !== B.type) {
            if (beats(A.type, B.type)) B.type = A.type;
            else if (beats(B.type, A.type)) A.type = B.type;
          }
          handleArenaCollision(A, w, h);
          handleArenaCollision(B, w, h);
        }
      }
    }
  }
}

function render() {
  // Drawing uses the transform set in resizeCanvasToDisplaySize (scaled by DPR)
  // Clear using CSS pixel dimensions so drawing and physics share coordinates
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  drawArena();
  items.forEach(it => {
    const key = it.type === INITIAL.ROCK ? 'rock' : it.type === INITIAL.PAPER ? 'paper' : 'scissors';
    const img = IMG[key];
    ctx.save();
    ctx.beginPath();
    ctx.arc(it.x, it.y, RADIUS, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (img) ctx.drawImage(img, it.x - RADIUS, it.y - RADIUS, RADIUS * 2, RADIUS * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(it.x, it.y, RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (DEBUG) {
      const dbg = handleArenaCollision({x:it.x, y:it.y, vx:it.vx, vy:it.vy}, canvas.clientWidth, canvas.clientHeight);
      if (dbg && dbg.outside) {
        // draw projection
        ctx.fillStyle = 'red';
        ctx.beginPath(); ctx.arc(dbg.proj.x, dbg.proj.y, 4, 0, Math.PI*2); ctx.fill();
        // draw normal
        ctx.strokeStyle = 'blue'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(dbg.proj.x, dbg.proj.y); ctx.lineTo(dbg.proj.x + dbg.normal.x * 20, dbg.proj.y + dbg.normal.y * 20); ctx.stroke();
        // draw radius circle
        ctx.strokeStyle = 'rgba(0,255,0,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(dbg.proj.x + dbg.normal.x * RADIUS, dbg.proj.y + dbg.normal.y * RADIUS, RADIUS, 0, Math.PI*2); ctx.stroke();
        if (!debugLogged.has(it)) { console.log('DEBUG hit', dbg, it); debugLogged.add(it); }
      }
    }
  });
}

function loop(now) {
  const dt = Math.min(32, now - last) / 16.66;
  last = now;
  if (running) {
    step(dt);
    render();
    updateCounts();
    elapsed = (performance.now() - startTime) / 1000;
    const el = document.getElementById('timer'); if (el) el.innerText = elapsed.toFixed(1);
    const t0 = items[0].type;
    if (items.every(it => it.type === t0)) {
      running = false;
      elapsed = (performance.now() - startTime) / 1000;
      if (el) el.innerText = elapsed.toFixed(1);
      startEndAnimation(elapsed.toFixed(1));
    }
  }

  // update end animation
  if (endAnimActive) {
    const nowT = performance.now();
    const t = (nowT - endAnimStart) / endAnimDuration;
    // update particles
    particles.forEach(p => {
      p.vy += 0.06; // gravity
      p.x += p.vx;
      p.y += p.vy;
      p.ang += p.spin;
      p.life -= 0.008;
    });
    particles = particles.filter(p => p.life > 0 && p.y < canvas.height + 50);
    // stop when duration passed and no particles
    if (t >= 1 && particles.length === 0) {
      endAnimActive = false;
      particles = [];
    }

      // draw overlay on top (use CSS pixels)
      ctx.save();
      // semi-transparent dark overlay
      ctx.fillStyle = `rgba(0,0,0,${0.35})`;
      ctx.fillRect(0,0,canvas.clientWidth,canvas.clientHeight);
    // particles
    particles.forEach(p => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.ang);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      ctx.restore();
    });
    // centered time banner
    ctx.fillStyle = 'white';
    ctx.font = 'bold 44px Poppins, sans-serif';
    ctx.textAlign = 'center';
      ctx.fillText(`Time: ${endTimeVal}s`, canvas.clientWidth/2, canvas.clientHeight/2 - 10);
    ctx.restore();
  }
  requestAnimationFrame(loop);
}

document.querySelectorAll('.controls button').forEach(btn => {
  btn.addEventListener('click', () => {
    arenaShape = btn.dataset.shape;
    createItems();
    // clear any end animation state
    endAnimActive = false;
    particles = [];
    running = true;
    startTime = performance.now();
    elapsed = 0;
    document.getElementById('timer').innerText = '0.0';
    last = performance.now();
    requestAnimationFrame(loop);
  });
});

render();