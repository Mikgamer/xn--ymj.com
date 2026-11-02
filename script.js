var img = document.getElementById('img');

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

  parent.insertBefore(makeSlices(), group);
});

// ---------------------------------------------------------------------------
// Hover: each step always plays to the end before the next one starts,
// so moving the mouse in and out quickly doesn't cut the animation short.
// ---------------------------------------------------------------------------
var OPEN_MS = 1250;   // fan out + gain thickness
var CLOSE_MS = 950;   // lose thickness + slide back
var hovered = false, state = 'rest', timer = null;

function step() {
  if (img.classList.contains('click')) return;
  if (state === 'rest' && hovered) {
    state = 'opening';
    img.classList.add('hover');
    timer = setTimeout(function () { state = 'open'; step(); }, OPEN_MS);
  } else if (state === 'open' && !hovered) {
    state = 'closing';
    img.classList.remove('hover');
    timer = setTimeout(function () { state = 'rest'; step(); }, CLOSE_MS);
  }
}

img.addEventListener('pointerenter', function () { hovered = true; step(); });
img.addEventListener('pointerleave', function () { hovered = false; step(); });

// One-way: once clicked, it stays open
img.addEventListener('click', function () {
  clearTimeout(timer);
  img.classList.remove('hover');
  img.classList.add('click');
  // drop the faded side layers so the browser stops drawing them
  setTimeout(function () {
    document.querySelectorAll('#img .back, #img .front').forEach(function (l) {
      l.remove();
    });
  }, 1100);
}, { once: true });
