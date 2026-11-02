var img = document.getElementById('img');

// Give each layer thickness: grey copies stacked behind the front face.
// Total thickness = SLICES x --slice (set in style.css, 2.5px -> 30px).
var SLICES = 12;
document.querySelectorAll('#img .layer').forEach(function (layer) {
  var face = layer.querySelector('img');
  face.classList.add('face');

  // opaque copy of the face, faded in together with the thickness
  var solid = face.cloneNode();
  solid.className = 'solid';
  face.after(solid);

  for (var n = SLICES; n >= 1; n--) {
    var s = document.createElement('img');
    s.src = 'side.svg';
    s.draggable = false;
    s.className = 'slice';
    s.style.setProperty('--n', n);
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
