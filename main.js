// ⵍ in real 3D (three.js): three extruded layers that fan out on hover,
// open one-way on click, shed dust, and shatter on the way out.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const link = document.getElementById('link'), HREF = link.href, TEXT = 'mikgamer.fr';
const VB = 141.73, PTS = [   // the SVG polygon
  [95.07, 2.33], [95.07, 29.88], [46.66, 83.23], [46.66, 2.33], [23.1, 2.33], [23.1, 139.4],
  [46.66, 139.4], [46.66, 111.85], [95.07, 58.51], [95.07, 139.4], [118.63, 139.4], [118.63, 2.33]];
const SIZE = 0.5, THICK = 0.045, FONT = 0.05;   // fractions of the viewport height
const PERSPECTIVE = 1200, DEG = Math.PI / 180, BG_MS = 1600;   // BG_MS = body transition in style.css
let size, thick;

// ---- easing (CSS cubic-bezier) + tweens, replacing the CSS transitions -------
const bezier = (x1, y1, x2, y2) => {
  const f = (t, a, b) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return x => {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 20; i++) { t = (lo + hi) / 2; if (f(t, x1, x2) < x) lo = t; else hi = t; }
    return f(t, y1, y2);
  };
};
const EASE = bezier(0.25, 0.1, 0.25, 1), OUT = bezier(0.2, 0.8, 0.2, 1), IN_OUT = bezier(0.42, 0, 0.58, 1);

class Param {   // a value animated through segments [to, seconds, delay, ease], played in order
  constructor(v) { this.v = v; this.segs = []; }
  to(segs, now) {
    this.segs = segs.map(([to, dur, delay = 0, ease = EASE]) => ({ to, dur: dur * 1000, start: now + delay * 1000, ease, from: null }));
  }
  update(now) {
    while (this.segs.length) {
      const s = this.segs[0];
      if (now < s.start) return true;
      s.from ??= this.v;
      const k = Math.min(1, (now - s.start) / s.dur);
      this.v = s.from + (s.to - s.from) * s.ease(k);
      if (k < 1) return true;
      this.segs.shift();
    }
    return false;
  }
}
const P = {
  step: new Param(0), depth: new Param(0),   // diagonal offset / depth between layers (px)
  sideK: new Param(0), midK: new Param(0),   // thickness 0..1 (back+front / middle)
  sideOp: new Param(1),                      // opacity of back+front
  turn: new Param(0), textOp: new Param(0)   // middle layer rotation (rad), text opacity
};
const animate = spec => { const now = performance.now(); for (const k in spec) P[k].to(spec[k], now); };

// ---- scene ---------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.domElement.id = 'scene';
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 10, PERSPECTIVE * 10);
camera.position.z = PERSPECTIVE;
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-1, 1.6, 1.2);
scene.add(new THREE.AmbientLight(0xffffff, 1), sun);

// tilt as CSS rotateX/rotateY (y down): at rest A, swaying to B once opened
const TILT_A = [6, -12], TILT_B = [-6, 12];
const stage = new THREE.Group();
scene.add(stage);
const setTilt = (x, y) => stage.rotation.set(-x * DEG, y * DEG, 0);
setTilt(...TILT_A);

// extruded glyph in a unit box centred on the origin, face at z=0, depth back to z=-1
const glyphGeo = new THREE.ExtrudeGeometry(
  new THREE.Shape(PTS.map(([x, y]) => new THREE.Vector2(x / VB, 1 - y / VB))), { depth: 1, bevelEnabled: false });
glyphGeo.translate(-0.5, -0.5, -1);

// Back/front fade, so they first write depth only, then colour: only the nearest
// surface gets blended and each solid fades as one piece. The middle is opaque.
const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, transparent: true });
function makeLayer(i, order) {
  const fades = i !== 0, group = new THREE.Group();
  const face = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: fades });
  const side = new THREE.MeshLambertMaterial({ color: 0x808080, transparent: fades });
  const mesh = new THREE.Mesh(glyphGeo, [face, side]), meshes = [mesh];
  if (fades) {
    const pre = new THREE.Mesh(glyphGeo, depthOnly);
    pre.renderOrder = order;
    mesh.renderOrder = order + 1;
    meshes.push(pre);
  }
  group.add(...meshes);
  stage.add(group);
  return { i, group, mesh, meshes, face, side };
}
const back = makeLayer(1, 1), mid = makeLayer(0, 0), front = makeLayer(-1, 3);   // drawn back to front
const layers = [back, mid, front];

// text texture: rotated -48° so it reads level once the middle turns 48°
function textTexture(onFace) {
  const T = 1024, c = Object.assign(document.createElement('canvas'), { width: T, height: T }), x = c.getContext('2d');
  if (onFace) { x.fillStyle = '#fff'; x.fillRect(0, 0, T, T); }
  Object.assign(x, { fillStyle: '#000', font: FONT / SIZE * T + 'px monospace', textAlign: 'center', textBaseline: 'middle' });
  x.translate(T / 2, T / 2);
  x.rotate(-48 * DEG);
  x.fillText(TEXT, 0, 0);
  x.setTransform(1, 0, 0, 1, 0, 0);
  if (!onFace) {   // keep the text only inside the glyph outline
    x.globalCompositeOperation = 'destination-in';
    x.beginPath();
    PTS.forEach(([px, py]) => x.lineTo(px / VB * T, py / VB * T));
    x.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const textMat = new THREE.MeshBasicMaterial({ map: textTexture(false), transparent: true, opacity: 0, depthWrite: false });
const textMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), textMat);
textMesh.position.z = 1;   // renderOrder 0: right after the middle, before the fading layers
mid.group.add(textMesh);

// ---- state ---------------------------------------------------------------------
let state = 'rest';   // hover: rest | opening | open | closing
let opened = false, leaving = false, hovered = false, sidesGone = false;
let swayStart = null, shards = null, dirty = true, timer, dustTimer;

function applyLayers() {
  const step = P.step.v, depth = P.depth.v;
  const showSides = !sidesGone && (state !== 'rest' || opened || step > 0.01 || depth > 0.01);
  for (const L of layers) {
    const isMid = L.i === 0, op = isMid ? 1 : P.sideOp.v;
    L.group.position.set(L.i * step, L.i * step, -L.i * (depth + 0.5));   // back = up-right
    for (const m of L.meshes) m.scale.set(size, size, Math.max(isMid ? P.midK.v : P.sideK.v, 0.01) * thick);
    L.face.opacity = L.side.opacity = op;
    if (!isMid) L.group.visible = showSides && op > 0.001;
  }
  mid.group.rotation.z = P.turn.v;
  textMesh.scale.set(size, size, 1);
  textMat.opacity = P.textOp.v;
}

// ---- dust: the 3D layers shed particles; once opened the cursor sucks them in ----
const dust = document.body.appendChild(Object.assign(document.createElement('canvas'), { id: 'dust' }));
const ctx = dust.getContext('2d');
const dot = Object.assign(document.createElement('canvas'), { width: 16, height: 16 });
{
  const c = dot.getContext('2d'), g = c.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0.45, '#fff');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 16, 16);
}
const MAX = 300, RATE_HOVER = 40, RATE_OPEN = 60;   // particles / second
const VACUUM = 30000, SWALLOW = 35;                 // cursor pull, absorb radius (px)
const edges = PTS.map((p, i) => [p, PTS[(i + 1) % PTS.length]]);
const lens = edges.map(([p, q]) => Math.hypot(q[0] - p[0], q[1] - p[1]));
const perimeter = lens.reduce((a, b) => a + b);
const mouse = { x: 0, y: 0, in: false };
let parts = [], acc = 0, emitting = false, dustBox = null;

// where a layer's face is on screen: top-left corner + its two edges
const tv = new THREE.Vector3();
const toScreen = (L, x, y) => {
  L.mesh.localToWorld(tv.set(x, y, 0)).project(camera);
  return [(tv.x + 1) / 2 * innerWidth, (1 - tv.y) / 2 * innerHeight];
};
function project(L) {
  const [o, u, v] = [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5]].map(([x, y]) => toScreen(L, x, y));
  return { o, u: [u[0] - o[0], u[1] - o[1]], v: [v[0] - o[0], v[1] - o[1]] };
}

function spawn({ o, u, v }, boost = 1) {
  if (parts.length >= MAX) return;
  let r = Math.random() * perimeter, i = 0;
  while (i < lens.length - 1 && r > lens[i]) r -= lens[i++];
  const [p, q] = edges[i], t = Math.random();
  const a = (p[0] + (q[0] - p[0]) * t) / VB, b = (p[1] + (q[1] - p[1]) * t) / VB;
  const x = o[0] + u[0] * a + v[0] * b, y = o[1] + u[1] * a + v[1] * b;
  // drift away from the glyph's centre, a little upward
  const dx = x - o[0] - (u[0] + v[0]) / 2, dy = y - o[1] - (u[1] + v[1]) / 2, d = Math.hypot(dx, dy) || 1;
  const speed = (12 + Math.random() * 35) * boost, ang = Math.random() * 2 * Math.PI;
  parts.push({
    x, y, vx: dx / d * speed + Math.cos(ang) * 10, vy: dy / d * speed + Math.sin(ang) * 10 - 12,
    age: 0, life: 0.9 + Math.random() * 1.1, size: 2 + Math.random() * 3, fade: -1, fadeDur: 0
  });
}

function updateDust(dt) {
  if (emitting && (acc += dt * (opened ? RATE_OPEN : RATE_HOVER)) >= 1) {
    const geo = (opened ? [mid] : layers.filter(L => L.group.visible)).map(project);
    for (; acc >= 1; acc--) spawn(geo[(Math.random() * geo.length) | 0]);
  }
  const vacuum = opened && mouse.in && !leaving;
  parts = parts.filter(p => {
    let inside = false;
    if (vacuum) {
      const mx = mouse.x - p.x, my = mouse.y - p.y, md = Math.hypot(mx, my) || 0.001;
      inside = md < SWALLOW;
      if (inside && p.fade < 0) {   // absorb: faster particles fade quicker
        p.fade = 0;
        p.fadeDur = Math.min(0.7, Math.max(0.15, 70 / (Math.hypot(p.vx, p.vy) + 1)));
      }
      const f = VACUUM / (md + 60) * dt;
      p.vx += mx / md * f;
      p.vy += my / md * f;
      if (md < 260) p.age -= dt * 0.3;
    }
    const drag = Math.exp((inside ? -5 : -1.2) * dt);   // spiral in instead of overshooting
    p.vx *= drag; p.vy *= drag;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.age += dt;
    if (p.fade >= 0 && (p.fade += dt) >= p.fadeDur) return false;
    return p.age < p.life;
  });

  if (dustBox) ctx.clearRect(...dustBox);   // clear only what was drawn last frame
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of parts) {
    let al = Math.min(1, (1 - p.age / p.life) * 1.5) * 0.9, sz = p.size;
    if (p.fade >= 0) { const r = 1 - p.fade / p.fadeDur; al *= r * r; sz *= 0.35 + 0.65 * r; }
    ctx.globalAlpha = Math.max(0, al);
    ctx.drawImage(dot, p.x - sz / 2, p.y - sz / 2, sz, sz);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  dustBox = parts.length ? [x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8] : null;
}
const setEmitting = on => { emitting = on && !reduceMotion; };

// ---- hover: each step always plays to the end before the next one starts ------
function step() {
  if (opened) return;
  if (state === 'rest' && hovered) {
    state = 'opening';   // 1: fan out flat + see-through, 2: gain thickness + opacity, spread in depth
    animate({
      step: [[15, 0.5]], sideOp: [[0.7, 0.3], [1, 0.5, 0.45]],
      sideK: [[1, 0.7, 0.45, OUT]], midK: [[1, 0.7, 0.45, OUT]], depth: [[70, 0.7, 0.45, OUT]]
    });
    dustTimer = setTimeout(() => setEmitting(true), 500);
    timer = setTimeout(() => { state = 'open'; step(); }, 1250);
  } else if (state === 'open' && !hovered) {
    state = 'closing';   // collapse depth + thickness, then slide back
    animate({
      depth: [[0, 0.5]], sideK: [[0, 0.5]], midK: [[0, 0.5]],
      sideOp: [[0.7, 0.4], [1, 0.3, 0.4]], step: [[0, 0.5, 0.4]]
    });
    setEmitting(false);
    timer = setTimeout(() => { state = 'rest'; step(); }, 950);
  }
}

function open() {   // one-way: back + front slide off and fade, middle turns 48°, text appears
  opened = true;
  clearTimeout(timer);
  clearTimeout(dustTimer);
  animate({
    step: [[100, 1]], depth: [[70, 1]], sideK: [[1, 0.6]], midK: [[1, 0.6]], sideOp: [[0, 1]],
    turn: [[-48 * DEG, 1, 0.3]], textOp: [[1, 1, 0.3]]
  });
  swayStart = performance.now() + 1300;
  setTimeout(() => { sidesGone = true; }, 1100);
  setEmitting(true);
  updateCursor();
}

// ---- exit: shatter, background to rgb(23,23,23), then follow the link ----------
function fracture(tris, maxEdge) {   // split triangles until no edge is longer than maxEdge
  const out = [];
  while (tris.length) {
    const t = tris.pop(), l = t.map((p, i) => Math.hypot(t[(i + 1) % 3][0] - p[0], t[(i + 1) % 3][1] - p[1]));
    const i = l.indexOf(Math.max(...l));
    if (l[i] <= maxEdge) { out.push(t); continue; }
    const a = t[i], b = t[(i + 1) % 3], c = t[(i + 2) % 3], k = 0.38 + Math.random() * 0.24;   // uneven cuts
    const m = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    tris.push([a, m, c], [m, b, c]);
  }
  return out;
}

function shatter(clickX, clickY) {   // returns update(now) -> false once every shard is gone
  const s = size / VB, parent = mid.group, rnd = () => Math.random() - 0.5;
  stage.updateMatrixWorld(true);
  const inv = new THREE.Matrix3().setFromMatrix4(parent.matrixWorld.clone().invert());
  const base = [textTexture(true), null, null].map((map, i) => new THREE.MeshBasicMaterial(
    { map, color: i === 2 ? 0x7c7c7c : 0xffffff, transparent: true, side: THREE.DoubleSide }));
  const WALL = new THREE.Color(0xdedede);
  const tris = THREE.ShapeUtils.triangulateShape(PTS.map(p => new THREE.Vector2(...p)), []).map(f => f.map(j => PTS[j]));
  const pieces = fracture(tris, 22).map(t => {
    const cx = (t[0][0] + t[1][0] + t[2][0]) / 3, cy = (t[0][1] + t[1][1] + t[2][1]) / 3, pos = [], uv = [];
    const v = (p, z) => { pos.push((p[0] - cx) * s, -(p[1] - cy) * s, z); uv.push(p[0] / VB, 1 - p[1] / VB); };
    t.forEach(p => v(p, 0));        // front: white + text
    t.forEach(p => v(p, -thick));   // back: white
    t.forEach((a, i) => { const b = t[(i + 1) % 3]; v(a, 0); v(b, 0); v(b, -thick); v(a, 0); v(b, -thick); v(a, -thick); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.addGroup(0, 3, 0); g.addGroup(3, 3, 1); g.addGroup(6, 18, 2);
    const mats = base.map(m => m.clone()), mesh = new THREE.Mesh(g, mats);
    const x0 = (cx - VB / 2) * s, y0 = -(cy - VB / 2) * s;
    mesh.position.set(x0, y0, 0);
    parent.add(mesh);
    // ripple out from the click: push away from it (in the glyph's space) and from the centre
    const sp = new THREE.Vector3(x0, y0, 0).applyMatrix4(parent.matrixWorld).project(camera);
    const dx = (sp.x + 1) / 2 * innerWidth - clickX, dy = (1 - sp.y) / 2 * innerHeight - clickY;
    const away = new THREE.Vector3(dx, -dy, 0).applyMatrix3(inv).setZ(0);
    if (away.lengthSq() < 1e-6) away.set(x0, y0, 0);
    const dir = away.normalize().multiplyScalar(0.7).add(new THREE.Vector3(x0, y0, 0).normalize().multiplyScalar(0.3))
      .normalize().multiplyScalar(160 + Math.random() * 320);
    return {
      mesh, mats, x0, y0, vx: dir.x + rnd() * 80, vy: dir.y + rnd() * 80, vz: 60 + Math.random() * 320,
      w: [rnd() * 9, rnd() * 9, rnd() * 6], delay: Math.min(Math.hypot(dx, dy) * 0.0011, 0.45) + Math.random() * 0.05,
      life: 0.9 + Math.random() * 0.45
    };
  });
  let t0 = null;
  return now => {
    t0 ??= now;
    let alive = 0;
    for (const p of pieces) {
      if (p.done) continue;
      alive++;
      const lt = (now - t0) / 1000 - p.delay, k = lt / p.life;
      if (lt <= 0) continue;
      if (k >= 1) { p.done = true; parent.remove(p.mesh); continue; }
      const d = (1 - Math.exp(-1.6 * lt)) / 1.6;   // slowing down
      p.mesh.position.set(p.x0 + p.vx * d, p.y0 + p.vy * d, p.vz * d);
      p.mesh.rotation.set(p.w[0] * lt, p.w[1] * lt, p.w[2] * lt);
      p.mesh.scale.setScalar(Math.max(0.001, 1 - k * k));
      p.mats.forEach(m => { m.opacity = 1 - k ** 3; });
      p.mats[2].color.lerpColors(base[2].color, WALL, Math.min(1, lt / 0.3));   // walls brighten in flight
    }
    return alive > 0;
  };
}

function leave(x, y) {
  if (leaving) return;
  leaving = true;
  updateCursor();
  setEmitting(false);
  if (!reduceMotion) { const g = project(mid); for (let i = 0; i < 90; i++) spawn(g, 4); }
  parts.forEach(p => { p.life = Math.min(p.life, p.age + 1.2); });
  document.body.classList.add('leaving');
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let broken;
  if (reduceMotion) {
    renderer.domElement.classList.add('fadeout');
    broken = wait(700);
  } else {
    broken = new Promise(done => { shards = { update: shatter(x, y), done }; });
    mid.mesh.visible = textMesh.visible = false;
  }
  Promise.all([broken, wait(BG_MS)]).then(function check() {   // then wait for the last dust
    if (parts.length) requestAnimationFrame(check); else location.href = HREF;
  });
}

// ---- input: the centred 50vh square is the hover/click area --------------------
const inBox = (x, y) => Math.abs(x - innerWidth / 2) < size / 2 && Math.abs(y - innerHeight / 2) < size / 2;
function updateCursor() {
  const over = mouse.in && !leaving && inBox(mouse.x, mouse.y);
  document.body.style.cursor = over ? (opened ? 'pointer' : 'help') : '';
}
function setHover(h) { if (h !== hovered) { hovered = h; step(); } updateCursor(); }

addEventListener('pointermove', e => { Object.assign(mouse, { x: e.clientX, y: e.clientY, in: true }); setHover(inBox(e.clientX, e.clientY)); });
document.documentElement.addEventListener('pointerleave', () => { mouse.in = false; setHover(false); });
for (const type of ['click', 'auxclick']) addEventListener(type, e => {
  if (e.target === link || leaving || !inBox(e.clientX, e.clientY)) return;
  if (!opened) { if (type === 'click') open(); return; }
  if (type === 'auxclick' || e.ctrlKey || e.metaKey || e.shiftKey) { if (e.button < 2) window.open(HREF, '_blank', 'noopener'); return; }
  leave(e.clientX, e.clientY);
});
link.addEventListener('click', e => {   // keyboard: the hidden link opens the glyph, then leaves
  if (e.ctrlKey || e.metaKey || e.shiftKey) return;
  e.preventDefault();
  if (!opened) open(); else leave(innerWidth / 2, innerHeight / 2);
});
addEventListener('pageshow', e => { if (e.persisted) location.reload(); });   // back button: start fresh

// ---- loop ------------------------------------------------------------------------
function resize() {
  const W = innerWidth, H = innerHeight;
  size = H * SIZE;
  thick = H * THICK;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  camera.fov = 2 * Math.atan(H / 2 / PERSPECTIVE) / DEG;   // matches a CSS perspective of 1200px
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  Object.assign(dust, { width: W, height: H });
  dirty = true;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  let moving = false;
  for (const k in P) moving = P[k].update(now) || moving;
  if (swayStart !== null && !reduceMotion && !leaving && now > swayStart) {   // 14s ease-in-out, alternate
    const c = (now - swayStart) / 14000, n = Math.floor(c), e = IN_OUT(n % 2 ? 1 - (c - n) : c - n);
    setTilt(TILT_A[0] + (TILT_B[0] - TILT_A[0]) * e, TILT_A[1] + (TILT_B[1] - TILT_A[1]) * e);
    moving = true;
  }
  if (shards) {
    moving = true;
    if (!shards.update(now)) { shards.done(); shards = null; }
  }
  if (moving || dirty) { applyLayers(); renderer.render(scene, camera); dirty = false; }
  if (emitting || parts.length || dustBox) updateDust(dt);
  requestAnimationFrame(frame);
}

addEventListener('resize', resize);
resize();
document.body.classList.add('gl');
requestAnimationFrame(frame);
