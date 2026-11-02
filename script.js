var img = document.getElementById('img');

// Give each layer thickness: stack darker copies behind the front face
var THICKNESS = 14; // px, one slice per px
document.querySelectorAll('#img .layer').forEach(function (layer) {
  var face = layer.querySelector('img');
  for (var z = THICKNESS; z >= 1; z--) {
    var s = face.cloneNode();
    s.className = 'slice';
    s.style.setProperty('--z', z);
    // back face darkest, edges lighten toward the front
    s.style.setProperty('--b', (0.35 + 0.35 * (1 - z / THICKNESS)).toFixed(2));
    layer.insertBefore(s, face);
  }
});

// One-way: once clicked, it stays open
img.addEventListener('click', function () {
  img.classList.add('click');
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
    img.style.setProperty('--ry', (cx * 20 + Math.sin(s * 0.5) * 6).toFixed(2) + 'deg');
    img.style.setProperty('--rx', (-cy * 20 + Math.sin(s * 0.35) * 4).toFixed(2) + 'deg');
    requestAnimationFrame(loop);
  })();
}
