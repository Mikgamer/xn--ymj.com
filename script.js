var img = document.getElementById('img');
var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Thickness: grey copies of the ⵍ stacked behind the face. They sit flat on
// the face at rest and spread back to full depth (--thick, style.css) on hover.
// ---------------------------------------------------------------------------
var SLICES = 8;

function makeSlices() {
  var frag = document.createDocumentFragment();
  for (var n = SLICES; n >= 1; n--) {
    var s = document.createElement('img');
    s.src = 'side.svg';
    s.draggable = false;
    s.className = 'slice';
    s.style.setProperty('--f', n / SLICES);
    frag.appendChild(s);
  }
  return frag;
}

// tiny invisible markers on each face, used to find where it is on screen
function makeAnchor(x, y) {
  var a = document.createElement('i');
  a.className = 'anchor';
  a.style.left = x;
  a.style.top = y;
  return a;
}

var layers = [];
document.querySelectorAll('#img .layer').forEach(function (layer) {
  var face = layer.querySelector('img');
  var parent = face.parentNode;
  var link = parent.querySelector('a');
  face.classList.add('face');

  // opaque copy of the face, faded in together with the thickness
  var solid = face.cloneNode();
  solid.className = 'solid';

  // face + solid copy + text share one flat plane
  var group = document.createElement('div');
  group.className = 'facegroup';
  parent.insertBefore(group, face);
  group.append(face, solid);
  if (link) group.append(link);

  var anchors = [makeAnchor('0', '0'), makeAnchor('100%', '0'), makeAnchor('0', '100%')];
  anchors.forEach(function (a) { group.append(a); });

  parent.insertBefore(makeSlices(), group);
  layers.push({ el: layer, anchors: anchors });
});

// ---------------------------------------------------------------------------
// Particles: the thick (3D) layers shed white dust from their edges.
// Once opened, the cursor works like a vacuum and sucks the dust in.
// ---------------------------------------------------------------------------
var VB = 141.73; // SVG viewBox size, outline points below are the SVG polygon
var PTS = [
  [95.07, 2.33], [95.07, 29.88], [46.66, 83.23], [46.66, 2.33],
  [23.1, 2.33], [23.1, 139.4], [46.66, 139.4], [46.66, 111.85],
  [95.07, 58.51], [95.07, 139.4], [118.63, 139.4], [118.63, 2.33]
];
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
  return [
    (e.p[0] + (e.q[0] - e.p[0]) * t) / VB,
    (e.p[1] + (e.q[1] - e.p[1]) * t) / VB
  ];
}

var canvas = document.createElement('canvas');
canvas.id = 'dust';
document.body.appendChild(canvas);
var ctx = canvas.getContext('2d');

// 1:1 resolution keeps the canvas cheap; the dots are tiny anyway
function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
}
resize();
addEventListener('resize', resize);

// one pre-drawn soft dot, stamped for every particle (much cheaper than arcs)
var DOT = 16;
var dot = document.createElement('canvas');
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

var MAX = 300;
var RATE_HOVER = 40;   // particles per second while hovered (all layers)
var RATE_OPEN = 60;    // particles per second once opened
var VACUUM = 30000;    // pull strength of the cursor
var SWALLOW = 35;      // px: particles start fading out inside this radius of the cursor
var GEO_MS = 100;      // how often to re-measure where the faces are
var parts = [], acc = 0, emitting = false, running = false, last = 0;
var geo = [], geoAt = -1e9;
var dirty = null;      // area drawn last frame, the only part we clear
var mouse = { x: 0, y: 0, in: false };

addEventListener('pointermove', function (e) {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
});
document.documentElement.addEventListener('pointerleave', function () { mouse.in = false; });

function centre(el) {
  var r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// where a face currently is on screen: origin + u axis + v axis
function project(l) {
  var o = centre(l.anchors[0]), u = centre(l.anchors[1]), v = centre(l.anchors[2]);
  return { ox: o.x, oy: o.y, ux: u.x - o.x, uy: u.y - o.y, vx: v.x - o.x, vy: v.y - o.y };
}

function spawn(g) {
  if (parts.length >= MAX) return;
  var uv = randomEdgePoint();
  var x = g.ox + g.ux * uv[0] + g.vx * uv[1];
  var y = g.oy + g.uy * uv[0] + g.vy * uv[1];
  // drift away from the glyph's centre, a little upward
  var cx = g.ox + (g.ux + g.vx) / 2, cy = g.oy + (g.uy + g.vy) / 2;
  var dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1;
  var speed = 12 + Math.random() * 35;
  var a = Math.random() * Math.PI * 2;
  parts.push({
    x: x, y: y,
    vx: dx / d * speed + Math.cos(a) * 10,
    vy: dy / d * speed + Math.sin(a) * 10 - 12,
    age: 0,
    life: 0.9 + Math.random() * 1.1,
    size: 2 + Math.random() * 3,     // px, drawn diameter
    fade: -1, fadeDur: 0             // absorb fade, starts inside the cursor radius
  });
}

function frame(t) {
  var dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  var clicked = img.classList.contains('click');

  // emit (face positions are only re-measured every GEO_MS)
  if (emitting) {
    acc += dt * (clicked ? RATE_OPEN : RATE_HOVER);
    if (acc >= 1) {
      if (t - geoAt > GEO_MS) {
        geoAt = t;
        geo = layers.filter(function (l) {
          return l.el.isConnected && (!clicked || l.el.classList.contains('mid'));
        }).map(project);
      }
      if (geo.length) {
        while (acc >= 1) { acc--; spawn(geo[(Math.random() * geo.length) | 0]); }
      } else {
        acc = 0;
      }
    }
  }

  // move (dead particles are dropped in one pass)
  var vacuum = clicked && mouse.in;
  var damp = Math.exp(-1.2 * dt);
  var n = 0;
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    var inside = false;
    if (vacuum) {
      var mx = mouse.x - p.x, my = mouse.y - p.y, md = Math.hypot(mx, my) || 0.001;
      inside = md < SWALLOW;
      // entering the radius starts the fade; faster particles fade quicker
      if (inside && p.fade < 0) {
        var sp = Math.hypot(p.vx, p.vy);
        p.fade = 0;
        p.fadeDur = Math.min(0.7, Math.max(0.15, 70 / (sp + 1)));
      }
      var f = VACUUM / (md + 60) * dt;                         // stronger when closer
      p.vx += mx / md * f;
      p.vy += my / md * f;
      if (md < 260) p.age -= dt * 0.3;                         // live long enough to arrive
    }
    // extra drag inside the radius so they spiral in instead of overshooting
    var d2 = inside ? Math.exp(-5 * dt) : damp;
    p.vx *= d2; p.vy *= d2;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.age += dt;
    if (p.fade >= 0) {
      p.fade += dt;
      if (p.fade >= p.fadeDur) continue;                       // fully absorbed
    }
    if (p.age < p.life) parts[n++] = p;
  }
  parts.length = n;

  // draw: clear only what was drawn last frame
  if (dirty) ctx.clearRect(dirty[0], dirty[1], dirty[2] - dirty[0], dirty[3] - dirty[1]);
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (var j = 0; j < n; j++) {
    var q = parts[j], k = 1 - q.age / q.life;
    var a = Math.max(0, Math.min(1, k * 1.5)) * 0.9;
    var s = q.size;
    if (q.fade >= 0) {                                         // being absorbed
      var r = 1 - q.fade / q.fadeDur;
      a *= r * r;                                              // ease out
      s *= 0.35 + 0.65 * r;                                    // shrink a little
    }
    var h = s / 2;
    ctx.globalAlpha = a;
    ctx.drawImage(dot, q.x - h, q.y - h, s, s);
    if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
  }
  ctx.globalAlpha = 1;
  dirty = n ? [Math.floor(x0 - 4), Math.floor(y0 - 4), Math.ceil(x1 + 4), Math.ceil(y1 + 4)] : null;

  if (emitting || n) requestAnimationFrame(frame);
  else running = false;
}

function setEmitting(on) {
  emitting = on && !reduceMotion;
  if (emitting && !running) {
    running = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
}

// ---------------------------------------------------------------------------
// Hover: each step always plays to the end before the next one starts,
// so moving the mouse in and out quickly doesn't cut the animation short.
// ---------------------------------------------------------------------------
var OPEN_MS = 1250;   // fan out + gain thickness
var CLOSE_MS = 950;   // lose thickness + slide back
var THICK_MS = 500;   // when the layers have become 3D (start shedding dust)
var hovered = false, state = 'rest', timer = null, dustTimer = null;

function step() {
  if (img.classList.contains('click')) return;
  if (state === 'rest' && hovered) {
    state = 'opening';
    img.classList.add('hover');
    dustTimer = setTimeout(function () { setEmitting(true); }, THICK_MS);
    timer = setTimeout(function () { state = 'open'; step(); }, OPEN_MS);
  } else if (state === 'open' && !hovered) {
    state = 'closing';
    img.classList.remove('hover');
    setEmitting(false);
    timer = setTimeout(function () { state = 'rest'; step(); }, CLOSE_MS);
  }
}

img.addEventListener('pointerenter', function () { hovered = true; step(); });
img.addEventListener('pointerleave', function () { hovered = false; step(); });

// One-way: once clicked, it stays open
img.addEventListener('click', function () {
  clearTimeout(timer);
  clearTimeout(dustTimer);
  img.classList.remove('hover');
  img.classList.add('click');
  setEmitting(true);
  // drop the faded side layers so the browser stops drawing them
  setTimeout(function () {
    document.querySelectorAll('#img .back, #img .front').forEach(function (l) {
      l.remove();
    });
  }, 1100);
}, { once: true });
