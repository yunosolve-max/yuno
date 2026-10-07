// YUNO arcade: two quick one-player games for the cafe leaderboard.
//   Tea Stack: tap to drop each layer onto the tower. Only the part that lands stays.
//   Chai Rush: ride the scooter down a 3-lane road. Swipe or tap to change lanes, grab tea, dodge traffic.
// Both draw on one canvas, run at the phone's frame rate, and call onEnd(score) when the game is over.

export const ARCADE = {
  stack: { name: 'Tea Stack', max: 500, how: 'Tap to drop each layer. Line it up perfectly to keep it wide.' },
  rush: { name: 'Chai Rush', max: 99999, how: 'Swipe or tap left and right to change lanes. Grab ☕, dodge traffic.' }
};

const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

export function startArcade(host, game, onEnd) {
  const canvas = document.createElement('canvas');
  canvas.className = 'arc-canvas';
  canvas.setAttribute('aria-label', ARCADE[game].name + ' game. ' + ARCADE[game].how);
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  function fit() {
    const r = host.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(200, r.width); H = Math.max(300, r.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (g && g.resize) g.resize();
  }
  let g = null, raf = 0, last = 0, ended = false, paused = false;
  const api = { get W() { return W; }, get H() { return H; }, ctx, end };
  g = game === 'rush' ? rushGame(api) : stackGame(api);
  fit();
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(0.05, (t - last) / 1000) : 0; last = t;
    if (paused) return;
    g.step(dt); g.draw();
  }
  raf = requestAnimationFrame(frame);
  function end(score) {
    if (ended) return; ended = true;
    setTimeout(() => { stop(); onEnd(score); }, 900);
  }
  // Controls: tap, swipe, and arrow keys / space on a computer.
  let sx = 0, sy = 0, st = 0;
  const down = (e) => { e.preventDefault(); sx = e.clientX; sy = e.clientY; st = Date.now(); };
  const up = (e) => {
    e.preventDefault(); if (ended) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 28 && Math.abs(dx) > Math.abs(dy)) g.input(dx > 0 ? 'right' : 'left');
    else if (Date.now() - st < 600) { const r = canvas.getBoundingClientRect(); g.input('tap', (e.clientX - r.left) / r.width); }
  };
  const key = (e) => {
    if (ended) return;
    if (e.key === 'ArrowLeft') { g.input('left'); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { g.input('right'); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') { g.input('tap', 0.5); e.preventDefault(); }
  };
  const vis = () => { paused = document.visibilityState !== 'visible'; last = 0; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointerup', up);
  window.addEventListener('keydown', key);
  window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', vis);
  function stop() {
    cancelAnimationFrame(raf);
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointerup', up);
    window.removeEventListener('keydown', key);
    window.removeEventListener('resize', fit);
    document.removeEventListener('visibilitychange', vis);
  }
  return { stop: () => { ended = true; stop(); }, score: () => g.score() };
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function hud(ctx, W, text, sub) {
  ctx.textAlign = 'center'; ctx.fillStyle = '#17181D';
  ctx.font = '800 54px Urbanist, system-ui, sans-serif'; ctx.fillText(text, W / 2, 74);
  if (sub) { ctx.font = '700 15px Urbanist, system-ui, sans-serif'; ctx.fillStyle = 'rgba(23,24,29,.6)'; ctx.fillText(sub, W / 2, 98); }
}

/* ---------- Tea Stack ---------- */
function stackGame(A) {
  const ctx = A.ctx;
  let bh = 28, baseW = 200, tower = [], cur = null, debris = [], pops = [], cam = 0, camT = 0, over = false, combo = 0, n = 0, shake = 0;
  const color = (i) => 'hsl(' + ((205 + i * 11) % 360) + ',68%,' + (68 - (i % 2) * 4) + '%)';
  function reset() {
    bh = Math.max(22, Math.min(34, A.W * 0.07)); baseW = Math.min(A.W * 0.62, 300);
    tower = [{ x: (A.W - baseW) / 2, w: baseW }]; n = 0; spawn();
  }
  function spawn() {
    const top = tower[tower.length - 1], fromLeft = n % 2 === 0;
    cur = { x: fromLeft ? -top.w : A.W, w: top.w, dir: fromLeft ? 1 : -1 };
  }
  const levelY = (i) => A.H - 70 - (i + 1) * bh + cam;
  function drop() {
    if (over || !cur) return;
    const top = tower[tower.length - 1];
    const l = Math.max(cur.x, top.x), r = Math.min(cur.x + cur.w, top.x + top.w), ov = r - l;
    if (ov <= 0) {
      debris.push({ x: cur.x, w: cur.w, y: levelY(tower.length), vy: 0, c: color(n + 1), rot: 0, vr: cur.dir * 2 });
      cur = null; over = true; shake = 10; buzz([40, 60, 80]); A.end(n); return;
    }
    n++;
    if (Math.abs(cur.x - top.x) <= Math.max(3, A.W * 0.008)) {
      combo++;
      const grow = combo >= 3 ? Math.min(baseW - top.w, 6) : 0;
      tower.push({ x: top.x - grow / 2, w: top.w + grow });
      pops.push({ t: 0, text: combo >= 3 ? 'Perfect ×' + combo : 'Perfect!', y: levelY(tower.length - 1) });
      buzz(15);
    } else {
      combo = 0;
      const cutX = cur.x < top.x ? cur.x : r, cutW = cur.w - ov;
      debris.push({ x: cutX, w: cutW, y: levelY(tower.length), vy: 0, c: color(n), rot: 0, vr: (cur.x < top.x ? -1 : 1) * 1.5 });
      tower.push({ x: l, w: ov });
      buzz(8);
    }
    camT = Math.max(0, (tower.length - Math.floor((A.H * 0.55) / bh)) * bh);
    spawn();
  }
  return {
    resize() { if (!tower.length) reset(); },
    input(kind) { if (kind === 'tap' || kind === 'left' || kind === 'right') drop(); },
    score: () => n,
    step(dt) {
      if (cur) {
        const speed = Math.min(A.W * 1.35, A.W * (0.42 + n * 0.022));
        cur.x += cur.dir * speed * dt;
        if (cur.x + cur.w > A.W + cur.w * 0.15) { cur.dir = -1; } else if (cur.x < -cur.w * 0.15) { cur.dir = 1; }
      }
      cam += (camT - cam) * Math.min(1, dt * 6);
      debris.forEach(d => { d.vy += 1600 * dt; d.y += d.vy * dt; d.rot += d.vr * dt; });
      debris = debris.filter(d => d.y < A.H + 200);
      pops.forEach(p => { p.t += dt; }); pops = pops.filter(p => p.t < 0.9);
      if (shake > 0) shake = Math.max(0, shake - dt * 30);
    },
    draw() {
      const W = A.W, H = A.H;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      const hue = (205 + n * 4) % 360;
      sky.addColorStop(0, 'hsl(' + hue + ',70%,95%)'); sky.addColorStop(1, 'hsl(' + ((hue + 40) % 360) + ',65%,88%)');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.save();
      if (shake && !reduced()) ctx.translate((Math.random() - 0.5) * shake, 0);
      // Saucer under the tower
      ctx.fillStyle = 'rgba(23,24,29,.12)'; roundRect(ctx, (W - baseW) / 2 - 18, A.H - 70 + cam + 2, baseW + 36, 12, 6); ctx.fill();
      tower.forEach((b, i) => {
        const y = levelY(i - 1) - bh; if (y > H + bh || y < -bh * 2) return;
        ctx.fillStyle = i === 0 ? '#17181D' : color(i); roundRect(ctx, b.x, y, b.w, bh - 2, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)'; roundRect(ctx, b.x + 4, y + 3, Math.max(0, b.w - 8), 5, 3); ctx.fill();
      });
      if (cur) {
        const y = levelY(tower.length - 1) - bh;
        ctx.fillStyle = color(n + 1); roundRect(ctx, cur.x, y, cur.w, bh - 2, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.35)'; roundRect(ctx, cur.x + 4, y + 3, Math.max(0, cur.w - 8), 5, 3); ctx.fill();
      }
      debris.forEach(d => {
        ctx.save(); ctx.translate(d.x + d.w / 2, d.y + bh / 2); ctx.rotate(d.rot);
        ctx.fillStyle = d.c; roundRect(ctx, -d.w / 2, -bh / 2, d.w, bh - 2, 7); ctx.fill(); ctx.restore();
      });
      ctx.restore();
      pops.forEach(p => {
        ctx.globalAlpha = 1 - p.t / 0.9; ctx.fillStyle = '#6F5CE6'; ctx.textAlign = 'center';
        ctx.font = '800 22px Urbanist, system-ui, sans-serif'; ctx.fillText(p.text, W / 2, p.y - 18 - p.t * 40 + cam - cam); ctx.globalAlpha = 1;
      });
      hud(ctx, W, String(n), n === 0 ? 'Tap anywhere to drop' : '');
    }
  };
}

/* ---------- Chai Rush ---------- */
function rushGame(A) {
  const ctx = A.ctx;
  const OBST = ['\u{1F6A7}', '\u{1F6FA}', '\u{1F404}', '\u{1F4E6}'];
  let lane = 1, px = 0, objs = [], dist = 0, cups = 0, speed = 0, t = 0, nextRow = 0, over = false, crash = 0, flash = [], palms = [];
  const road = () => { const w = Math.min(A.W - 24, 420); return { x: (A.W - w) / 2, w }; };
  const laneX = (i) => { const r = road(); return r.x + r.w * (i * 2 + 1) / 6; };
  const playerY = () => A.H - 120;
  let started = false;
  function reset() { lane = 1; px = laneX(1); objs = []; dist = 0; cups = 0; t = 0; nextRow = A.H * 1.1; palms = []; for (let i = 0; i < 6; i++) palms.push({ y: i * A.H / 5, side: i % 2 }); }
  function addRow() {
    const lanes = [0, 1, 2].sort(() => Math.random() - 0.5);
    const blocks = Math.random() < Math.min(0.55, 0.15 + t * 0.006) ? 2 : 1;
    for (let k = 0; k < blocks; k++) objs.push({ lane: lanes[k], y: -50, e: OBST[Math.floor(Math.random() * OBST.length)], bad: true });
    if (Math.random() < 0.65) objs.push({ lane: lanes[2], y: -50 - (Math.random() < 0.5 ? 0 : 70), e: '☕', bad: false });
  }
  const score = () => Math.floor(dist / 40) + cups * 10;
  return {
    resize() { if (!started) { started = true; reset(); } px = laneX(lane); },
    input(kind, fx) {
      if (over) return;
      if (kind === 'left') lane = Math.max(0, lane - 1);
      else if (kind === 'right') lane = Math.min(2, lane + 1);
      else if (kind === 'tap') lane = fx < 0.5 ? Math.max(0, lane - 1) : Math.min(2, lane + 1);
    },
    score,
    step(dt) {
      if (over) { crash = Math.max(0, crash - dt * 25); return; }
      t += dt;
      speed = Math.min(A.H * 1.7, A.H * (0.55 + t * 0.022));
      const dy = speed * dt; dist += dy;
      px += (laneX(lane) - px) * Math.min(1, dt * 16);
      nextRow -= dy;
      if (nextRow <= 0) { addRow(); nextRow = Math.max(150, A.H * (0.42 - Math.min(0.2, t * 0.004))); }
      objs.forEach(o => { o.y += dy; });
      palms.forEach(p => { p.y += dy * 0.9; if (p.y > A.H + 40) p.y -= A.H + 80; });
      const py = playerY();
      for (const o of objs) {
        if (o.hit) continue;
        if (Math.abs(laneX(o.lane) - px) < road().w / 6 * 0.6 && Math.abs(o.y - py) < 36) {
          o.hit = true;
          if (o.bad) { over = true; crash = 12; buzz([60, 40, 90]); A.end(score()); return; }
          cups++; buzz(10); flash.push({ x: laneX(o.lane), y: o.y, t: 0 });
        }
      }
      objs = objs.filter(o => o.y < A.H + 60 && !(o.hit && !o.bad));
      flash.forEach(f => { f.t += dt; }); flash = flash.filter(f => f.t < 0.6);
    },
    draw() {
      const W = A.W, H = A.H, r = road();
      ctx.save();
      if (crash && !reduced()) ctx.translate((Math.random() - 0.5) * crash, (Math.random() - 0.5) * crash);
      ctx.fillStyle = '#9CCB6A'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#3B3D46'; ctx.fillRect(r.x, 0, r.w, H);
      ctx.fillStyle = '#F5E9A9'; ctx.fillRect(r.x - 4, 0, 4, H); ctx.fillRect(r.x + r.w, 0, 4, H);
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 4; ctx.setLineDash([28, 26]); ctx.lineDashOffset = -(dist % 54);
      [1, 2].forEach(i => { const x = r.x + r.w * i / 3; ctx.beginPath(); ctx.moveTo(x, -60); ctx.lineTo(x, H + 60); ctx.stroke(); });
      ctx.setLineDash([]);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (r.x > 26) { ctx.font = '30px system-ui, sans-serif'; palms.forEach(p => ctx.fillText('\u{1F334}', p.side ? r.x + r.w + (r.x / 2) : r.x / 2, p.y)); }
      ctx.font = '38px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      objs.forEach(o => ctx.fillText(o.e, laneX(o.lane), o.y));
      ctx.font = '46px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
      ctx.fillText(over ? '\u{1F4A5}' : '\u{1F6F5}', px, playerY());
      ctx.restore();
      flash.forEach(f => { ctx.globalAlpha = 1 - f.t / 0.6; ctx.fillStyle = '#D6E96E'; ctx.font = '800 22px Urbanist, system-ui, sans-serif'; ctx.fillText('+10', f.x, f.y - 30 - f.t * 50); ctx.globalAlpha = 1; });
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(255,255,255,.88)'; roundRect(ctx, W / 2 - 70, 30, 140, 76, 22); ctx.fill();
      hud(ctx, W, String(score()), '☕ ' + cups);
      if (t < 2.5 && !over) { ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = '700 15px Urbanist, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Swipe or tap left / right', W / 2, H - 50); }
    }
  };
}
