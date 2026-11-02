var img = document.getElementById('img');

// Give each layer thickness: grey copies stacked behind the front face
var THICKNESS = 14; // px
var SLICES = 7;
document.querySelectorAll('#img .layer').forEach(function (layer) {
  var face = layer.querySelector('img');
  for (var n = SLICES; n >= 1; n--) {
    var s = document.createElement('img');
    s.src = 'side.svg';
    s.draggable = false;
    s.className = 'slice';
    s.style.setProperty('--z', (-n * THICKNESS / SLICES) + 'px');
    face.parentNode.insertBefore(s, face);
  }
});

// One-way: once clicked, it stays open
img.addEventListener('click', function () {
  img.classList.add('click');
  // drop the faded side layers so the browser stops drawing them
  setTimeout(function () {
    document.querySelectorAll('#img .layer:not(.mid)').forEach(function (l) {
      l.remove();
    });
  }, 1100);
}, { once: true });

// 3D tilt that follows the pointer, plus a slow idle sway
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  var tx = 0, ty = 0, cx = 0, cy = 0;

  addEventListener('pointermove', function (e) {
    tx = (e.clientX / innerWidth - 0.5) * 2;
    ty = (e.clientY / innerHeight - 0.5) * 2;
  });

  (function loop(t) {
    cx += (tx - cx) * 0.06;
    cy += (ty - cy) * 0.06;
    var s = (t || 0) / 1000;
    var ry = cx * 20 + Math.sin(s * 0.5) * 6;
    var rx = -cy * 20 + Math.sin(s * 0.35) * 4;
    // set transform directly (no inherited CSS variables = no restyle of children)
    img.style.transform = 'rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)';
    requestAnimationFrame(loop);
  })();
}
