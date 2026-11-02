var img = document.getElementById('img');

// Give each layer thickness: grey copies stacked behind the front face
var THICKNESS = 30; // px
var SLICES = 12;
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
    document.querySelectorAll('#img .back, #img .front').forEach(function (l) {
      l.remove();
    });
  }, 1100);
}, { once: true });
