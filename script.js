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
