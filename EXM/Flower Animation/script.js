var C = document.getElementById("c");
var Ctx = C.getContext("2d");
var Cw = C.width = window.innerWidth,
  Cx = Cw / 2;
var Ch = C.height = window.innerHeight,
  Cy = Ch / 2;

var c = document.createElement("canvas");
var ctx = c.getContext("2d");
var cw = c.width = 400,
  cx = cw / 2;
var ch = c.height = 400,
  cy = ch / 2;
var rad = Math.PI / 180;
var frames = 0;
var stopped = true;
var Rx = 150,
  Ry = 150,
  kx = 3,
  ky = 4,
  x, y, x1, y1, x2, y2, t;
var petals = 7;

ctx.strokeStyle ="#8800ffff";
ctx.globalAlpha = .5;
ctx.lineWidth = .25;

Ctx.translate(Cw / 2, Ch / 2);
Ctx.scale(.75, .75)

function Draw() {
  frames += .3;
  Ctx.clearRect(-Cw, -Ch, 2 * Cw, 2 * Ch);
  t = frames * rad;
  rx = Rx * Math.abs(Math.cos(t)) + 50;
  ry = Ry * Math.abs(Math.sin(t)) + 50;

  x = cx + rx * Math.sin(kx * t + Math.PI / 2);
  y = cy + ry * Math.sin(ky * t + Math.PI / 2);

  x1 = cx + rx * Math.sin(kx * t + Math.PI);
  y1 = cy - ry * Math.sin(ky * t + Math.PI);

  x2 = cx + rx * Math.sin(kx * t);
  y2 = cy - ry * Math.sin(ky * t);

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x1, y1, x2, y2);
  ctx.stroke();
  ctx.globalCompositeOperation = "lighter";

  var img = c;
  //Ctx[i].fillRect(-cw, -ch, cw, ch);

  for (var i = 0; i < petals; i++) {
    Ctx.globalCompositeOperation = "source-over";
    Ctx.drawImage(img, -200, -400);
    Ctx.rotate(2 * Math.PI / petals);
  }

  requestId = window.requestAnimationFrame(Draw);
}

function start() {
  requestId = window.requestAnimationFrame(Draw);
  stopped = false;
}

function stopAnim() {
  if (requestId) {
    window.cancelAnimationFrame(requestId);
  }
  stopped = true;
}
window.addEventListener("load", function() {
  start();
}, false);

function cleanSlate() {
  ctx.clearRect(0, 0, cw, ch);
  stopped = true;
  start();
  window.setTimeout(function() {
    stopAnim();
  }, 30000);
}

window.setTimeout(function() {
  stopAnim();
}, 30000);
C.addEventListener("click", function() {
  cleanSlate()
}, false);