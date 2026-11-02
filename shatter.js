// Exit effect: break the ⵍ into 3D shards that fly apart and fade.
// The shards are added to the same group as the glyph (main.js), so they start
// exactly where the glyph was. Call update(now) every frame; it returns false
// once every shard is gone.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js';

// split triangles until no edge is longer than maxEdge (shape units)
function fracture(tris, maxEdge) {
  var out = [], stack = tris.slice();
  while (stack.length) {
    var t = stack.pop(), best = -1, bestLen = 0;
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
 * opts: parent (group the glyph lives in, px units, y up, centred on the glyph),
 * camera, pts (outline, SVG units), vb (viewBox size), size (glyph px),
 * thick (px), faceTexture, clickX/clickY (screen px), width/height (viewport)
 */
export function shatter(opts) {
  var VB = opts.vb, s = opts.size / VB, thick = opts.thick;
  var W = opts.width, H = opts.height, parent = opts.parent;
  parent.updateMatrixWorld(true);

  var faceMat = new THREE.MeshBasicMaterial({ map: opts.faceTexture, transparent: true, side: THREE.DoubleSide });
  var backMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide });
  var sideMat = new THREE.MeshBasicMaterial({ color: 0x7c7c7c, transparent: true, side: THREE.DoubleSide });

  // triangulate the outline, then crack it into small shards
  var contour = opts.pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
  var tris = THREE.ShapeUtils.triangulateShape(contour, []).map(function (f) {
    return [opts.pts[f[0]], opts.pts[f[1]], opts.pts[f[2]]];
  });
  var shards = fracture(tris, 22);

  var inv = new THREE.Matrix3().setFromMatrix4(new THREE.Matrix4().copy(parent.matrixWorld).invert());
  var tmp = new THREE.Vector3();
  var group = new THREE.Group();
  parent.add(group);
  var pieces = [];

  shards.forEach(function (t) {
    var cx = (t[0][0] + t[1][0] + t[2][0]) / 3;
    var cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
    var pos = [], uv = [];
    function v(p, z) { pos.push((p[0] - cx) * s, -(p[1] - cy) * s, z); }
    function u(p) { uv.push(p[0] / VB, 1 - p[1] / VB); }
    t.forEach(function (p) { v(p, 0); u(p); });            // front
    t.forEach(function (p) { v(p, -thick); u(p); });       // back
    for (var i = 0; i < 3; i++) {                          // walls
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
    g.addGroup(6, pos.length / 3 - 6, 2);   // walls: grey, brightening in flight

    var fm = faceMat.clone(), bm = backMat.clone(), sm = sideMat.clone();
    var mesh = new THREE.Mesh(g, [fm, bm, sm]);
    var x0 = (cx - VB / 2) * s, y0 = -(cy - VB / 2) * s;
    mesh.position.set(x0, y0, 0);
    group.add(mesh);

    // where this shard is on screen, to ripple the break out from the click
    tmp.set(x0, y0, 0).applyMatrix4(parent.matrixWorld).project(opts.camera);
    var sx = (tmp.x + 1) / 2 * W, sy = (1 - tmp.y) / 2 * H;
    var dx = sx - opts.clickX, dy = sy - opts.clickY;
    var dist = Math.hypot(dx, dy);

    // push away from the click (in the glyph's own space) and from its centre
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
  var t0 = null;

  return {
    update: function (now) {
      if (t0 === null) t0 = now;
      var t = (now - t0) / 1000, alive = 0;
      for (var i = 0; i < pieces.length; i++) {
        var p = pieces[i];
        if (p.done) continue;
        alive++;
        var lt = t - p.delay;
        if (lt <= 0) continue;
        var k = lt / p.life;
        if (k >= 1) { p.mesh.visible = false; p.done = true; continue; }
        var travel = (1 - Math.exp(-DRAG * lt)) / DRAG;
        p.mesh.position.set(p.x0 + p.vx * travel, p.y0 + p.vy * travel, p.vz * travel);
        p.mesh.rotation.set(p.wx * lt, p.wy * lt, p.wz * lt);
        p.mesh.scale.setScalar(Math.max(0.001, 1 - k * k));
        var o = 1 - k * k * k;
        p.fm.opacity = p.bm.opacity = p.sm.opacity = o;
        p.sm.color.lerpColors(WALL_A, WALL_B, Math.min(1, lt / 0.3));   // walls brighten once flying
      }
      if (!alive && group.parent) group.parent.remove(group);
      return alive > 0;
    }
  };
}
