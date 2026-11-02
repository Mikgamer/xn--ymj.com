var img = document.getElementById('img');

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
