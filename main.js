// ⵍ in real 3D (three.js): three extruded layers that fan out on hover,
// open one-way on click, shed dust, and shatter on the way out.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';
import { shatter } from './shatter.js';

var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
var link = document.getElementById('link');
var HREF = link.href;
var TEXT = 'mikgamer.fr';

// ---------------------------------------------------------------------------
// Glyph outline (the SVG polygon, viewBox 141.73)
// ---------------------------------------------------------------------------
var VB = 141.73;
var PTS = [
  [95.07, 2.33], [95.07, 29.88], [46.66, 83.23], [46.66, 2.33],
  [23.1, 2.33], [23.1, 139.4], [46.66, 139.4], [46.66, 111.85],
  [95.07, 58.51], [95.07, 139.4], [118.63, 139.4], [118.63, 2.33]
];

// sizes, relative to the viewport height (same as the old CSS)
var SIZE_VH = 0.5;      // glyph box: 50vh
var THICK_VH = 0.045;   // thickness: 4.5vh
var FONT_VH = 0.05;     // text: 5vh
var PERSPECTIVE = 1200; // px, same as the old CSS perspective
var size, thick;

// ---------------------------------------------------------------------------
// Easing + small tween helper (replaces the CSS transitions)
// ---------------------------------------------------------------------------
function bezier(x1, y1, x2, y2) {
  function A(a1, a2) { return 1 - 3 * a2 + 3 * a1; }
  function B(a1, a2) { return 3 * a2 - 6 * a1; }
  function C(a1) { return 3 * a1; }
  function at(t, a1, a2) { return ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t; }
  function slope(t, a1, a2) { return 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1); }
  return function (x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var t = x;
    for (var i = 0; i < 8; i++) {
      var sl = slope(t, x1, x2);
      if (Math.abs(sl) < 1e-6) break;
      t -= (at(t, x1, x2) - x) / sl;
    }
    if (t < 0 || t > 1 || Math.abs(at(t, x1, x2) - x) > 1e-4) {   // bisection fallback
      var lo = 0, hi = 1;
      for (var j = 0; j < 30; j++) { t = (lo + hi) / 2; if (at(t, x1, x2) < x) lo = t; else hi = t; }
    }
    return at(t, y1, y2);
  };
}
var EASE = bezier(0.25, 0.1, 0.25, 1);         // CSS "ease"
var OUT = bezier(0.2, 0.8, 0.2, 1);            // snappy ease-out
var IN_OUT = bezier(0.42, 0, 0.58, 1);         // CSS "ease-in-out"

function Param(v) { this.v = v; this.segs = []; }
// segs: [[to, seconds, delaySeconds, ease], ...] played in order
Param.prototype.to = function (segs, now) {
  this.segs = segs.map(function (s) {
    return { to: s[0], dur: s[1] * 1000, start: now + (s[2] || 0) * 1000, ease: s[3] || EASE, from: null };
  });
};
Param.prototype.update = function (now) {
  while (this.segs.length) {
    var s = this.segs[0];
    if (now < s.start) return true;
    if (s.from === null) s.from = this.v;
    var k = s.dur > 0 ? Math.min(1, (now - s.start) / s.dur) : 1;
    this.v = s.from + (s.to - s.from) * s.ease(k);
    if (k < 1) return true;
    this.segs.shift();
  }
  return false;
};

var P = {
  step: new Param(0),     // diagonal offset between layers (px)
  depth: new Param(0),    // depth between layers (px)
  sideK: new Param(0),    // thickness of the back/front layers, 0..1
  midK: new Param(0),     // thickness of the middle layer, 0..1 (flat at rest)
  sideOp: new Param(1),   // opacity of the back/front layers
  turn: new Param(0),     // rotation of the middle layer (rad)
  textOp: new Param(0)    // opacity of the text
};

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.domElement.id = 'scene';
document.body.appendChild(renderer.domElement);

var scene = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(50, 1, 10, PERSPECTIVE * 10);
camera.position.set(0, 0, PERSPECTIVE);

scene.add(new THREE.AmbientLight(0xffffff, 1));
var sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(-1, 1.6, 1.2);
scene.add(sun);

// tilt: CSS rotateX(6deg) rotateY(-12deg) at rest, swaying to the opposite once opened
var TILT_A = [6, -12], TILT_B = [-6, 12];
var stage = new THREE.Group();
scene.add(stage);
function setTilt(cssX, cssY) {
  // CSS is y-down, three.js is y-up: X rotation flips sign, Y stays
  stage.rotation.set(-cssX * Math.PI / 180, cssY * Math.PI / 180, 0, 'XYZ');
}
setTilt(TILT_A[0], TILT_A[1]);

// extruded glyph, unit box centred on the origin, face at z=0, depth going back to z=-1
var shape = new THREE.Shape(PTS.map(function (p) { return new THREE.Vector2(p[0] / VB, 1 - p[1] / VB); }));
var glyphGeo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
glyphGeo.translate(-0.5, -0.5, -1);

function makeLayer(i) {
  var group = new THREE.Group();
  var face = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
  var side = new THREE.MeshLambertMaterial({ color: 0x808080, transparent: true });
  var mesh = new THREE.Mesh(glyphGeo, [face, side]);   // group 0 = faces, 1 = walls
  group.add(mesh);
  stage.add(group);
  return { i: i, group: group, mesh: mesh, face: face, side: side };
}
var back = makeLayer(1), mid = makeLayer(0), front = makeLayer(-1);
var layers = [back, mid, front];

// text on the middle layer: rotated -48° so it reads level once the layer turns 48°
function textCanvas(withFace) {
  var T = 1024, c = document.createElement('canvas');
  c.width = c.height = T;
  var x = c.getContext('2d');
  if (withFace) { x.fillStyle = '#fff'; x.fillRect(0, 0, T, T); }
  x.fillStyle = '#000';
  x.font = (FONT_VH / SIZE_VH * T) + 'px monospace';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.translate(T / 2, T / 2);
  x.rotate(-48 * Math.PI / 180);
  x.fillText(TEXT, 0, 0);
  var tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
var textMat = new THREE.MeshBasicMaterial({ map: textCanvas(false), transparent: true, opacity: 0, depthWrite: false });
var textMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), textMat);
textMesh.position.z = 0.5;
mid.group.add(textMesh);

function resize() {
  var W = innerWidth, H = innerHeight;
  size = H * SIZE_VH;
  thick = H * THICK_VH;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  camera.fov = 2 * Math.atan(H / 2 / PERSPECTIVE) * 180 / Math.PI;
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  dust.width = W;
  dust.height = H;
  dirty = true;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
var state = 'rest';       // rest | opening | open | closing  (hover)
var opened = false;       // clicked: one-way
var leaving = false;      // exit transition running
var hovered = false;
var sidesGone = false;
var swayStart = null;
var shards = null;
var dirty = true;

function applyLayers() {
  var step = P.step.v, depth = P.depth.v;
  var showSides = !sidesGone && (state !== 'rest' || opened || step > 0.01 || depth > 0.01);
  layers.forEach(function (L) {
    var isMid = L.i === 0;
    // CSS: translate(i*step, -i*step) with y down -> y up here; back = up-right
    L.group.position.set(L.i * step, L.i * step, -L.i * depth - L.i * 0.5);
    var k = isMid ? P.midK.v : P.sideK.v;
    var op = isMid ? 1 : P.sideOp.v;
    L.mesh.scale.set(size, size, Math.max(k, 0.002) * thick);
    L.face.opacity = L.side.opacity = op;
    if (!isMid) L.group.visible = showSides && op > 0.001;
  });
  mid.group.rotation.z = P.turn.v;
  textMesh.scale.set(size, size, 1);
  textMat.opacity = P.textOp.v;
}

// ---------------------------------------------------------------------------
// Dust: the 3D layers shed white particles; once opened the cursor sucks them in
// ---------------------------------------------------------------------------
var dust = document.createElement('canvas');
dust.id = 'dust';
document.body.appendChild(dust);
var ctx = dust.getContext('2d');

var DOT = 16, dot = document.createElement('canvas');
dot.width = dot.height = DOT;
(function () {
  var c = dot.getContext('2d');
  var g = c.createRadialGradient(DOT / 2, DOT / 2, 0, DOT / 2, DOT / 2, DOT / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, DOT, DOT);
})();

var edges = [], perimeter = 0;
PTS.forEach(function (p, i) {
  var q = PTS[(i + 1) % PTS.length];
  var len = Math.hypot(q[0] - p[0], q[1] - p[1]);
  edges.push({ p: p, q: q, len: len });
  perimeter += len;
});
function randomEdgePoint() {
  var r = Math.random() * perimeter;
  for (var i = 0; i < edges.length; i++) {
    if (r <= edges[i].len) break;
    r -= edges[i].len;
  }
  var e = edges[Math.min(i, edges.length - 1)], t = Math.random();
  return [(e.p[0] + (e.q[0] - e.p[0]) * t) / VB, (e.p[1] + (e.q[1] - e.p[1]) * t) / VB];
}

var MAX = 300;
var RATE_HOVER = 40;   // particles per second while hovered (all layers)
var RATE_OPEN = 60;    // particles per second once opened
var VACUUM = 30000;    // pull strength of the cursor
var SWALLOW = 35;      // px: particles start fading out inside this radius of the cursor
var parts = [], acc = 0, emitting = false, dustDirty = null;
var mouse = { x: 0, y: 0, in: false };

// where a layer's face is on screen: origin (top-left) + u axis + v axis
var tv = new THREE.Vector3();
function toScreen(L, x, y) {
  tv.set(x, y, 0);
  L.mesh.localToWorld(tv).project(camera);
  return [(tv.x + 1) / 2 * innerWidth, (1 - tv.y) / 2 * innerHeight];
}
function project(L) {
  var o = toScreen(L, -0.5, 0.5), u = toScreen(L, 0.5, 0.5), v = toScreen(L, -0.5, -0.5);
  return { ox: o[0], oy: o[1], ux: u[0] - o[0], uy: u[1] - o[1], vx: v[0] - o[0], vy: v[1] - o[1] };
}

function spawn(g, boost) {
  if (parts.length >= MAX) return;
  boost = boost || 1;
  var uv = randomEdgePoint();
  var x = g.ox + g.ux * uv[0] + g.vx * uv[1];
  var y = g.oy + g.uy * uv[0] + g.vy * uv[1];
  var cx = g.ox + (g.ux + g.vx) / 2, cy = g.oy + (g.uy + g.vy) / 2;
  var dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
  var speed = (12 + Math.random() * 35) * boost;
  var a = Math.random() * Math.PI * 2;
  parts.push({
    x: x, y: y,
    vx: dx / d * speed + Math.cos(a) * 10,
    vy: dy / d * speed + Math.sin(a) * 10 - 12,
    age: 0,
    life: 0.9 + Math.random() * 1.1,
    size: 2 + Math.random() * 3,
    fade: -1, fadeDur: 0
  });
}

function updateDust(dt) {
  if (emitting) {
    acc += dt * (opened ? RATE_OPEN : RATE_HOVER);
    if (acc >= 1) {
      var sources = opened ? [mid] : layers.filter(function (L) { return L.group.visible; });
      var geo = sources.map(project);
      while (acc >= 1) { acc--; spawn(geo[(Math.random() * geo.length) | 0]); }
    }
  }

  var vacuum = opened && mouse.in && !leaving;
  var damp = Math.exp(-1.2 * dt), n = 0;
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i], inside = false;
    if (vacuum) {
      var mx = mouse.x - p.x, my = mouse.y - p.y, md = Math.hypot(mx, my) || 0.001;
      inside = md < SWALLOW;
      if (inside && p.fade < 0) {                 // faster particles fade quicker
        p.fade = 0;
        p.fadeDur = Math.min(0.7, Math.max(0.15, 70 / (Math.hypot(p.vx, p.vy) + 1)));
      }
      var f = VACUUM / (md + 60) * dt;
      p.vx += mx / md * f;
      p.vy += my / md * f;
      if (md < 260) p.age -= dt * 0.3;
    }
    var d2 = inside ? Math.exp(-5 * dt) : damp;   // spiral in instead of overshooting
    p.vx *= d2; p.vy *= d2;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.age += dt;
    if (p.fade >= 0) {
      p.fade += dt;
      if (p.fade >= p.fadeDur) continue;
    }
    if (p.age < p.life) parts[n++] = p;
  }
  parts.length = n;

  if (dustDirty) ctx.clearRect(dustDirty[0], dustDirty[1], dustDirty[2] - dustDirty[0], dustDirty[3] - dustDirty[1]);
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (var j = 0; j < n; j++) {
    var q = parts[j], k = 1 - q.age / q.life;
    var al = Math.max(0, Math.min(1, k * 1.5)) * 0.9, sz = q.size;
    if (q.fade >= 0) {
      var r = 1 - q.fade / q.fadeDur;
      al *= r * r;
      sz *= 0.35 + 0.65 * r;
    }
    ctx.globalAlpha = al;
    ctx.drawImage(dot, q.x - sz / 2, q.y - sz / 2, sz, sz);
    if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
  }
  ctx.globalAlpha = 1;
  dustDirty = n ? [Math.floor(x0 - 4), Math.floor(y0 - 4), Math.ceil(x1 + 4), Math.ceil(y1 + 4)] : null;
}

function setEmitting(on) { emitting = on && !reduceMotion; }

// ---------------------------------------------------------------------------
// Hover: each step always plays to the end before the next one starts
// ---------------------------------------------------------------------------
var OPEN_MS = 1250, CLOSE_MS = 950, THICK_MS = 500;
var timer = null, dustTimer = null;

function step() {
  if (opened) return;
  var now = performance.now();
  if (state === 'rest' && hovered) {
    state = 'opening';
    // 1: fan out flat and see-through   2: gain thickness + opacity, spread in depth
    P.step.to([[15, 0.5, 0, EASE]], now);
    P.sideOp.to([[0.7, 0.3, 0, EASE], [1, 0.5, 0.45, EASE]], now);
    P.sideK.to([[1, 0.7, 0.45, OUT]], now);
    P.midK.to([[1, 0.7, 0.45, OUT]], now);
    P.depth.to([[70, 0.7, 0.45, OUT]], now);
    dustTimer = setTimeout(function () { setEmitting(true); }, THICK_MS);
    timer = setTimeout(function () { state = 'open'; step(); }, OPEN_MS);
  } else if (state === 'open' && !hovered) {
    state = 'closing';
    // collapse depth + thickness first, then slide back
    P.depth.to([[0, 0.5, 0, EASE]], now);
    P.sideK.to([[0, 0.5, 0, EASE]], now);
    P.midK.to([[0, 0.5, 0, EASE]], now);
    P.sideOp.to([[0.7, 0.4, 0, EASE], [1, 0.3, 0.4, EASE]], now);
    P.step.to([[0, 0.5, 0.4, EASE]], now);
    setEmitting(false);
    timer = setTimeout(function () { state = 'rest'; step(); }, CLOSE_MS);
  }
}

function open() {
  if (opened) return;
  opened = true;
  clearTimeout(timer);
  clearTimeout(dustTimer);
  var now = performance.now();
  // back + front slide off and fade, middle turns 48°, text appears
  P.step.to([[100, 1, 0, EASE]], now);
  P.depth.to([[70, 1, 0, EASE]], now);
  P.sideK.to([[1, 0.6, 0, EASE]], now);
  P.midK.to([[1, 0.6, 0, EASE]], now);
  P.sideOp.to([[0, 1, 0, EASE]], now);
  P.turn.to([[-48 * Math.PI / 180, 1, 0.3, EASE]], now);
  P.textOp.to([[1, 1, 0.3, EASE]], now);
  swayStart = now + 1300;
  setTimeout(function () { sidesGone = true; }, 1100);
  setEmitting(true);
  updateCursor();
}

// ---------------------------------------------------------------------------
// Exit: shatter, background to rgb(23,23,23), then follow the link
// ---------------------------------------------------------------------------
var BG_MS = 1600;      // matches the body background transition in style.css
var faceTexture = null;

function leave(cx, cy) {
  if (leaving) return;
  leaving = true;
  updateCursor();

  setEmitting(false);
  if (!reduceMotion) {
    var g = project(mid);
    for (var i = 0; i < 90; i++) spawn(g, 4);
  }
  parts.forEach(function (p) { p.life = Math.min(p.life, p.age + 1.2); });

  document.body.classList.add('leaving');
  var bgDone = new Promise(function (r) { setTimeout(r, BG_MS); });

  var broken;
  if (reduceMotion) {
    renderer.domElement.classList.add('fadeout');
    broken = new Promise(function (r) { setTimeout(r, 700); });
  } else {
    stage.updateMatrixWorld(true);
    shards = shatter({
      parent: mid.group,
      camera: camera,
      pts: PTS, vb: VB,
      size: size, thick: thick,
      faceTexture: faceTexture || (faceTexture = textCanvas(true)),
      clickX: cx, clickY: cy,
      width: innerWidth, height: innerHeight
    });
    mid.mesh.visible = false;
    textMesh.visible = false;
    broken = new Promise(function (r) { shards.done = r; });
  }

  Promise.all([broken, bgDone]).then(function () {
    (function wait() {            // wait for the last specks of dust
      if (parts.length) requestAnimationFrame(wait);
      else location.href = HREF;
    })();
  });
}

// ---------------------------------------------------------------------------
// Input: the glyph's square (50vh, centred) is the hover/click area
// ---------------------------------------------------------------------------
function inBox(x, y) {
  return Math.abs(x - innerWidth / 2) < size / 2 && Math.abs(y - innerHeight / 2) < size / 2;
}
function updateCursor() {
  var over = mouse.in && inBox(mouse.x, mouse.y) && !leaving;
  document.body.style.cursor = over ? (opened ? 'pointer' : 'help') : '';
}

addEventListener('pointermove', function (e) {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
  var h = inBox(e.clientX, e.clientY);
  if (h !== hovered) { hovered = h; step(); }
  updateCursor();
});
document.documentElement.addEventListener('pointerleave', function () {
  mouse.in = false;
  if (hovered) { hovered = false; step(); }
  updateCursor();
});

addEventListener('click', function (e) {
  if (e.target === link || leaving || !inBox(e.clientX, e.clientY)) return;
  if (!opened) { open(); return; }
  if (e.ctrlKey || e.metaKey || e.shiftKey) { window.open(HREF, '_blank', 'noopener'); return; }
  leave(e.clientX, e.clientY);
});
addEventListener('auxclick', function (e) {    // middle click on the opened glyph: new tab
  if (e.button === 1 && opened && !leaving && inBox(e.clientX, e.clientY)) window.open(HREF, '_blank', 'noopener');
});

// keyboard: the hidden link opens the glyph, then leaves
link.addEventListener('click', function (e) {
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return;
  e.preventDefault();
  if (!opened) open();
  else leave(innerWidth / 2, innerHeight / 2);
});

// coming back with the browser's back button: start fresh
addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------
var last = performance.now();
function frame(now) {
  var dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  var moving = false;
  for (var k in P) if (P[k].update(now)) moving = true;

  if (swayStart !== null && !reduceMotion && !leaving && now > swayStart) {
    var c = (now - swayStart) / 14000, n = Math.floor(c), p = c - n;
    var e = IN_OUT(n % 2 ? 1 - p : p);
    setTilt(TILT_A[0] + (TILT_B[0] - TILT_A[0]) * e, TILT_A[1] + (TILT_B[1] - TILT_A[1]) * e);
    moving = true;
  }

  if (shards) {
    moving = true;
    if (!shards.update(now)) { shards.done && shards.done(); shards = null; }
  }

  if (moving || dirty) {
    applyLayers();
    renderer.render(scene, camera);
    dirty = false;
  }

  if (emitting || parts.length || dustDirty) updateDust(dt);
  requestAnimationFrame(frame);
}

addEventListener('resize', resize);
resize();
applyLayers();
renderer.render(scene, camera);
document.body.classList.add('gl');
requestAnimationFrame(frame);
