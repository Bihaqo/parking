'use strict';
/* Parking Trainer — top-down parking practice.
   World units are meters, y grows downward (matches canvas). */

const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');

const SCALE = 40;                 // px per meter (before DPR)
const WORLD = { w: 24, h: 15 };
const DPR = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = WORLD.w * SCALE * DPR;
canvas.height = WORLD.h * SCALE * DPR;

const CAR = {
  len: 4.5, wid: 1.8,
  wheelbase: 2.7, rearOverhang: 0.75,
  maxSteer: 0.62,          // rad, ~35.5°
  steerRate: 1.05,         // rad/s while holding A/D
  accel: 2.2, brake: 5.0,  // m/s²
};
CAR.axleToCenter = CAR.len / 2 - CAR.rearOverhang; // rear axle -> body center

// ---------------------------------------------------------------- geometry
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrapPi = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

function boxCorners(b) {
  const c = Math.cos(b.theta), s = Math.sin(b.theta);
  const hx = b.w / 2, hy = b.h / 2;
  return [[hx, hy], [hx, -hy], [-hx, -hy], [-hx, hy]]
    .map(([x, y]) => [b.cx + x * c - y * s, b.cy + x * s + y * c]);
}

function boxesCollide(b1, b2) {
  const c1 = boxCorners(b1), c2 = boxCorners(b2);
  for (const b of [b1, b2]) {
    const axes = [[Math.cos(b.theta), Math.sin(b.theta)], [-Math.sin(b.theta), Math.cos(b.theta)]];
    for (const [ax, ay] of axes) {
      let min1 = Infinity, max1 = -Infinity, min2 = Infinity, max2 = -Infinity;
      for (const [x, y] of c1) { const p = x * ax + y * ay; min1 = Math.min(min1, p); max1 = Math.max(max1, p); }
      for (const [x, y] of c2) { const p = x * ax + y * ay; min2 = Math.min(min2, p); max2 = Math.max(max2, p); }
      if (max1 < min2 || max2 < min1) return false;
    }
  }
  return true;
}

function distPointToBox(px, py, b) {
  const c = Math.cos(b.theta), s = Math.sin(b.theta);
  const dx = px - b.cx, dy = py - b.cy;
  const lx = dx * c + dy * s, ly = -dx * s + dy * c;
  const qx = Math.max(Math.abs(lx) - b.w / 2, 0);
  const qy = Math.max(Math.abs(ly) - b.h / 2, 0);
  return Math.hypot(qx, qy);
}

// ---------------------------------------------------------------- levels
const CAR_COLORS = ['#8a8f98', '#a56d5b', '#5b7fa5', '#7a6da5', '#6da58a', '#a59a5b', '#96788c'];
const TIGHT_IDX = { roomy: 0, normal: 1, tight: 2 };

function buildLevel(type, tight) {
  const t = TIGHT_IDX[tight];
  const obstacles = [], zones = [], lines = [];
  let spot, start, curbCheck = false;
  const cx = WORLD.w / 2;

  const parkedCar = (x, y, theta, i) =>
    obstacles.push({ cx: x, cy: y, w: CAR.len, h: CAR.wid, theta, kind: 'car', color: CAR_COLORS[i % CAR_COLORS.length] });

  if (type === 'parallel') {
    const gap = [7.6, 6.6, 5.8][t];
    const curbY = 10.2, laneCy = 9.2;
    zones.push({ cx, cy: (curbY + 11.7) / 2, w: WORLD.w, h: 11.7 - curbY, color: '#3a3f45' });   // sidewalk
    zones.push({ cx, cy: (11.7 + WORLD.h) / 2, w: WORLD.w, h: WORLD.h - 11.7, color: '#26332a' }); // grass
    obstacles.push({ cx, cy: (curbY + WORLD.h) / 2, w: WORLD.w, h: WORLD.h - curbY, theta: 0, kind: 'curb' });
    lines.push({ x1: 0, y1: 3.2, x2: WORLD.w, y2: 3.2, color: 'rgba(255,255,255,0.5)', width: 0.1, dash: [1, 1.2] });
    const near = gap / 2 + CAR.len / 2, far = near + CAR.len + 0.9;
    [[-near, 0], [near, 1], [-far, 2], [far, 3]].forEach(([dx, i]) => parkedCar(cx + dx, laneCy, 0, i));
    spot = { cx, cy: 9.1, len: gap, wid: 2.2, theta: 0 };
    start = { x: 4, y: 6.6, theta: 0 };
    curbCheck = true;
  } else if (type === 'bay') {
    const bayW = [3.4, 3.0, 2.6][t];
    const rowTop = 9.5;
    for (let k = -3; k <= 3; k++) {
      if (k !== 0 && Math.abs(cx + k * bayW) < WORLD.w) parkedCar(cx + k * bayW, 12.45, Math.PI / 2, k + 3);
      const lx = cx + (k + 0.5) * bayW;
      lines.push({ x1: lx, y1: rowTop + 0.2, x2: lx, y2: WORLD.h - 0.15, color: 'rgba(255,255,255,0.65)', width: 0.1 });
      const lx2 = cx - (k + 0.5) * bayW;
      lines.push({ x1: lx2, y1: rowTop + 0.2, x2: lx2, y2: WORLD.h - 0.15, color: 'rgba(255,255,255,0.65)', width: 0.1 });
    }
    if (t > 0) { // opposite row narrows the aisle on normal/tight
      for (let k = -4; k <= 4; k++) {
        const x = cx + (k + 0.5) * bayW;
        if (x > 2 && x < WORLD.w - 2) parkedCar(x, 2.3, -Math.PI / 2, k + 8);
        const lx = cx + k * bayW;
        lines.push({ x1: lx, y1: 0.15, x2: lx, y2: 4.7, color: 'rgba(255,255,255,0.65)', width: 0.1 });
      }
    }
    spot = { cx, cy: 12.25, len: 5.5, wid: bayW - 0.12, theta: Math.PI / 2 };
    start = { x: 3.5, y: 7.0, theta: 0 };
  } else if (type === 'angled') {
    const bayW = [3.4, 3.0, 2.6][t];
    const ang = Math.PI / 4, spacing = bayW / Math.sin(ang);
    const rowCy = 12.0;
    for (let k = -3; k <= 3; k++) {
      const x = cx + k * spacing;
      if (k !== 0 && x > 2 && x < WORLD.w - 2) parkedCar(x, rowCy, ang, k + 3);
    }
    const dx = Math.cos(ang), dy = Math.sin(ang);
    for (let b = -3.5; b <= 3.5; b += 1) {
      const bx = cx + b * spacing;
      if (bx < 0.5 || bx > WORLD.w - 0.5) continue;
      lines.push({ x1: bx - 2.6 * dx, y1: rowCy - 2.6 * dy, x2: bx + 2.6 * dx, y2: rowCy + 2.6 * dy, color: 'rgba(255,255,255,0.65)', width: 0.1 });
    }
    spot = { cx, cy: rowCy, len: 5.2, wid: bayW - 0.12, theta: ang };
    start = { x: 3, y: 6, theta: 0 };
  } else { // garage
    const gw = [3.2, 2.8, 2.5][t];
    const faceY = 9.0, backY = 14.6, wallT = 0.25;
    zones.push({ cx, cy: (faceY + WORLD.h) / 2, w: WORLD.w, h: WORLD.h - faceY, color: '#22252a' });          // building
    zones.push({ cx, cy: (faceY + backY) / 2, w: gw, h: backY - faceY, color: '#31363d' });                    // garage floor
    const wall = (wcx, wcy, w, h) => obstacles.push({ cx: wcx, cy: wcy, w, h, theta: 0, kind: 'wall' });
    wall(cx - gw / 2 - wallT / 2, (faceY + backY) / 2, wallT, backY - faceY);   // left wall
    wall(cx + gw / 2 + wallT / 2, (faceY + backY) / 2, wallT, backY - faceY);   // right wall
    wall(cx, backY + wallT / 2, gw + 2 * wallT, wallT);                          // back wall
    const sideW = cx - gw / 2 - wallT;
    wall(sideW / 2, faceY - wallT / 2, sideW, wallT);                            // building face, left of door
    wall(WORLD.w - sideW / 2, faceY - wallT / 2, sideW, wallT);                  // building face, right of door
    spot = { cx, cy: (faceY + backY) / 2 + 0.3, len: 5.0, wid: gw - 0.1, theta: Math.PI / 2 };
    start = { x: 4, y: 5.5, theta: 0 };
  }
  return { obstacles, zones, lines, spot, start, curbCheck };
}

// ---------------------------------------------------------------- state
const settings = {
  type: 'parallel', tight: 'normal', maxKmh: 4,
  guides: true, sound: true, autoCenter: false,
};
try { Object.assign(settings, JSON.parse(localStorage.getItem('parkingTrainer') || '{}')); } catch (e) {}
const saveSettings = () => { try { localStorage.setItem('parkingTrainer', JSON.stringify(settings)); } catch (e) {} };

let level, car, done, collisions, startTime, elapsed, parkedTimer, flash, lastBumpAt, sensors, guideDir;
const keys = {};

function reset() {
  level = buildLevel(settings.type, settings.tight);
  car = { x: level.start.x, y: level.start.y, theta: level.start.theta, v: 0, steer: 0 };
  done = false; collisions = 0; startTime = null; elapsed = 0;
  parkedTimer = 0; flash = 0; lastBumpAt = -1; guideDir = 1;
  sensors = { front: [Infinity, Infinity, Infinity], rear: [Infinity, Infinity, Infinity] };
  $('overlay').classList.remove('show');
}

function carBox(pose) {
  const p = pose || car;
  const c = Math.cos(p.theta), s = Math.sin(p.theta);
  return { cx: p.x + c * CAR.axleToCenter, cy: p.y + s * CAR.axleToCenter, w: CAR.len, h: CAR.wid, theta: p.theta };
}

function carHitsWorld(box) {
  for (const [x, y] of boxCorners(box)) {
    if (x < 0.05 || x > WORLD.w - 0.05 || y < 0.05 || y > WORLD.h - 0.05) return true;
  }
  return false;
}

// ---------------------------------------------------------------- audio
let audio = null;
function ensureAudio() {
  if (!audio) {
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  }
  if (audio.state === 'suspended') audio.resume();
}
function tone(freq, dur, gain, type) {
  if (!audio || !settings.sound) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type || 'square'; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
  o.connect(g).connect(audio.destination);
  o.start(); o.stop(audio.currentTime + dur);
}
let lastBeep = 0;
function parktronicBeep(dist, now) {
  if (dist > 1.2) return;
  const interval = dist < 0.32 ? 85 : 85 + ((dist - 0.32) / 0.88) * 560;
  if (now - lastBeep > interval) { lastBeep = now; tone(950, 0.055, 0.05); }
}

// ---------------------------------------------------------------- simulation
function step(dt) {
  if (done) return;
  const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
  const fwd = keys.KeyW || keys.ArrowUp, back = keys.KeyS || keys.ArrowDown;

  // steering
  if (keys.Space) {
    const d = Math.sign(-car.steer) * CAR.steerRate * 3 * dt;
    car.steer = Math.abs(d) >= Math.abs(car.steer) ? 0 : car.steer + d;
  } else if (left !== right) {
    car.steer += (right ? 1 : -1) * CAR.steerRate * dt;
  } else if (settings.autoCenter && Math.abs(car.v) > 0.05) {
    const d = Math.sign(-car.steer) * 0.9 * Math.abs(car.v) * dt;
    car.steer = Math.abs(d) >= Math.abs(car.steer) ? 0 : car.steer + d;
  }
  car.steer = clamp(car.steer, -CAR.maxSteer, CAR.maxSteer);

  // speed
  const maxV = settings.maxKmh / 3.6;
  const target = fwd === back ? 0 : (fwd ? maxV : -maxV);
  const rate = (target === 0 || target * car.v < 0) ? CAR.brake : CAR.accel;
  car.v += clamp(target - car.v, -rate * dt, rate * dt);
  if (target === 0 && Math.abs(car.v) < 0.02) car.v = 0;

  // remember which way we're heading so guides don't snap back to forward at a stop
  if (fwd !== back) guideDir = fwd ? 1 : -1;
  else if (Math.abs(car.v) > 0.03) guideDir = car.v > 0 ? 1 : -1;

  if (car.v !== 0 && startTime === null) startTime = performance.now();
  if (startTime !== null) elapsed = (performance.now() - startTime) / 1000;

  // bicycle model, rear-axle reference point
  const prev = { x: car.x, y: car.y, theta: car.theta };
  car.x += car.v * Math.cos(car.theta) * dt;
  car.y += car.v * Math.sin(car.theta) * dt;
  car.theta += (car.v / CAR.wheelbase) * Math.tan(car.steer) * dt;

  // collisions
  const box = carBox();
  let hit = carHitsWorld(box) ? 'world' : null;
  if (!hit) for (const o of level.obstacles) if (boxesCollide(box, o)) { hit = 'obstacle'; break; }
  if (hit) {
    car.x = prev.x; car.y = prev.y; car.theta = prev.theta; car.v = 0;
    const now = performance.now();
    if (hit === 'obstacle' && now - lastBumpAt > 500) {
      collisions++; lastBumpAt = now; flash = 0.35; tone(200, 0.18, 0.09, 'sawtooth');
    }
  }
  flash = Math.max(0, flash - dt);

  updateSensors();

  // parktronic beeps: direction-aware, both bumpers when stopped
  const fMin = Math.min(...sensors.front), rMin = Math.min(...sensors.rear);
  const watch = car.v > 0.05 ? fMin : car.v < -0.05 ? rMin : Math.min(fMin, rMin);
  parktronicBeep(watch, performance.now());

  checkSuccess(dt);
}

function updateSensors() {
  const b = carBox();
  const c = Math.cos(b.theta), s = Math.sin(b.theta);
  const segY = [-0.62, 0, 0.62]; // segment centers across the bumper
  for (const [key, bx] of [['front', CAR.len / 2], ['rear', -CAR.len / 2]]) {
    sensors[key] = segY.map(sy => {
      let best = Infinity;
      for (const off of [-0.28, 0, 0.28]) {
        const ly = sy + off;
        const px = b.cx + bx * c - ly * s, py = b.cy + bx * s + ly * c;
        for (const o of level.obstacles) best = Math.min(best, distPointToBox(px, py, o));
      }
      return best;
    });
  }
}

function spotFrame(px, py) {
  const sp = level.spot;
  const c = Math.cos(sp.theta), s = Math.sin(sp.theta);
  const dx = px - sp.cx, dy = py - sp.cy;
  return [dx * c + dy * s, -dx * s + dy * c];
}

function insideSpot() {
  const sp = level.spot;
  for (const [x, y] of boxCorners(carBox())) {
    const [lx, ly] = spotFrame(x, y);
    if (Math.abs(lx) > sp.len / 2 + 0.03 || Math.abs(ly) > sp.wid / 2 + 0.03) return false;
  }
  const d = wrapPi(car.theta - sp.theta);
  return Math.abs(d) < 0.21 || Math.abs(wrapPi(d - Math.PI)) < 0.21;
}

function checkSuccess(dt) {
  if (insideSpot() && Math.abs(car.v) < 0.05) parkedTimer += dt; else parkedTimer = 0;
  if (parkedTimer < 0.8) return;
  done = true;
  const b = carBox();
  const [, lyc] = spotFrame(b.cx, b.cy);
  const angErr = Math.min(Math.abs(wrapPi(car.theta - level.spot.theta)), Math.abs(wrapPi(car.theta - level.spot.theta - Math.PI)));
  const offset = Math.abs(lyc);
  const stars = (offset < 0.16 && angErr < 0.07 && collisions === 0) ? 3
              : (offset < 0.32 && angErr < 0.14 && collisions <= 1) ? 2 : 1;
  const mm = Math.floor(elapsed / 60), ss = Math.floor(elapsed % 60);
  let detail = `${mm}:${String(ss).padStart(2, '0')} · ${collisions} bump${collisions === 1 ? '' : 's'} · ${(angErr * 180 / Math.PI).toFixed(1)}° off axis`;
  if (level.curbCheck) {
    let maxLy = -Infinity;
    for (const [x, y] of boxCorners(b)) maxLy = Math.max(maxLy, spotFrame(x, y)[1]);
    detail += ` · ${Math.max(0, level.spot.wid / 2 - maxLy).toFixed(2)} m to curb`;
  }
  $('stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('resultDetail').textContent = detail;
  $('overlay').classList.add('show');
  tone(660, 0.12, 0.06, 'sine');
  setTimeout(() => tone(880, 0.2, 0.06, 'sine'), 130);
}

// ---------------------------------------------------------------- drawing
function drawBox(b, fill) {
  ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(b.theta);
  ctx.fillStyle = fill; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(color, isPlayer) {
  // draws in a frame centered on the body, +x = forward
  const L = CAR.len, Wd = CAR.wid;
  roundRect(-L / 2, -Wd / 2, L, Wd, 0.32);
  ctx.fillStyle = color; ctx.fill();
  ctx.lineWidth = 0.05; ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.stroke();
  // windshield + rear window
  ctx.fillStyle = 'rgba(10,14,18,0.55)';
  roundRect(L * 0.08, -Wd / 2 + 0.16, L * 0.22, Wd - 0.32, 0.1); ctx.fill();
  roundRect(-L * 0.36, -Wd / 2 + 0.16, L * 0.16, Wd - 0.32, 0.1); ctx.fill();
  // roof
  roundRect(-L * 0.20, -Wd / 2 + 0.13, L * 0.28, Wd - 0.26, 0.12);
  ctx.fillStyle = isPlayer ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.09)'; ctx.fill();
}

function drawPlayerCar() {
  const b = carBox();
  ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(b.theta);
  // wheels (front pair rotated by steering angle)
  const rearX = -CAR.axleToCenter, frontX = rearX + CAR.wheelbase, wy = CAR.wid / 2 - 0.12;
  ctx.fillStyle = '#0d0f11';
  for (const [wx, steer] of [[rearX, 0], [frontX, car.steer]]) {
    for (const sy of [-wy, wy]) {
      ctx.save(); ctx.translate(wx, sy); ctx.rotate(steer);
      ctx.fillRect(-0.34, -0.135, 0.68, 0.27);
      ctx.restore();
    }
  }
  drawCarShape('#3ec7ba', true);
  // heading arrow
  ctx.fillStyle = 'rgba(8,48,44,0.65)';
  ctx.beginPath();
  ctx.moveTo(CAR.len * 0.42, 0); ctx.lineTo(CAR.len * 0.24, -0.28); ctx.lineTo(CAR.len * 0.24, 0.28);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawGuides() {
  if (!settings.guides || done) return;
  const dir = guideDir;
  const pose = { x: car.x, y: car.y, theta: car.theta };
  const ds = 0.15, steps = 28;
  const edgeX = dir > 0 ? CAR.len / 2 : -CAR.len / 2;
  const pathL = [], pathR = [];
  for (let i = 0; i <= steps; i++) {
    const c = Math.cos(pose.theta), s = Math.sin(pose.theta);
    const bx = pose.x + c * CAR.axleToCenter, by = pose.y + s * CAR.axleToCenter;
    const hy = CAR.wid / 2;
    pathL.push([bx + edgeX * c + hy * s, by + edgeX * s - hy * c]);
    pathR.push([bx + edgeX * c - hy * s, by + edgeX * s + hy * c]);
    pose.x += Math.cos(pose.theta) * ds * dir;
    pose.y += Math.sin(pose.theta) * ds * dir;
    pose.theta += (ds * dir / CAR.wheelbase) * Math.tan(car.steer);
  }
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 0.06; ctx.setLineDash([0.28, 0.22]);
  for (const path of [pathL, pathR]) {
    ctx.beginPath();
    path.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.stroke();
  }
  ctx.restore();
}

function drawSensors() {
  const b = carBox();
  ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(b.theta);
  const segY = [-0.62, 0, 0.62];
  // slots outward from the bumper: [offset, threshold, color]
  const slots = [[0.22, 1.4, '#4ade80'], [0.42, 0.85, '#fbbf24'], [0.62, 0.45, '#f87171']];
  ctx.lineWidth = 0.12; ctx.lineCap = 'round';
  for (const [key, sign] of [['front', 1], ['rear', -1]]) {
    sensors[key].forEach((d, i) => {
      for (const [off, thr, color] of slots) {
        if (d >= thr) break;
        const x = sign * (CAR.len / 2 + off);
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, segY[i] - 0.26); ctx.lineTo(x + sign * 0.06, segY[i]); ctx.lineTo(x, segY[i] + 0.26);
        ctx.stroke();
      }
    });
  }
  ctx.restore();
}

function draw() {
  ctx.setTransform(DPR * SCALE, 0, 0, DPR * SCALE, 0, 0);
  ctx.fillStyle = '#2b2f33';
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  for (const z of level.zones) drawBox({ ...z, theta: 0 }, z.color);

  for (const l of level.lines) {
    ctx.strokeStyle = l.color; ctx.lineWidth = l.width;
    ctx.setLineDash(l.dash || []);
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
    ctx.setLineDash([]);
  }

  // target spot
  const sp = level.spot;
  ctx.save(); ctx.translate(sp.cx, sp.cy); ctx.rotate(sp.theta);
  ctx.fillStyle = 'rgba(74,222,128,0.10)';
  ctx.fillRect(-sp.len / 2, -sp.wid / 2, sp.len, sp.wid);
  ctx.strokeStyle = 'rgba(74,222,128,0.8)'; ctx.lineWidth = 0.07; ctx.setLineDash([0.4, 0.3]);
  ctx.strokeRect(-sp.len / 2, -sp.wid / 2, sp.len, sp.wid);
  ctx.setLineDash([]);
  ctx.restore();
  // "P" label (pixel space so text stays crisp)
  ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = 'rgba(74,222,128,0.55)';
  ctx.font = '700 26px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('P', sp.cx * SCALE, sp.cy * SCALE);
  ctx.restore();
  ctx.setTransform(DPR * SCALE, 0, 0, DPR * SCALE, 0, 0);

  for (const o of level.obstacles) {
    if (o.kind === 'car') {
      ctx.save(); ctx.translate(o.cx, o.cy); ctx.rotate(o.theta);
      drawCarShape(o.color, false);
      ctx.restore();
    } else if (o.kind === 'wall') {
      drawBox(o, '#4a4f57');
    } // 'curb' collision boxes are invisible; the sidewalk zone shows them
  }

  drawGuides();
  drawPlayerCar();
  drawSensors();

  if (flash > 0) {
    ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.strokeStyle = `rgba(248,113,113,${flash * 2})`;
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, WORLD.w * SCALE - 14, WORLD.h * SCALE - 14);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- HUD
function fmtDist(d) { return d > 2 ? '> 2 m' : d.toFixed(2) + ' m'; }
function updateHUD() {
  $('speedV').textContent = Math.abs(car.v * 3.6).toFixed(1) + ' km/h';
  const fwd = keys.KeyW || keys.ArrowUp, back = keys.KeyS || keys.ArrowDown;
  $('gearV').textContent = car.v > 0.03 || (fwd && !back) ? 'D' : car.v < -0.03 || (back && !fwd) ? 'R' : 'N';
  const fMin = Math.min(...sensors.front), rMin = Math.min(...sensors.rear);
  const paint = (el, d) => {
    el.textContent = fmtDist(d);
    el.style.color = d < 0.45 ? 'var(--bad)' : d < 0.85 ? 'var(--warn)' : d < 1.4 ? 'var(--good)' : 'var(--text)';
  };
  paint($('frontV'), fMin); paint($('rearV'), rMin);
  const mm = Math.floor(elapsed / 60), ss = Math.floor(elapsed % 60);
  $('timeV').textContent = `${mm}:${String(ss).padStart(2, '0')}`;
  $('bumpV').textContent = collisions;
  $('steerV').textContent = Math.round(car.steer * 180 / Math.PI) + '°';
  $('wheel').style.transform = `rotate(${car.steer * 13 * 180 / Math.PI}deg)`;
}

// ---------------------------------------------------------------- input & UI
const HANDLED = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyR']);
window.addEventListener('keydown', e => {
  if (e.repeat) { if (HANDLED.has(e.code)) e.preventDefault(); return; }
  ensureAudio();
  if (e.code === 'KeyR') { reset(); e.preventDefault(); return; }
  if (HANDLED.has(e.code)) { keys[e.code] = true; e.preventDefault(); }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

function bindSeg(segId, attr, key) {
  const seg = $(segId);
  const sync = () => { for (const b of seg.children) b.classList.toggle('on', b.dataset[attr] === settings[key]); };
  seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    settings[key] = b.dataset[attr]; saveSettings(); sync(); reset();
  });
  sync();
}
bindSeg('typeSeg', 'type', 'type');
bindSeg('tightSeg', 'tight', 'tight');

const slider = $('speedSlider');
slider.value = settings.maxKmh;
const syncSpeedLabel = () => { $('speedLabel').textContent = Number(settings.maxKmh).toFixed(1) + ' km/h'; };
slider.addEventListener('input', () => { settings.maxKmh = Number(slider.value); saveSettings(); syncSpeedLabel(); });
syncSpeedLabel();

for (const [id, key] of [['guidesChk', 'guides'], ['soundChk', 'sound'], ['autoCenterChk', 'autoCenter']]) {
  const el = $(id);
  el.checked = settings[key];
  el.addEventListener('change', () => { settings[key] = el.checked; saveSettings(); });
}
$('resetBtn').addEventListener('click', () => { ensureAudio(); reset(); });
$('againBtn').addEventListener('click', () => reset());

// ---------------------------------------------------------------- main loop
reset();
let last = performance.now();
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  step(dt);
  draw();
  updateHUD();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
