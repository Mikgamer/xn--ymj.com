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

function resize() {
  var d = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * d;
  canvas.height = innerHeight * d;
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
resize();
addEventListener('resize', resize);

var MAX = 400;
var RATE_HOVER = 45;   // particles per second while hovered (all layers)
var RATE_OPEN = 70;    // particles per second once opened
var VACUUM = 60000;    // pull strength of the cursor
var parts = [], acc = 0, emitting = false, running = false, last = 0;
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
    life: 1.4 + Math.random() * 1.8,
    size: 0.6 + Math.random() * 1.6
  });
}

function frame(t) {
  var dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  var clicked = img.classList.contains('click');

  // emit
  if (emitting) {
    acc += dt * (clicked ? RATE_OPEN : RATE_HOVER);
    if (acc >= 1) {
      var sources = layers.filter(function (l) {
        return l.el.isConnected && (!clicked || l.el.classList.contains('mid'));
      });
      if (sources.length) {
        var geo = sources.map(project);
        while (acc >= 1) { acc--; spawn(geo[(Math.random() * geo.length) | 0]); }
      } else {
        acc = 0;
      }
    }
  }

  // move
  var vacuum = clicked && mouse.in;
  var damp = Math.exp(-1.2 * dt);
  for (var i = parts.length - 1; i >= 0; i--) {
    var p = parts[i];
    if (vacuum) {
      var mx = mouse.x - p.x, my = mouse.y - p.y, md = Math.hypot(mx, my);
      if (md < 6) { parts.splice(i, 1); continue; }          // swallowed
      var f = VACUUM / (md + 60) * dt;                        // stronger when closer
      p.vx += mx / md * f;
      p.vy += my / md * f;
      if (md < 260) p.age -= dt * 0.6;                         // live long enough to arrive
    }
    p.vx *= damp; p.vy *= damp;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.age += dt;
    if (p.age >= p.life) parts.splice(i, 1);
  }

  // draw
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  ctx.fillStyle = '#fff';
  for (var j = 0; j < parts.length; j++) {
    var q = parts[j], k = 1 - q.age / q.life;
    ctx.globalAlpha = Math.max(0, Math.min(1, k * 1.5)) * 0.9;
    ctx.beginPath();
    ctx.arc(q.x, q.y, q.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (emitting || parts.length) requestAnimationFrame(frame);
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
