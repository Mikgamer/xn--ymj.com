// Exit transition: the opened ⵍ breaks into 3D shards that fly apart and fade.
// Loaded on demand by script.js. The three.js scene recreates the CSS glyph
// exactly (same perspective, tilt, rotation and thickness) so the hand-off
// from CSS to WebGL is invisible.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

// CSS matrix (y down) -> three.js matrix (y up)
function cssMatrix(el) {
  var t = getComputedStyle(el).transform;
  var m = new THREE.Matrix4();
  if (!t || t === 'none') return m;
  var a = Array.from(new DOMMatrix(t).toFloat32Array()); // column-major
  for (var col = 0; col < 4; col++) {
    for (var row = 0; row < 4; row++) {
      if ((row === 1) !== (col === 1)) a[col * 4 + row] *= -1;
    }
  }
  return m.fromArray(a);
}

// split triangles until no edge is longer than maxEdge (shape units)
function fracture(tris, maxEdge) {
  var out = [];
  var stack = tris.slice();
  while (stack.length) {
    var t = stack.pop();
    var best = -1, bestLen = 0;
    for (var i = 0; i < 3; i++) {
      var p = t[i], q = t[(i + 1) % 3];
      var l = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (l > bestLen) { bestLen = l; best = i; }
    }
    if (bestLen <= maxEdge) { out.push(t); continue; }
    var a = t[best], b = t[(best + 1) % 3], c = t[(best + 2) % 3];
    var k = 0.38 + Math.random() * 0.24;                 // uneven cuts look natural
    var m = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    stack.push([a, m, c], [m, b, c]);
  }
  return out;
}

/**
 * opts: stage (#img), layer (.mid), pts (outline in shape units), vb (viewBox
 * size), text, fontPx, thickPx, clickX/clickY (screen px), onFirstFrame()
 * Resolves when every shard is gone.
 */
export function shatter(opts) {
  var W = innerWidth, H = innerHeight;
  var size = opts.stage.offsetHeight;                     // layout size, before transforms
  var s = size / opts.vb;
  var VB = opts.vb;

  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H);
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.id = 'shatter';
  document.body.appendChild(renderer.domElement);

  // camera that matches the CSS `perspective` on <body>
  var D = parseFloat(getComputedStyle(document.body).perspective) || 1200;
  var camera = new THREE.PerspectiveCamera(2 * Math.atan(H / 2 / D) * 180 / Math.PI, W / H, 1, D * 10);
  camera.position.set(0, 0, D);

  var scene = new THREE.Scene();
  var group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.matrix.copy(cssMatrix(opts.stage)).multiply(cssMatrix(opts.layer));
  group.updateMatrixWorld(true);
  scene.add(group);

  // face texture: white with the link text, like the CSS face
  var T = 1024;
  var cv = document.createElement('canvas');
  cv.width = cv.height = T;
  var c = cv.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, T, T);
  c.fillStyle = '#000';
  c.font = (opts.fontPx * T / size) + 'px monospace';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.translate(T / 2, T / 2);
  c.rotate(-48 * Math.PI / 180);
  c.fillText(opts.text, 0, 0);
  var tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;

  var faceMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  var backMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide });
  var sideMat = new THREE.MeshBasicMaterial({ color: 0x7c7c7c, transparent: true, side: THREE.DoubleSide });

  // triangulate the outline, then crack it into small shards
  var contour = opts.pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
  var idx = THREE.ShapeUtils.triangulateShape(contour, []);
  var tris = idx.map(function (f) { return [opts.pts[f[0]], opts.pts[f[1]], opts.pts[f[2]]]; });
  var shards = fracture(tris, 22);

  var thick = opts.thickPx;
  var inv = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(group.matrix).invert());
  var tmp = new THREE.Vector3();
  var pieces = [];

  shards.forEach(function (t) {
    var cx = (t[0][0] + t[1][0] + t[2][0]) / 3;
    var cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
    var pos = [], uv = [];
    function v(p, z) { pos.push((p[0] - cx) * s, -(p[1] - cy) * s, z); }
    function u(p) { uv.push(p[0] / VB, 1 - p[1] / VB); }
    // front face
    t.forEach(function (p) { v(p, 0); u(p); });
    // back face
    t.forEach(function (p) { v(p, -thick); u(p); });
    // three side walls
    for (var i = 0; i < 3; i++) {
      var a = t[i], b = t[(i + 1) % 3];
      [[a, 0], [b, 0], [b, -thick], [a, 0], [b, -thick], [a, -thick]].forEach(function (e) {
        v(e[0], e[1]); u(e[0]);
      });
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.addGroup(0, 3, 0);                    // front: white + text
    g.addGroup(3, 3, 1);                    // back: white
    g.addGroup(6, pos.length / 3 - 6, 2);   // walls: grey like the CSS edges

    var fm = faceMat.clone(), bm = backMat.clone(), sm = sideMat.clone();
    var mesh = new THREE.Mesh(g, [fm, bm, sm]);
    var x0 = (cx - VB / 2) * s, y0 = -(cy - VB / 2) * s;
    mesh.position.set(x0, y0, 0);
    group.add(mesh);

    // where this shard is on screen, to ripple the break out from the click
    tmp.set(x0, y0, 0).applyMatrix4(group.matrixWorld).project(camera);
    var sx = (tmp.x + 1) / 2 * W, sy = (1 - tmp.y) / 2 * H;
    var dx = sx - opts.clickX, dy = sy - opts.clickY;
    var dist = Math.hypot(dx, dy);

    // push away from the click (converted into the glyph's own space) and from its centre
    var away = new THREE.Vector3(dx, -dy, 0).applyMatrix3(inv);
    away.z = 0;
    if (away.lengthSq() < 1e-6) away.set(x0, y0, 0);
    away.normalize();
    var out = new THREE.Vector3(x0, y0, 0);
    if (out.lengthSq() > 1e-6) out.normalize();
    var dir = away.multiplyScalar(0.7).add(out.multiplyScalar(0.3)).normalize();
    var speed = 160 + Math.random() * 320;

    pieces.push({
      mesh: mesh, fm: fm, bm: bm, sm: sm, x0: x0, y0: y0,
      vx: dir.x * speed + (Math.random() - 0.5) * 80,
      vy: dir.y * speed + (Math.random() - 0.5) * 80,
      vz: 60 + Math.random() * 320,
      wx: (Math.random() - 0.5) * 9,
      wy: (Math.random() - 0.5) * 9,
      wz: (Math.random() - 0.5) * 6,
      delay: Math.min(dist * 0.0011, 0.45) + Math.random() * 0.05,
      life: 0.9 + Math.random() * 0.45
    });
  });

  var DRAG = 1.6;
  var WALL_A = new THREE.Color(0x7c7c7c), WALL_B = new THREE.Color(0xdedede);
  return new Promise(function (resolve) {
    var t0 = performance.now(), first = true;
    function tick(now) {
      var t = (now - t0) / 1000, alive = 0;
      for (var i = 0; i < pieces.length; i++) {
        var p = pieces[i], lt = t - p.delay;
        if (p.done) continue;
        alive++;
        if (lt <= 0) continue;
        var k = lt / p.life;
        if (k >= 1) { p.mesh.visible = false; p.done = true; continue; }
        var travel = (1 - Math.exp(-DRAG * lt)) / DRAG;
        p.mesh.position.set(p.x0 + p.vx * travel, p.y0 + p.vy * travel, p.vz * travel);
        p.mesh.rotation.set(p.wx * lt, p.wy * lt, p.wz * lt);
        var sc = Math.max(0.001, 1 - k * k);
        p.mesh.scale.setScalar(sc);
        var o = 1 - k * k * k;
        p.fm.opacity = o;
        p.bm.opacity = o;
        p.sm.opacity = o;
        p.sm.color.lerpColors(WALL_A, WALL_B, Math.min(1, lt / 0.3));   // walls brighten once flying
      }
      renderer.render(scene, camera);
      if (first) { first = false; if (opts.onFirstFrame) opts.onFirstFrame(); }
      if (alive) {
        requestAnimationFrame(tick);
      } else {
        renderer.dispose();
        renderer.domElement.remove();
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}
