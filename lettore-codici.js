/* IL LETTORE DEI CODICI DELLE ETICHETTE (20/10/2026)
   ---------------------------------------------------------------------------
   Legge un QR o un codice a barre (Code 128, Code 39, EAN-13/UPC-A, EAN-8)
   dai pixel di un'immagine: un fotogramma della fotocamera o una foto. E apre
   la finestra della fotocamera, in fondo al file (LA FINESTRA).
   L'ha chiesto l'utente il 19/10/2026: «nella barra della ricerca [...] la
   fotocamera per poter inquadrare il codice qr o codice a barre dell'etichetta
   di un articolo per poter velocizzare la ricerca».

   Perche' un file a parte. Il catalogo al primo avvio pesava 1008 KB compressi
   su un tetto di 1024 (prova-pwa.js): questo lo scarica solo chi apre la
   fotocamera, e da allora il service worker lo tiene per quando manca la rete.
   Nella pagina restano l'icona, le scritte tradotte e cosa fare del testo
   letto (app-template.html, IL LETTORE DEI CODICI DELLE ETICHETTE).

   Perche' scritto qui e non preso fatto. Il catalogo funziona senza rete e non
   chiama nessuno: niente librerie da un sito esterno, niente immagini che
   escono dal telefono. Dove il browser ha un lettore suo (BarcodeDetector:
   Chrome ed Edge su Android) il catalogo usa anche quello; sull'iPhone e sui
   PC c'e' solo questo.

   Come si legge un QR, in breve: si rende l'immagine bianco e nero con una
   soglia che cambia da zona a zona (la luce sull'etichetta non e' mai
   uniforme), si cercano i tre mirini agli angoli (i quadrati 1:1:3:1:1), si
   misura il modulo, si raddrizza la prospettiva e si campiona la griglia; poi
   formato, maschera, blocchi, correzione degli errori (Reed-Solomon) e testo.
   La ricerca dei mirini, della figura di allineamento e il raddrizzamento
   seguono gli algoritmi della libreria libera ZXing
   (https://github.com/zxing/zxing, Copyright ZXing authors, licenza Apache
   2.0), riscritti qui; tabelle e regole sono quelle della norma ISO/IEC 18004.

   Si usa cosi':  LettoreCodici.leggi(pixelRGBA, larghezza, altezza)
   e risponde [{formato:'qr_code'|'code_128'|'code_39'|'ean_13'|'ean_8', testo}]
   (vuoto se non trova niente). I nomi dei formati sono quelli di
   BarcodeDetector, cosi' il catalogo tratta allo stesso modo le due strade.
   La finestra: LettoreCodici.apri({testi, letto, chiuso}), vedi li'.
   Le prove: _test/prova-lettore.js (Node) e _test/edge-lettore.mjs (Edge). */
(function (radice) {
'use strict';

/* ======================= IMMAGINE ======================= */

// la luminosita' di ogni pixel (0 nero, 255 bianco)
function grigi(px, w, h) {
  var n = w * h, g = new Uint8Array(n);
  for (var i = 0, j = 0; i < n; i++, j += 4) g[i] = (px[j] * 77 + px[j + 1] * 150 + px[j + 2] * 29) >> 8;
  return g;
}

/* Bianco e nero con la soglia di zona: blocchi di 8x8 pixel, e per ogni
   blocco la media dei 5x5 blocchi intorno. Un blocco senza contrasto (tutto
   etichetta, o tutto dentro un modulo nero) prende il «nero» dai vicini gia'
   visti, se no lo si legge chiaro. 1 = nero. */
function binarizza(g, w, h) {
  var B = 8, bw = Math.ceil(w / B), bh = Math.ceil(h / B), nero = new Float32Array(bw * bh);
  var bx, by, x, y;
  for (by = 0; by < bh; by++) for (bx = 0; bx < bw; bx++) {
    var y0 = by * B, x0 = bx * B, y1 = Math.min(h, y0 + B), x1 = Math.min(w, x0 + B);
    var min = 255, max = 0;
    for (y = y0; y < y1; y++) for (x = x0, o = y * w; x < x1; x++) {
      var v = g[o + x]; if (v < min) min = v; if (v > max) max = v;
    }
    /* A meta' fra il piu' chiaro e il piu' scuro del blocco, non la media: con
       l'immagine un po' sfocata (il QR di un centimetro, 3 pixel a modulo) la
       media di un blocco quasi tutto bianco alza la soglia, i grigi dell'orlo
       diventano neri e l'anello bianco del mirino da 3 pixel ne resta 1. Prova
       del 20/10/2026 su 32 scene difficili: lette 18 con la media, 31 cosi'. */
    var media = (min + max) / 2;
    if (max - min <= 24) {
      media = min / 2;
      if (by > 0 && bx > 0) {
        var vicini = (nero[(by - 1) * bw + bx] + 2 * nero[by * bw + bx - 1] + nero[(by - 1) * bw + bx - 1]) / 4;
        if (min < vicini) media = vicini;
      }
    }
    nero[by * bw + bx] = media;
  }
  var bit = new Uint8Array(w * h), o;
  for (by = 0; by < bh; by++) for (bx = 0; bx < bw; bx++) {
    var cx = Math.max(2, Math.min(bx, bw - 3)), cy = Math.max(2, Math.min(by, bh - 3)), s = 0, n = 0;
    for (var dy = -2; dy <= 2; dy++) {
      var yy = cy + dy; if (yy < 0 || yy >= bh) continue;
      for (var dx = -2; dx <= 2; dx++) { var xx = cx + dx; if (xx < 0 || xx >= bw) continue; s += nero[yy * bw + xx]; n++; }
    }
    var soglia = s / n, ya = by * B, xa = bx * B, yb = Math.min(h, ya + B), xb = Math.min(w, xa + B);
    for (y = ya; y < yb; y++) for (x = xa, o = y * w; x < xb; x++) bit[o + x] = g[o + x] <= soglia ? 1 : 0;
  }
  return bit;
}

/* ======================= QR: I TRE MIRINI ======================= */

function mirini(bit, w, h) {
  var cand = [];
  function nero(x, y) { return bit[y * w + x] === 1; }
  // nero-bianco-NERO-bianco-nero in proporzione 1:1:3:1:1
  function croce(c, larga) {
    var t = c[0] + c[1] + c[2] + c[3] + c[4];
    if (t < 7) return false;
    var m = t / 7, d = larga ? m / 1.333 : m / 2;
    return Math.abs(m - c[0]) < d && Math.abs(m - c[1]) < d && Math.abs(3 * m - c[2]) < 3 * d &&
      Math.abs(m - c[3]) < d && Math.abs(m - c[4]) < d;
  }
  // le cinque fasce lungo una retta che passa per (x0,y0): (1,0) orizzontale, (0,1) verticale
  function fasce(x0, y0, dx, dy, max) {
    var c = [0, 0, 0, 0, 0], x = x0, y = y0;
    while (x >= 0 && y >= 0 && nero(x, y)) { c[2]++; x -= dx; y -= dy; }
    if (x < 0 || y < 0) return null;
    while (x >= 0 && y >= 0 && !nero(x, y) && c[1] <= max) { c[1]++; x -= dx; y -= dy; }
    if (x < 0 || y < 0 || c[1] > max) return null;
    while (x >= 0 && y >= 0 && nero(x, y) && c[0] <= max) { c[0]++; x -= dx; y -= dy; }
    if (c[0] > max) return null;
    x = x0 + dx; y = y0 + dy;
    while (x < w && y < h && nero(x, y)) { c[2]++; x += dx; y += dy; }
    if (x >= w || y >= h) return null;
    while (x < w && y < h && !nero(x, y) && c[3] < max) { c[3]++; x += dx; y += dy; }
    if (x >= w || y >= h || c[3] >= max) return null;
    while (x < w && y < h && nero(x, y) && c[4] < max) { c[4]++; x += dx; y += dy; }
    if (c[4] >= max) return null;
    return { c: c, fine: dy ? y : x };
  }
  // ricontrolla in verticale (stretto=false) o in orizzontale (stretto=true): ridà il centro
  function ricontrolla(x, y, dx, dy, max, tot0, stretto) {
    var f = fasce(x, y, dx, dy, max);
    if (!f) return NaN;
    var c = f.c, t = c[0] + c[1] + c[2] + c[3] + c[4];
    if (5 * Math.abs(t - tot0) >= (stretto ? 1 : 2) * tot0) return NaN;
    return croce(c, false) ? f.fine - c[4] - c[3] - c[2] / 2 : NaN;
  }
  function diagonale(x0, y0) {
    var c = [0, 0, 0, 0, 0], i = 0;
    while (y0 >= i && x0 >= i && nero(x0 - i, y0 - i)) { c[2]++; i++; }
    if (!c[2]) return false;
    while (y0 >= i && x0 >= i && !nero(x0 - i, y0 - i)) { c[1]++; i++; }
    if (!c[1]) return false;
    while (y0 >= i && x0 >= i && nero(x0 - i, y0 - i)) { c[0]++; i++; }
    if (!c[0]) return false;
    i = 1;
    while (y0 + i < h && x0 + i < w && nero(x0 + i, y0 + i)) { c[2]++; i++; }
    while (y0 + i < h && x0 + i < w && !nero(x0 + i, y0 + i)) { c[3]++; i++; }
    if (!c[3]) return false;
    while (y0 + i < h && x0 + i < w && nero(x0 + i, y0 + i)) { c[4]++; i++; }
    if (!c[4]) return false;
    return croce(c, true);
  }
  function possibile(c, y, fine) {
    var tot = c[0] + c[1] + c[2] + c[3] + c[4];
    var cx = fine - c[4] - c[3] - c[2] / 2;
    var cy = ricontrolla(Math.floor(cx), y, 0, 1, c[2], tot, false);
    if (isNaN(cy)) return false;
    cx = ricontrolla(Math.floor(cx), Math.floor(cy), 1, 0, c[2], tot, true);
    if (isNaN(cx) || !diagonale(Math.floor(cx), Math.floor(cy))) return false;
    var m = tot / 7;
    for (var i = 0; i < cand.length; i++) {
      var p = cand[i];
      if (Math.abs(cy - p.y) <= m && Math.abs(cx - p.x) <= m) {
        var dm = Math.abs(m - p.m);
        if (dm <= 1 || dm <= p.m) {
          var n = p.n + 1;
          p.x = (p.n * p.x + cx) / n; p.y = (p.n * p.y + cy) / n; p.m = (p.n * p.m + m) / n; p.n = n;
          return true;
        }
      }
    }
    cand.push({ x: cx, y: cy, m: m, n: 1 });
    return true;
  }
  // una riga ogni due: il QR di un'etichetta e' largo un centimetro, i suoi mirini poche righe
  var c = [0, 0, 0, 0, 0];
  for (var y = 1; y < h; y += 2) {
    c[0] = c[1] = c[2] = c[3] = c[4] = 0;
    var s = 0, o = y * w;
    for (var x = 0; x < w; x++) {
      if (bit[o + x]) {
        if (s & 1) s++;
        c[s]++;
      } else if (!(s & 1)) {
        if (s === 4) {
          if (croce(c, false) && possibile(c, y, x)) { s = 0; c[0] = c[1] = c[2] = c[3] = c[4] = 0; }
          else { c[0] = c[2]; c[1] = c[3]; c[2] = c[4]; c[3] = 1; c[4] = 0; s = 3; }
        } else c[++s]++;
      } else c[s]++;
    }
    if (croce(c, false)) possibile(c, y, w);
  }
  return cand;
}

function d2(a, b) { var x = a.x - b.x, y = a.y - b.y; return x * x + y * y; }

/* Le terne di mirini che possono essere un QR: un triangolo rettangolo con i due
   lati uguali, mirini della stessa misura. Prima le piu' regolari; si provano
   le prime sei (l'etichetta da cui e' nata la richiesta ne ha due affiancate). */
function terne(cand) {
  var c = cand.slice().sort(function (a, b) { return b.n - a.n; }).slice(0, 12), out = [];
  for (var i = 0; i < c.length; i++) for (var j = i + 1; j < c.length; j++) for (var k = j + 1; k < c.length; k++) {
    var A = c[i], B = c[j], C = c[k];
    var mn = Math.min(A.m, B.m, C.m), mx = Math.max(A.m, B.m, C.m);
    if (mx > mn * 1.6) continue;                // in prospettiva il mirino lontano e' piu' piccolo
    var l = [d2(A, B), d2(B, C), d2(A, C)].sort(function (x, y) { return x - y; });
    if (l[0] < 81 * mn * mn) continue;          // centri a meno di 9 moduli: non sono un QR
    var dist = (Math.abs(l[2] - 2 * l[1]) + Math.abs(l[2] - 2 * l[0])) / l[2];
    if (dist < 0.5) out.push({ p: [A, B, C], d: dist });
  }
  out.sort(function (a, b) { return a.d - b.d; });
  return out.slice(0, 6);
}

// chi e' in alto a sinistra (l'angolo retto), in alto a destra e in basso a sinistra
function ordina(p) {
  var a = p[0], b = p[1], c = p[2], ab = d2(a, b), bc = d2(b, c), ac = d2(a, c), A, B, C;
  if (bc >= ab && bc >= ac) { B = a; A = b; C = c; }
  else if (ac >= bc && ac >= ab) { B = b; A = a; C = c; }
  else { B = c; A = a; C = b; }
  if ((C.x - B.x) * (A.y - B.y) - (C.y - B.y) * (A.x - B.x) < 0) { var t = A; A = C; C = t; }
  return { bl: A, tl: B, tr: C };
}

/* La misura del modulo lungo la retta fra due mirini: la fascia nero-bianco-nero
   del mirino misurata nei due versi (vale 7 moduli), anche se l'etichetta e'
   storta. */
function corsaBNB(bit, w, fx, fy, tx, ty) {
  var ripido = Math.abs(ty - fy) > Math.abs(tx - fx), t;
  if (ripido) { t = fx; fx = fy; fy = t; t = tx; tx = ty; ty = t; }
  var dx = Math.abs(tx - fx), dy = Math.abs(ty - fy), err = -(dx >> 1);
  var sx = fx < tx ? 1 : -1, sy = fy < ty ? 1 : -1, stato = 0, lim = tx + sx;
  for (var x = fx, y = fy; x !== lim; x += sx) {
    var rx = ripido ? y : x, ry = ripido ? x : y;
    if ((stato === 1) === (bit[ry * w + rx] === 1)) {
      if (stato === 2) return Math.sqrt((x - fx) * (x - fx) + (y - fy) * (y - fy));
      stato++;
    }
    err += dy;
    if (err > 0) { if (y === ty) break; y += sy; err -= dx; }
  }
  if (stato === 2) return Math.sqrt((tx + sx - fx) * (tx + sx - fx) + (ty - fy) * (ty - fy));
  return NaN;
}
function corsaDoppia(bit, w, h, fx, fy, tx, ty) {
  var r = corsaBNB(bit, w, fx, fy, tx, ty), sc = 1, ox = fx - (tx - fx);
  if (ox < 0) { sc = fx / (fx - ox); ox = 0; }
  else if (ox >= w) { sc = (w - 1 - fx) / (ox - fx); ox = w - 1; }
  var oy = (fy - (ty - fy) * sc) | 0;
  sc = 1;
  if (oy < 0) { sc = fy / (fy - oy); oy = 0; }
  else if (oy >= h) { sc = (h - 1 - fy) / (oy - fy); oy = h - 1; }
  ox = (fx + (ox - fx) * sc) | 0;
  return r + corsaBNB(bit, w, fx, fy, ox, oy) - 1;
}
function modulo(bit, w, h, tl, tr, bl) {
  function unaVia(a, b) {
    var e1 = corsaDoppia(bit, w, h, a.x | 0, a.y | 0, b.x | 0, b.y | 0);
    var e2 = corsaDoppia(bit, w, h, b.x | 0, b.y | 0, a.x | 0, a.y | 0);
    if (isNaN(e1)) return e2 / 7;
    if (isNaN(e2)) return e1 / 7;
    return (e1 + e2) / 14;
  }
  return (unaVia(tl, tr) + unaVia(tl, bl)) / 2;
}

// i lati del QR in moduli: 4·versione + 17. Prima la stima, poi le versioni vicine
function lati(tl, tr, bl, m) {
  var a = Math.round(Math.sqrt(d2(tl, tr)) / m), b = Math.round(Math.sqrt(d2(tl, bl)) / m);
  var d = ((a + b) >> 1) + 7, r = d & 3, out;
  if (r === 0) out = [d + 1, d - 3, d + 5];
  else if (r === 1) out = [d, d - 4, d + 4];
  else if (r === 2) out = [d - 1, d + 3, d - 5];
  else out = [d - 2, d + 2];
  return out.filter(function (x) { return x >= 21 && x <= 177; });
}

/* La figura di allineamento (dalla versione 2): bianco-nero-bianco 1:1:1 intorno
   a dove dovrebbe stare, cercando dal centro verso fuori. */
function allineamento(bit, w, h, m, ex, ey, fatt) {
  var amp = Math.floor(fatt * m);
  var x0 = Math.max(0, ex - amp), x1 = Math.min(w - 1, ex + amp);
  if (x1 - x0 < m * 3) return null;
  var y0 = Math.max(0, ey - amp), y1 = Math.min(h - 1, ey + amp);
  if (y1 - y0 < m * 3) return null;
  var alt = y1 - y0, maxJ = x1, mid = y0 + (alt >> 1), cand = [];
  function nero(x, y) { return bit[y * w + x] === 1; }
  function croce3(c) { var d = m / 2; return Math.abs(m - c[0]) < d && Math.abs(m - c[1]) < d && Math.abs(m - c[2]) < d; }
  function verticale(si, cj, max, tot0) {
    var c = [0, 0, 0], i = si;
    while (i >= 0 && nero(cj, i) && c[1] <= max) { c[1]++; i--; }
    if (i < 0 || c[1] > max) return NaN;
    while (i >= 0 && !nero(cj, i) && c[0] <= max) { c[0]++; i--; }
    if (c[0] > max) return NaN;
    i = si + 1;
    while (i < h && nero(cj, i) && c[1] <= max) { c[1]++; i++; }
    if (i === h || c[1] > max) return NaN;
    while (i < h && !nero(cj, i) && c[2] <= max) { c[2]++; i++; }
    if (c[2] > max) return NaN;
    var t = c[0] + c[1] + c[2];
    if (5 * Math.abs(t - tot0) >= 2 * tot0) return NaN;
    return croce3(c) ? i - c[2] - c[1] / 2 : NaN;
  }
  function centro(c, i, j) {
    var tot = c[0] + c[1] + c[2], cj = j - c[2] - c[1] / 2, ci = verticale(i, cj | 0, 2 * c[1], tot);
    if (isNaN(ci)) return null;
    var em = tot / 3;
    for (var k = 0; k < cand.length; k++) {
      var p = cand[k];
      if (Math.abs(ci - p.y) <= em && Math.abs(cj - p.x) <= em) {
        var dm = Math.abs(em - p.m);
        if (dm <= 1 || dm <= p.m) return { x: (p.x + cj) / 2, y: (p.y + ci) / 2, m: (p.m + em) / 2 };
      }
    }
    cand.push({ x: cj, y: ci, m: em });
    return null;
  }
  var c = [0, 0, 0], r;
  for (var g = 0; g < alt; g++) {
    var i = mid + ((g & 1) === 0 ? (g + 1) >> 1 : -((g + 1) >> 1));
    if (i < 0 || i >= h) continue;
    c[0] = c[1] = c[2] = 0;
    var j = x0, s = 0;
    while (j < maxJ && !nero(j, i)) j++;
    for (; j < maxJ; j++) {
      if (nero(j, i)) {
        if (s === 1) c[1]++;
        else if (s === 2) {
          if (croce3(c) && (r = centro(c, i, j))) return r;
          c[0] = c[2]; c[1] = 1; c[2] = 0; s = 1;
        } else c[++s]++;
      } else {
        if (s === 1) s++;
        c[s]++;
      }
    }
    if (croce3(c) && (r = centro(c, i, maxJ))) return r;
  }
  return cand.length ? cand[0] : null;
}

/* ======================= QR: DALLA FOTO ALLA GRIGLIA ======================= */

// la prospettiva: matrici 3x3 scritte per righe di colonne come in ZXing (a11 a21 a31 a12 ...)
function quadrato(x0, y0, x1, y1, x2, y2, x3, y3) {
  var dx3 = x0 - x1 + x2 - x3, dy3 = y0 - y1 + y2 - y3;
  if (dx3 === 0 && dy3 === 0) return [x1 - x0, x2 - x1, x0, y1 - y0, y2 - y1, y0, 0, 0, 1];
  var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, den = dx1 * dy2 - dx2 * dy1;
  var a13 = (dx3 * dy2 - dx2 * dy3) / den, a23 = (dx1 * dy3 - dx3 * dy1) / den;
  return [x1 - x0 + a13 * x1, x3 - x0 + a23 * x3, x0, y1 - y0 + a13 * y1, y3 - y0 + a23 * y3, y0, a13, a23, 1];
}
function aggiunta(t) {
  var a11 = t[0], a21 = t[1], a31 = t[2], a12 = t[3], a22 = t[4], a32 = t[5], a13 = t[6], a23 = t[7], a33 = t[8];
  return [a22 * a33 - a23 * a32, a23 * a31 - a21 * a33, a21 * a32 - a22 * a31,
    a13 * a32 - a12 * a33, a11 * a33 - a13 * a31, a12 * a31 - a11 * a32,
    a12 * a23 - a13 * a22, a13 * a21 - a11 * a23, a11 * a22 - a12 * a21];
}
function per(a, b) {
  return [a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8]];
}
function quadQuad(da, a) {
  return per(quadrato(a[0], a[1], a[2], a[3], a[4], a[5], a[6], a[7]),
    aggiunta(quadrato(da[0], da[1], da[2], da[3], da[4], da[5], da[6], da[7])));
}
function trasforma(t, x, y) {
  var d = t[6] * x + t[7] * y + t[8];
  return [(t[0] * x + t[1] * y + t[2]) / d, (t[3] * x + t[4] * y + t[5]) / d];
}
/* Dalla griglia (moduli) all'immagine: i centri dei mirini stanno a 3,5 moduli
   dal bordo; il quarto punto e' la figura di allineamento (a dim-6,5) o, senza,
   l'angolo in basso a destra stimato come in un parallelogramma (a dim-3,5). */
function trasformazione(tl, tr, bl, quarto, s4, dim) {
  var e = dim - 3.5;
  return quadQuad([3.5, 3.5, e, 3.5, s4, s4, 3.5, e], [tl.x, tl.y, tr.x, tr.y, quarto.x, quarto.y, bl.x, bl.y]);
}
function campiona(bit, w, h, t, dim) {
  var m = new Uint8Array(dim * dim);
  for (var y = 0; y < dim; y++) for (var x = 0; x < dim; x++) {
    var p = trasforma(t, x + 0.5, y + 0.5), px = Math.floor(p[0]), py = Math.floor(p[1]);
    if (!(px >= -1 && py >= -1 && px <= w && py <= h)) return null;   // anche NaN: fuori di molto, niente
    if (px < 0) px = 0; else if (px >= w) px = w - 1;
    if (py < 0) py = 0; else if (py >= h) py = h - 1;
    m[y * dim + x] = bit[py * w + px];
  }
  return m;
}

/* ======================= QR: LE REGOLE DELLA NORMA ======================= */

// codewords di correzione per blocco e numero di blocchi, per versione 1-40; righe L, M, Q, H
var EC_BLOCCO = [
  [7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]];
var BLOCCHI = [
  [1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81]];

// i centri delle figure di allineamento (la regola che rida' la tabella della norma)
function allineamenti(ver) {
  if (ver === 1) return [];
  var n = Math.floor(ver / 7) + 2, passo = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2, out = [6];
  for (var i = n - 1, pos = ver * 4 + 10; i >= 1; i--, pos -= passo) out[i] = pos;
  return out;
}
// quante codeword ci stanno (i moduli che restano tolte le figure fisse, diviso 8)
function codewordTotali(ver) {
  var r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { var n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
  return r >> 3;
}
// i moduli fissi: mirini, separatori, formato, tempi, allineamenti, versione
function funzione(ver, dim) {
  var f = new Uint8Array(dim * dim);
  function zona(x0, y0, w, h) { for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) f[y * dim + x] = 1; }
  zona(0, 0, 9, 9); zona(dim - 8, 0, 8, 9); zona(0, dim - 8, 9, 8);
  var al = allineamenti(ver), n = al.length;
  for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
    if ((i === 0 && (j === 0 || j === n - 1)) || (i === n - 1 && j === 0)) continue;
    zona(al[i] - 2, al[j] - 2, 5, 5);
  }
  zona(6, 9, 1, dim - 17); zona(9, 6, dim - 17, 1);
  if (ver > 6) { zona(dim - 11, 0, 3, 6); zona(0, dim - 11, 6, 3); }
  return f;
}
function pop(v) { var n = 0; while (v) { n += v & 1; v >>>= 1; } return n; }
function bch(dato, bit, gen) {
  var v = dato << bit;
  for (var i = 31 - Math.clz32(v); i >= bit; i--) if (v & (1 << i)) v ^= gen << (i - bit);
  return (dato << bit) | v;
}
var FORMATI = [], VERSIONI = [];
for (var d0 = 0; d0 < 32; d0++) FORMATI.push(bch(d0, 10, 0x537) ^ 0x5412);
for (var v0 = 7; v0 <= 40; v0++) VERSIONI.push(bch(v0, 12, 0x1F25));
function vicino(tab, v) {
  var meglio = 4, k = -1;
  for (var i = 0; i < tab.length; i++) { var d = pop(tab[i] ^ v); if (d < meglio) { meglio = d; k = i; } }
  return k;
}
// le due copie del formato (livello di correzione e maschera), con fino a 3 bit sbagliati
function formato(m, dim) {
  function g(x, y) { return m[y * dim + x]; }
  var a = 0, b = 0, i;
  for (i = 0; i < 6; i++) a = (a << 1) | g(i, 8);
  a = (a << 1) | g(7, 8); a = (a << 1) | g(8, 8); a = (a << 1) | g(8, 7);
  for (i = 5; i >= 0; i--) a = (a << 1) | g(8, i);
  for (i = dim - 1; i >= dim - 7; i--) b = (b << 1) | g(8, i);
  for (i = dim - 8; i < dim; i++) b = (b << 1) | g(i, 8);
  var ka = vicino(FORMATI, a), kb = vicino(FORMATI, b), k = ka;
  if (k < 0 || (kb >= 0 && pop(FORMATI[kb] ^ b) < pop(FORMATI[ka] ^ a))) k = kb;
  if (k < 0) return null;
  return { liv: [1, 0, 3, 2][k >> 3], maschera: k & 7 };   // nei bit: 00 M, 01 L, 10 H, 11 Q
}
// la versione scritta nel codice (dalla 7): -1 se illeggibile, se no il numero
function versione(m, dim) {
  var a = 0, b = 0, i, j;
  for (j = 5; j >= 0; j--) for (i = dim - 9; i >= dim - 11; i--) a = (a << 1) | m[j * dim + i];
  for (i = 5; i >= 0; i--) for (j = dim - 9; j >= dim - 11; j--) b = (b << 1) | m[j * dim + i];
  var ka = vicino(VERSIONI, a), kb = vicino(VERSIONI, b);
  return ka >= 0 ? ka + 7 : kb >= 0 ? kb + 7 : -1;
}
function mascherato(k, i, j) {   // i riga, j colonna
  switch (k) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return (i * j) % 2 + (i * j) % 3 === 0;
    case 6: return ((i * j) % 2 + (i * j) % 3) % 2 === 0;
    default: return ((i + j) % 2 + (i * j) % 3) % 2 === 0;
  }
}
// le codeword nell'ordine della norma: colonne a due a due da destra, su e giu'
function codeword(m, dim, fun, tot) {
  var out = new Uint8Array(tot), k = 0, b = 0, nb = 0, su = true;
  for (var j = dim - 1; j > 0; j -= 2) {
    if (j === 6) j--;
    for (var c = 0; c < dim; c++) {
      var i = su ? dim - 1 - c : c;
      for (var col = 0; col < 2; col++) {
        var p = i * dim + j - col;
        if (fun[p]) continue;
        b = (b << 1) | m[p]; nb++;
        if (nb === 8) { if (k < tot) out[k] = b; k++; b = 0; nb = 0; }
      }
    }
    su = !su;
  }
  return k === tot ? out : null;
}
// le codeword sono mescolate fra i blocchi: si rimettono a posto
function blocchi(raw, ver, liv) {
  var nb = BLOCCHI[liv][ver - 1], ecc = EC_BLOCCO[liv][ver - 1], tot = raw.length;
  var corti = nb - tot % nb, dati = Math.floor(tot / nb) - ecc, b = [], k = 0, i, j;
  if (dati < 1) return null;
  for (i = 0; i < nb; i++) b.push(new Uint8Array(dati + (i >= corti ? 1 : 0) + ecc));
  for (j = 0; j < dati; j++) for (i = 0; i < nb; i++) b[i][j] = raw[k++];
  for (i = corti; i < nb; i++) b[i][dati] = raw[k++];
  for (j = 0; j < ecc; j++) for (i = 0; i < nb; i++) b[i][(i >= corti ? dati + 1 : dati) + j] = raw[k++];
  return { b: b, ecc: ecc };
}

/* ======================= REED-SOLOMON ======================= */

// il campo a 256 elementi del QR: polinomio 0x11D, radici da alfa^0
var ESP = new Uint8Array(512), LOG = new Uint8Array(256);
(function () { var x = 1; for (var i = 0; i < 255; i++) { ESP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11D; } for (i = 255; i < 512; i++) ESP[i] = ESP[i - 255]; })();
function mul(a, b) { return a && b ? ESP[LOG[a] + LOG[b]] : 0; }
function dvd(a, b) { return a ? ESP[LOG[a] + 255 - LOG[b]] : 0; }
function sindromi(cw, necc) {
  var S = [], tutte0 = true;
  for (var j = 0; j < necc; j++) {
    var s = 0, a = ESP[j];
    for (var k = 0; k < cw.length; k++) s = mul(s, a) ^ cw[k];
    S.push(s); if (s) tutte0 = false;
  }
  return tutte0 ? null : S;
}
/* Corregge sul posto fino a necc/2 codeword sbagliate (Berlekamp-Massey, Chien,
   Forney). false = troppi errori: meglio non leggere che leggere sbagliato. */
function correggi(cw, necc) {
  var S = sindromi(cw, necc), n = cw.length, i, j;
  if (!S) return true;
  var C = [1], B = [1], L = 0, m = 1, b = 1;
  for (var r = 0; r < necc; r++) {
    var d = S[r];
    for (i = 1; i <= L; i++) d ^= mul(C[i] || 0, S[r - i]);
    if (!d) { m++; continue; }
    var coef = dvd(d, b), T = C.slice();
    while (C.length < B.length + m) C.push(0);
    for (i = 0; i < B.length; i++) C[i + m] ^= mul(coef, B[i]);
    if (2 * L <= r) { L = r + 1 - L; B = T; b = d; m = 1; } else m++;
  }
  while (C.length > 1 && !C[C.length - 1]) C.pop();
  if (C.length - 1 !== L || 2 * L > necc) return false;
  var pos = [];
  for (var p = 0; p < n; p++) {
    var xi = ESP[(255 - p) % 255], v = 0;
    for (i = C.length - 1; i >= 0; i--) v = mul(v, xi) ^ C[i];
    if (!v) pos.push(p);
  }
  if (pos.length !== L) return false;
  var O = [];
  for (i = 0; i < necc; i++) { var o = 0; for (j = 0; j <= i && j < C.length; j++) o ^= mul(S[i - j], C[j]); O.push(o); }
  for (var e = 0; e < pos.length; e++) {
    var P = pos[e], X = ESP[P], Xi = ESP[(255 - P) % 255], om = 0, dl = 0;
    for (i = O.length - 1; i >= 0; i--) om = mul(om, Xi) ^ O[i];
    for (i = 1; i < C.length; i += 2) dl ^= mul(C[i], ESP[((255 - P) * (i - 1)) % 255]);
    if (!dl) return false;
    cw[n - 1 - P] ^= mul(X, dvd(om, dl));
  }
  return !sindromi(cw, necc);
}

/* ======================= QR: IL TESTO ======================= */

var ALFANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
// UTF-8 severo: null se i byte non lo sono (allora erano Latin-1)
function utf8(b) {
  var s = '', i = 0;
  while (i < b.length) {
    var c = b[i++], n = 0, v;
    if (c < 0x80) { s += String.fromCharCode(c); continue; }
    if (c >= 0xC2 && c < 0xE0) { n = 1; v = c & 0x1F; }
    else if (c >= 0xE0 && c < 0xF0) { n = 2; v = c & 0x0F; }
    else if (c >= 0xF0 && c < 0xF5) { n = 3; v = c & 0x07; }
    else return null;
    if (i + n > b.length) return null;
    for (var k = 0; k < n; k++) { var x = b[i++]; if ((x & 0xC0) !== 0x80) return null; v = (v << 6) | (x & 0x3F); }
    if ((n === 2 && v < 0x800) || (n === 3 && (v < 0x10000 || v > 0x10FFFF)) || (v >= 0xD800 && v < 0xE000)) return null;
    s += String.fromCodePoint(v);
  }
  return s;
}
function daByte(b, eci) {
  if (eci === 20 && typeof TextDecoder !== 'undefined') { try { return new TextDecoder('shift_jis').decode(b); } catch (e) { } }
  if (eci < 0 || eci === 26) { var u = utf8(b); if (u !== null) return u; }
  var s = '';
  for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}
function testoQR(dati, ver) {
  var pos = 0, tot = dati.length * 8, out = '', eci = -1, f = ver < 10 ? 0 : ver < 27 ? 1 : 2;
  function bits(n) {
    if (pos + n > tot) throw new Error('fine');
    var v = 0;
    for (var k = 0; k < n; k++, pos++) v = (v << 1) | ((dati[pos >> 3] >> (7 - (pos & 7))) & 1);
    return v;
  }
  var n, v, k;
  while (tot - pos >= 4) {
    var modo = bits(4);
    if (modo === 0) break;
    if (modo === 7) {                               // ECI: la codifica dei byte che seguono
      var e = bits(8);
      if ((e & 0x80) === 0) eci = e;
      else if ((e & 0xC0) === 0x80) eci = ((e & 0x3F) << 8) | bits(8);
      else if ((e & 0xE0) === 0xC0) eci = ((e & 0x1F) << 16) | bits(16);
      else throw new Error('eci');
    } else if (modo === 3) bits(16);                // un pezzo di una serie di QR: si legge questo
    else if (modo === 5) { }                        // FNC1 (GS1)
    else if (modo === 9) bits(8);
    else if (modo === 1) {                          // cifre: tre ogni 10 bit
      n = bits([10, 12, 14][f]);
      for (; n >= 3; n -= 3) { v = bits(10); if (v > 999) throw new Error('num'); out += (v < 100 ? '0' : '') + (v < 10 ? '0' : '') + v; }
      if (n === 2) { v = bits(7); if (v > 99) throw new Error('num'); out += (v < 10 ? '0' : '') + v; }
      else if (n === 1) { v = bits(4); if (v > 9) throw new Error('num'); out += v; }
    } else if (modo === 2) {                        // maiuscole e cifre: due ogni 11 bit
      n = bits([9, 11, 13][f]);
      for (; n >= 2; n -= 2) { v = bits(11); if (v >= 2025) throw new Error('alfa'); out += ALFANUM[(v / 45) | 0] + ALFANUM[v % 45]; }
      if (n === 1) { v = bits(6); if (v >= 45) throw new Error('alfa'); out += ALFANUM[v]; }
    } else if (modo === 4) {                        // byte
      n = bits([8, 16, 16][f]);
      var b = new Uint8Array(n);
      for (k = 0; k < n; k++) b[k] = bits(8);
      out += daByte(b, eci);
    } else if (modo === 8) {                        // kanji
      n = bits([8, 10, 12][f]);
      var sj = new Uint8Array(2 * n);
      for (k = 0; k < n; k++) {
        v = bits(13); var a = (Math.floor(v / 0xC0) << 8) | (v % 0xC0);
        a += a < 0x1F00 ? 0x8140 : 0xC140; sj[2 * k] = a >> 8; sj[2 * k + 1] = a & 0xFF;
      }
      out += daByte(sj, 20);
    } else throw new Error('modo');
  }
  return out;
}

function decodificaUna(m0, dim) {
  if (!m0) return null;
  var m = new Uint8Array(m0), f = formato(m, dim);
  if (!f) return null;
  var ver = (dim - 17) >> 2;
  if (ver >= 7) { var vl = versione(m, dim); if (vl > 0 && vl !== ver) return null; }
  var fun = funzione(ver, dim);
  for (var i = 0; i < dim; i++) for (var j = 0; j < dim; j++) if (mascherato(f.maschera, i, j)) m[i * dim + j] ^= 1;
  var raw = codeword(m, dim, fun, codewordTotali(ver));
  if (!raw) return null;
  var bl = blocchi(raw, ver, f.liv);
  if (!bl) return null;
  var dati = [];
  for (var k = 0; k < bl.b.length; k++) {
    var b = bl.b[k];
    if (!correggi(b, bl.ecc)) return null;
    for (var x = 0; x < b.length - bl.ecc; x++) dati.push(b[x]);
  }
  try { return testoQR(dati, ver); } catch (e) { return null; }
}
// anche allo specchio (un QR stampato rovescio, o fotografato da dietro un vetro)
function decodificaMatrice(m, dim) {
  var r = decodificaUna(m, dim);
  if (r !== null) return r;
  var t = new Uint8Array(dim * dim);
  for (var y = 0; y < dim; y++) for (var x = 0; x < dim; x++) t[x * dim + y] = m[y * dim + x];
  return decodificaUna(t, dim);
}

/* Senza figura di allineamento (la versione 1, quella delle etichette) il
   quarto angolo e' una stima da parallelogramma: con l'etichetta inquadrata di
   sbieco sbaglia di qualche modulo, e in basso a destra si campiona altro.
   Allora lo si sposta un modulo per volta intorno alla stima, dai passi piu'
   corti, e vale la posizione che la correzione degli errori accetta: un QR
   campionato male non passa il Reed-Solomon. */
function cercaAngolo(bit, w, h, o, base, s4, dim) {
  var e = dim - 7, ux = (o.tr.x - o.tl.x) / e, uy = (o.tr.y - o.tl.y) / e, vx = (o.bl.x - o.tl.x) / e, vy = (o.bl.y - o.tl.y) / e;
  var R = dim <= 41 ? 5 : 3, passi = [], a, b;
  for (a = -R; a <= R; a++) for (b = -R; b <= R; b++) if (a || b) passi.push([a, b, a * a + b * b]);
  passi.sort(function (p, q) { return p[2] - q[2]; });
  for (var i = 0; i < passi.length; i++) {
    var p = { x: base.x + passi[i][0] * ux + passi[i][1] * vx, y: base.y + passi[i][0] * uy + passi[i][1] * vy };
    var r = decodificaUna(campiona(bit, w, h, trasformazione(o.tl, o.tr, o.bl, p, s4, dim), dim), dim);
    if (r !== null) return r;
  }
  return null;
}
function daMirini(bit, w, h, o, cerca) {
  var m = modulo(bit, w, h, o.tl, o.tr, o.bl);
  if (!(m >= 1)) m = (o.tl.m + o.tr.m + o.bl.m) / 3;
  if (!(m >= 1)) return null;
  var dd = lati(o.tl, o.tr, o.bl, m), br = { x: o.tr.x - o.tl.x + o.bl.x, y: o.tr.y - o.tl.y + o.bl.y };
  for (var k = 0; k < dd.length; k++) {
    var dim = dd[k], ver = (dim - 17) >> 2, al = null, r = null, mat;
    if (ver >= 2) {
      var corr = 1 - 3 / (dim - 7), ex = (o.tl.x + corr * (br.x - o.tl.x)) | 0, ey = (o.tl.y + corr * (br.y - o.tl.y)) | 0;
      for (var f = 4; f <= 16 && !al; f <<= 1) al = allineamento(bit, w, h, m, ex, ey, f);
    }
    if (al) {
      mat = campiona(bit, w, h, trasformazione(o.tl, o.tr, o.bl, al, dim - 6.5, dim), dim);
      if (mat) r = decodificaMatrice(mat, dim);
    }
    if (r === null) {                      // senza allineamento, o con uno sbagliato: il parallelogramma
      mat = campiona(bit, w, h, trasformazione(o.tl, o.tr, o.bl, br, dim - 3.5, dim), dim);
      if (mat) r = decodificaMatrice(mat, dim);
    }
    // il formato si legge (sta vicino ai tre mirini): e' un QR vero, manca solo l'angolo giusto
    if (r === null && cerca && k === 0 && mat && formato(mat, dim))
      r = al ? cercaAngolo(bit, w, h, o, al, dim - 6.5, dim) : cercaAngolo(bit, w, h, o, br, dim - 3.5, dim);
    if (r !== null) return r;
  }
  return null;
}
function leggiQR(bit, w, h) {
  var c = mirini(bit, w, h);
  if (c.length < 3) return null;
  var tt = terne(c);
  for (var i = 0; i < tt.length; i++) {
    var r = daMirini(bit, w, h, ordina(tt[i].p), i < 2);
    if (r !== null) return r;
  }
  return null;
}

/* ======================= CODICI A BARRE ======================= */

/* Una riga (o una colonna) dell'immagine diventa la sequenza delle larghezze
   delle barre e degli spazi, a frazioni di pixel: gli orli si mettono dove la
   luminosita' attraversa la soglia, non sul pixel intero. Con moduli di due
   pixel, mezzo pixel e' un quarto di modulo. La prima e l'ultima fascia sono
   bianche (anche larghe zero). */
function profilo(g, w, h, pos, oriz) {
  var n = oriz ? w : h, lim = oriz ? h : w, p = new Float32Array(n);
  for (var d = -1; d <= 1; d++) {
    var q = Math.min(Math.max(pos + d, 0), lim - 1), i;
    if (oriz) for (i = 0; i < n; i++) p[i] += g[q * w + i];
    else for (i = 0; i < n; i++) p[i] += g[i * w + q];
  }
  for (var k = 0; k < n; k++) p[k] /= 3;
  return p;
}
function corse(p, locale) {
  var n = p.length, s = new Float32Array(n), i;
  if (locale) {                    // a meta' fra il chiaro e lo scuro di qui intorno
    var R = Math.max(8, Math.round(n / 24)), nb = Math.ceil(n / R), mn = [], mx = [];
    for (var b = 0; b < nb; b++) {
      var lo = 255, hi = 0;
      for (i = b * R; i < Math.min(n, (b + 1) * R); i++) { if (p[i] < lo) lo = p[i]; if (p[i] > hi) hi = p[i]; }
      mn.push(lo); mx.push(hi);
    }
    for (i = 0; i < n; i++) {
      var bb = (i / R) | 0, l2 = 255, h2 = 0;
      for (var k = Math.max(0, bb - 1); k <= Math.min(nb - 1, bb + 1); k++) { if (mn[k] < l2) l2 = mn[k]; if (mx[k] > h2) h2 = mx[k]; }
      s[i] = h2 - l2 < 24 ? -1 : (h2 + l2) / 2;     // -1: niente contrasto, e' fondo
    }
  } else {                         // una soglia sola per la riga
    var ord = Array.prototype.slice.call(p).sort(function (x, y) { return x - y; });
    var a5 = ord[Math.floor(n * 0.05)], a95 = ord[Math.floor(n * 0.95)];
    if (a95 - a5 < 24) return null;
    s.fill((a5 + a95) / 2);
  }
  var out = [], prec = 0, nero = false;
  for (i = 0; i < n; i++) {
    var v = s[i] >= 0 && p[i] < s[i];
    if (v === nero) continue;
    var pos = i;
    if (i > 0 && s[i] >= 0) { var d0 = p[i - 1] - s[i], d1 = p[i] - s[i]; if (d0 !== d1) pos = i - 1 + d0 / (d0 - d1); }
    if (pos < prec) pos = prec;
    out.push(pos - prec); prec = pos; nero = v;
  }
  out.push(n - prec);
  if (nero) out.push(0);
  return out;
}
function somma(c, o, n) { var t = 0; for (var i = 0; i < n; i++) t += c[o + i]; return t; }
// quanto le fasce c[o..] somigliano al disegno pat (0 identico; Infinity se una fascia sballa)
function scarto(c, o, pat, maxSingolo) {
  var tot = 0, ptot = 0, i;
  if (o + pat.length > c.length) return Infinity;
  for (i = 0; i < pat.length; i++) { tot += c[o + i]; ptot += pat[i]; }
  if (tot < ptot) return Infinity;           // meno di un pixel per modulo: non si legge
  var u = tot / ptot, lim = maxSingolo * u, v = 0;
  for (i = 0; i < pat.length; i++) { var d = Math.abs(c[o + i] - pat[i] * u); if (d > lim) return Infinity; v += d; }
  return v / tot;
}

/* Code 128: 107 simboli da 6 fasce (11 moduli), lo stop ne ha 7. */
var C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 ' +
  '122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 ' +
  '322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 ' +
  '132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 ' +
  '332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 ' +
  '142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 ' +
  '212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 ' +
  '211214 211232 2331112').split(' ').map(function (s) { return s.split('').map(Number); });
function testo128(start, cod) {
  var set = start === 103 ? 'A' : start === 104 ? 'B' : 'C', out = '', cambio = false;
  for (var k = 0; k < cod.length; k++) {
    var v = cod[k], cs = set;
    if (cambio) { cs = set === 'A' ? 'B' : 'A'; cambio = false; }
    if (v === 102) { if (k > 0) out += '\x1d'; continue; }        // FNC1: separatore GS1
    if (cs === 'C') {
      if (v < 100) out += (v < 10 ? '0' : '') + v;
      else if (v === 100) set = 'B'; else if (v === 101) set = 'A';
      else return null;
    } else if (v < 64) out += String.fromCharCode(v + 32);
    else if (v < 96) out += String.fromCharCode(cs === 'A' ? v - 64 : v + 32);
    else if (v === 98) cambio = true;
    else if (v === 99) set = 'C';
    else if (v === 100 && cs === 'A') set = 'B';
    else if (v === 101 && cs === 'B') set = 'A';
    // 96 e 97 (FNC3, FNC2) e FNC4: niente testo
  }
  return out;
}
function c128(c) {
  for (var i = 1; i + 6 < c.length; i += 2) {
    var meglio = 0.25, start = -1, s, v;
    for (s = 103; s <= 105; s++) { v = scarto(c, i, C128[s], 0.7); if (v < meglio) { meglio = v; start = s; } }
    if (start < 0) continue;
    if (i > 1 && c[i - 1] < somma(c, i, 6) / 2) continue;         // margine bianco davanti
    var j = i + 6, cod = [], fermo = false;
    while (j + 6 <= c.length) {
      var best = 0.25, k = -1;
      for (s = 0; s < 107; s++) { v = scarto(c, j, C128[s], 0.7); if (v < best) { best = v; k = s; } }
      if (k < 0 || (k >= 103 && k <= 105)) break;
      if (k === 106) {
        var dopo = j + 7 < c.length ? c[j + 7] : 0;
        fermo = j + 7 >= c.length - 1 || dopo >= somma(c, j, 7) / 2;  // margine bianco dopo
        break;
      }
      cod.push(k); j += 6;
    }
    if (!fermo || cod.length < 2) continue;
    var ck = cod.pop(), tot = start;
    for (var x = 0; x < cod.length; x++) tot += (x + 1) * cod[x];
    if (tot % 103 !== ck) continue;
    var t = testo128(start, cod);
    if (t) return t;
  }
  return null;
}

/* Code 39: 9 fasce, 3 larghe; nessuna cifra di controllo obbligatoria. */
var C39A = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*';
var C39 = [0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064, 0x109, 0x049, 0x148, 0x019,
  0x118, 0x058, 0x00D, 0x10C, 0x04C, 0x01C, 0x103, 0x043, 0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016,
  0x181, 0x0C1, 0x1C0, 0x091, 0x190, 0x0D0, 0x085, 0x184, 0x0C4, 0x0A8, 0x0A2, 0x08A, 0x02A, 0x094];
function strettoLargo(c, o) {
  if (o + 9 > c.length) return -1;
  var maxS = 0, larghi;
  do {
    var min = Infinity, i, v;
    for (i = 0; i < 9; i++) { v = c[o + i]; if (v < min && v > maxS) min = v; }
    maxS = min; larghi = 0;
    var totL = 0, pat = 0;
    for (i = 0; i < 9; i++) { v = c[o + i]; if (v > maxS) { pat |= 1 << (8 - i); larghi++; totL += v; } }
    if (larghi === 3) {
      for (i = 0; i < 9 && larghi > 0; i++) { v = c[o + i]; if (v > maxS) { larghi--; if (v * 2 >= totL) return -1; } }
      return pat;
    }
  } while (larghi > 3);
  return -1;
}
function c39(c) {
  for (var i = 1; i + 9 <= c.length; i += 2) {
    if (strettoLargo(c, i) !== 0x094) continue;
    var larg = somma(c, i, 9);
    if (i > 1 && c[i - 1] < larg / 2) continue;
    var j = i + 10, out = '';
    while (j + 9 <= c.length) {
      var k = C39.indexOf(strettoLargo(c, j)), lj = somma(c, j, 9);
      if (k < 0 || lj < larg * 0.7 || lj > larg * 1.4 || c[j - 1] > larg / 4) break;
      if (k === 43) {
        if (out && (j + 9 >= c.length - 1 || c[j + 9] * 2 >= lj)) return out;
        break;
      }
      out += C39A[k]; j += 10;
    }
  }
  return null;
}

/* EAN-13 (e UPC-A, che e' un EAN-13 col primo zero) ed EAN-8. */
var EAN_L = [[3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2], [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2]];
var EAN_G = EAN_L.map(function (p) { return p.slice().reverse(); });
var EAN_PRIMA = [0x00, 0x0B, 0x0D, 0x0E, 0x13, 0x19, 0x1C, 0x15, 0x16, 0x1A];
function cifraEan(c, o, g, mod) {
  var t = somma(c, o, 4);
  if (t < 7 * mod * 0.6 || t > 7 * mod * 1.5) return -1;          // larga come le altre
  var meglio = 0.48, d = -1, v;
  for (var k = 0; k < 10; k++) {
    v = scarto(c, o, EAN_L[k], 0.7); if (v < meglio) { meglio = v; d = k; }
    if (g) { v = scarto(c, o, EAN_G[k], 0.7); if (v < meglio) { meglio = v; d = k + 10; } }
  }
  return d;
}
function eanOk(s) {
  var t = 0;
  for (var i = s.length - 2, k = 0; i >= 0; i--, k++) t += (+s[i]) * (k % 2 ? 1 : 3);
  return (10 - t % 10) % 10 === +s[s.length - 1];
}
function eanDa(c, j, mod, mezze) {
  var cifre = '', lg = 0, d, x;
  for (x = 0; x < mezze; x++) {
    d = cifraEan(c, j + 4 * x, mezze === 6, mod);
    if (d < 0) return null;
    cifre += d % 10; if (d >= 10) lg |= 1 << (5 - x);
  }
  var m = j + 4 * mezze;
  if (scarto(c, m, [1, 1, 1, 1, 1], 0.7) > 0.48) return null;     // la guardia di mezzo
  for (x = 0; x < mezze; x++) {
    d = cifraEan(c, m + 5 + 4 * x, false, mod);
    if (d < 0) return null;
    cifre += d;
  }
  var e = m + 5 + 4 * mezze;
  if (scarto(c, e, [1, 1, 1], 0.7) > 0.48) return null;           // la guardia di fine
  if (e + 3 < c.length - 1 && c[e + 3] < somma(c, e, 3)) return null;   // e il margine bianco dopo
  if (mezze === 6) { var p = EAN_PRIMA.indexOf(lg); if (p < 0) return null; cifre = p + cifre; }
  else if (lg) return null;
  return eanOk(cifre) ? cifre : null;
}
function ean(c) {
  for (var i = 1; i + 3 <= c.length; i += 2) {
    if (scarto(c, i, [1, 1, 1], 0.7) > 0.48) continue;
    var gl = somma(c, i, 3);
    if (i > 1 && c[i - 1] < gl) continue;
    var t = eanDa(c, i + 3, gl / 3, 6);
    if (t) return { formato: 'ean_13', testo: t };
    t = eanDa(c, i + 3, gl / 3, 4);
    if (t) return { formato: 'ean_8', testo: t };
  }
  return null;
}
function barre(c) {
  var t = c128(c);
  if (t !== null) return { formato: 'code_128', testo: t };
  var e = ean(c);
  if (e) return e;
  t = c39(c);
  if (t !== null) return { formato: 'code_39', testo: t };
  return null;
}
// righe dal centro verso fuori, poi colonne (l'etichetta girata); le barre anche al contrario
function leggi1D(g, w, h) {
  var N = 12;
  for (var dir = 0; dir < 2; dir++) {
    var oriz = dir === 0, L = oriz ? h : w;
    for (var k = 0; k < N; k++) {
      var off = ((k + 1) >> 1) * (k & 1 ? 1 : -1), pos = Math.round(L / 2 + off * L / (N + 2));
      if (pos < 1 || pos >= L - 1) continue;
      var p = profilo(g, w, h, pos, oriz);
      for (var met = 0; met < 2; met++) {
        var c = corse(p, met === 1);
        if (!c || c.length < 24) continue;
        var r = barre(c) || barre(c.slice().reverse());
        if (r) return r;
      }
    }
  }
  return null;
}

/* ======================= IL QR PICCOLO E SFOCATO ======================= */
/* La webcam di un PC ha il fuoco fisso: da vicino il QR di un centimetro e'
   sfocato, da lontano e' di due pixel a modulo. Ingrandito due volte e reso piu'
   nitido (il pixel meno la media dei 5x5 intorno) se ne recupera una parte:
   prova del 20/10/2026, 16 scene per caso, a 2,1 px a modulo un po' sfocato da
   0 a 12, a 2,7 sfocato da 8 a 15, a 3 molto sfocato da 0 a 12. Con la sola
   nitidezza, senza ingrandire, quasi niente. */
function raddoppia(g, w, h) {
  var W = w * 2, H = h * 2, o = new Uint8ClampedArray(W * H);
  for (var y = 0; y < H; y++) {
    var sy = Math.min(h - 1.001, Math.max(0, (y + 0.5) / 2 - 0.5)), y0 = sy | 0, fy = sy - y0;
    for (var x = 0; x < W; x++) {
      var sx = Math.min(w - 1.001, Math.max(0, (x + 0.5) / 2 - 0.5)), x0 = sx | 0, fx = sx - x0, i = y0 * w + x0;
      o[y * W + x] = (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + w] * (1 - fx) + g[i + w + 1] * fx) * fy;
    }
  }
  return o;
}
function nitido(g, w, h) {
  var S = new Float64Array((w + 1) * (h + 1)), x, y;            // l'immagine integrale: una media in quattro letture
  for (y = 0; y < h; y++) {
    var riga = 0;
    for (x = 0; x < w; x++) { riga += g[y * w + x]; S[(y + 1) * (w + 1) + x + 1] = S[y * (w + 1) + x + 1] + riga; }
  }
  var o = new Uint8ClampedArray(w * h);
  for (y = 0; y < h; y++) {
    var ya = Math.max(0, y - 2), yb = Math.min(h, y + 3);
    for (x = 0; x < w; x++) {
      var xa = Math.max(0, x - 2), xb = Math.min(w, x + 3);
      var m = (S[yb * (w + 1) + xb] - S[ya * (w + 1) + xb] - S[yb * (w + 1) + xa] + S[ya * (w + 1) + xa]) / ((yb - ya) * (xb - xa));
      o[y * w + x] = 2 * g[y * w + x] - m;
    }
  }
  return o;
}

/* ======================= TUTTO INSIEME ======================= */

/* opz.ingrandisci: se il QR non si legge cosi', si riprova ingrandito e piu'
   nitido (vedi sopra; costa quattro volte, si usa sul riquadro del mirino). */
function leggi(px, w, h, opz) {
  opz = opz || {};
  var g = grigi(px, w, h), out = [];
  if (opz.qr !== false) {
    var t = leggiQR(binarizza(g, w, h), w, h);
    if (t === null && opz.ingrandisci) {
      var g2 = nitido(raddoppia(g, w, h), 2 * w, 2 * h);
      t = leggiQR(binarizza(g2, 2 * w, 2 * h), 2 * w, 2 * h);
    }
    if (t !== null) out.push({ formato: 'qr_code', testo: t });
  }
  if (!out.length && opz.barre !== false) {
    var b = leggi1D(g, w, h);
    if (b) out.push(b);
  }
  return out;
}

/* ======================= LA FINESTRA DELLA FOTOCAMERA ======================= */
/* Solo nel browser. La pagina passa le scritte gia' tradotte (le traduzioni
   stanno nel catalogo) e cosa fare del testo letto:
     LettoreCodici.apri({testi: {titolo, chiudi, ...}, letto(testo, formato), chiuso(), ritorno})
   - la fotocamera dietro, alla risoluzione piu' alta che da' senza fatica
     (1920x1080): il QR di un centimetro ne ha bisogno;
   - ogni 150 ms un fotogramma va letto. Dove il browser ha un lettore suo
     (BarcodeDetector, Chrome ed Edge su Android) un giro a lui e uno a questo;
     a questo, a turno, il quadrato al centro a piena risoluzione, l'immagine
     intera ridotta (un codice a barre lungo dal quadrato esce) e il riquadro
     del mirino, ingrandito e piu' nitido se il QR e' piccolo e sfocato;
   - la webcam di un PC (che guarda chi sta davanti) si vede a specchio, col
     consiglio della distanza: a fuoco fisso, da vicino non legge;
   - EAN, UPC e Code 39 hanno un controllo debole: dalla fotocamera valgono
     solo letti due volte uguali. Un QR o un Code 128 basta una volta;
   - «Usa una foto»: una foto scelta o scattata, letta intera e poi al centro;
   - la luce e l'ingrandimento, dove la fotocamera li ha;
   - Esc, la ×, il clic fuori e il tasto Indietro chiudono; il Tab resta dentro
     e la pagina sotto e' inerte. In secondo piano la fotocamera si spegne e al
     ritorno riparte, ma la finestra resta: «Usa una foto» al telefono passa
     dall'app della fotocamera, e la pagina va dietro proprio mentre la foto
     arriva (chiudere li' la perdeva).
   Le immagini non escono di qui: si leggono e si buttano. */
var DEBOLI = /^(code_39|code_93|codabar|ean_8|ean_13|upc_a|upc_e|itf)$/;
var STILE = [
  '.lett{position:fixed;inset:0;z-index:95;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,2,2,.84)}',
  '.lett-box{display:flex;flex-direction:column;width:100%;max-width:560px;max-height:100%;background:#111214;color:#fff;border:1px solid #2A2C31;border-radius:var(--r-sm);overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.55)}',
  '.lett-testa{display:flex;align-items:center;gap:12px;padding:10px 10px 10px 16px;border-bottom:3px solid var(--yellow)}',
  '.lett-testa h2{flex:1;margin:0;font-family:var(--display);font-weight:600;font-size:17px;letter-spacing:.05em;text-transform:uppercase;color:#fff}',
  '.lett-x{flex-shrink:0;width:40px;height:40px;display:grid;place-items:center;padding:0;background:transparent;border:1px solid rgba(255,255,255,.22);border-radius:var(--r-sm);color:#fff;cursor:pointer}',
  '.lett-x:hover{border-color:var(--yellow)}',
  '.lett-vista{position:relative;flex:1 1 auto;min-height:0;aspect-ratio:4/3;background:#000;overflow:hidden;container-type:size}',
  '.lett-vista video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}',
  '.lett-vista.specchio video{transform:scaleX(-1)}',
  // il mirino: un quadrato al centro (la parte che si legge meglio), il resto un po' scuro
  '.lett-mirino{position:absolute;left:50%;top:50%;width:56%;aspect-ratio:1/1;width:min(62cqw,62cqh);height:min(62cqw,62cqh);transform:translate(-50%,-50%);border:3px solid var(--yellow);border-radius:14px;box-shadow:0 0 0 100vmax rgba(0,0,0,.36);pointer-events:none}',
  '.lett-nota{margin:0;padding:12px 16px 2px;font-size:14.5px;line-height:1.45;color:#E6E7EA}',
  '.lett-nota.err{color:#FFB8AD}',
  '.lett-az{display:flex;flex-wrap:wrap;gap:8px;padding:10px 16px 4px}',
  '.lett-btn{position:relative;display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 14px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,.26);border-radius:var(--r-sm);font:600 13.5px var(--sans);cursor:pointer}',
  '.lett-btn[hidden]{display:none}',
  '.lett-btn:hover{border-color:var(--yellow)}',
  '.lett-btn[aria-pressed="true"]{background:var(--yellow);color:#000;border-color:var(--yellow)}',
  '.lett-btn input{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden}',
  '.lett-x:focus-visible,.lett-btn:focus-visible,.lett-btn:focus-within{outline:2px solid var(--yellow);outline-offset:2px}',
  '.lett-priv{margin:0;padding:6px 16px 14px;font-size:12px;line-height:1.4;color:#A3A6AD}',
  '@media(max-width:600px){.lett{padding:0}.lett-box{max-width:none;height:100%;border:0;border-radius:0}.lett-vista{aspect-ratio:auto}}'
].join('\n');
var F = null;                 // la finestra aperta

function sicuro(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
function icona(d) {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
}
function nota(t, err) {
  var n = F && F.box.querySelector('.lett-nota');
  if (n) { n.textContent = t || ''; n.classList.toggle('err', !!err); }
}
function apri(o) {
  if (F) return;
  o = o || {};
  var doc = document, t = o.testi || {};
  if (!doc.getElementById('lett-stile')) { var st = doc.createElement('style'); st.id = 'lett-stile'; st.textContent = STILE; doc.head.appendChild(st); }
  var box = doc.createElement('div');
  box.className = 'lett'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'lettTit');
  box.innerHTML = '<div class="lett-box">' +
    '<div class="lett-testa"><h2 id="lettTit">' + sicuro(t.titolo) + '</h2>' +
    '<button type="button" class="lett-x" aria-label="' + sicuro(t.chiudi) + '" title="' + sicuro(t.chiudi) + '">' + icona('M6 6l12 12M18 6L6 18') + '</button></div>' +
    '<div class="lett-vista"><video muted playsinline autoplay></video><div class="lett-mirino"></div></div>' +
    '<p class="lett-nota" aria-live="polite">' + sicuro(t.apro) + '</p>' +
    '<div class="lett-az">' +
    '<button type="button" class="lett-btn lett-luce" hidden aria-pressed="false">' + icona('M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z') + sicuro(t.luce) + '</button>' +
    '<button type="button" class="lett-btn lett-zoom" hidden aria-pressed="false">' + icona('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M11 8v6M8 11h6') + sicuro(t.zoom) + '</button>' +
    '<label class="lett-btn">' + icona('M4 7h3l2-3h6l2 3h3v13H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z') + sicuro(t.foto) + '<input type="file" accept="image/*"></label>' +
    '</div><p class="lett-priv">' + sicuro(t.privacy) + '</p></div>';
  doc.body.appendChild(box);
  // chiudendo, il fuoco torna a chi ha aperto (o.ritorno): Safari ai pulsanti cliccati non lo da', e activeElement sarebbe il body
  F = { o: o, t: t, box: box, video: box.querySelector('video'), flusso: null, traccia: null, timer: 0, giro: 0, nostro: 0,
    lavora: false, rilevatore: null, visti: {}, sospesa: false, zoom: null, tela: null, prima: o.ritorno || doc.activeElement,
    dietro: [].slice.call(doc.body.children).filter(function (el) { return el !== box && !el.inert; }) };
  F.dietro.forEach(function (el) { el.inert = true; });          // dietro non si arriva, nemmeno col Tab
  var X = box.querySelector('.lett-x'), file = box.querySelector('input[type=file]');
  X.addEventListener('click', function () { chiudi(); });
  box.addEventListener('click', function (e) { if (e.target === box) chiudi(); });
  box.addEventListener('keydown', tasti);
  file.addEventListener('change', function () { var f = file.files && file.files[0]; if (f) foto(f); file.value = ''; });
  box.querySelector('.lett-luce').addEventListener('click', luce);
  box.querySelector('.lett-zoom').addEventListener('click', ingrandisci);
  F.via = function () { chiudi(); };
  window.addEventListener('hashchange', F.via); window.addEventListener('pagehide', F.via);
  doc.addEventListener('visibilitychange', nascosta);
  X.focus({ preventScroll: true });
  rilevatore();
  camera();
}
function chiudi() {
  if (!F) return;
  var f = F; F = null;
  clearTimeout(f.timer);
  if (f.flusso) f.flusso.getTracks().forEach(function (k) { try { k.stop(); } catch (e) { } });
  window.removeEventListener('hashchange', f.via); window.removeEventListener('pagehide', f.via);
  document.removeEventListener('visibilitychange', nascosta);
  f.dietro.forEach(function (el) { el.inert = false; });
  f.box.remove();
  if (f.prima && f.prima.focus && document.body.contains(f.prima)) f.prima.focus({ preventScroll: true });
  if (f.o.chiuso) try { f.o.chiuso(); } catch (e) { }
}
function tasti(e) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudi(); return; }
  if (e.key !== 'Tab' || !F) return;
  var c = [].slice.call(F.box.querySelectorAll('button,input')).filter(function (el) { return !el.disabled && !el.hidden && el.getClientRects().length; });
  if (!c.length) return;
  var i = c.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); c[c.length - 1].focus(); }
  else if (!e.shiftKey && (i < 0 || i === c.length - 1)) { e.preventDefault(); c[0].focus(); }
}
function nascosta() {
  if (!F) return;
  if (document.visibilityState === 'hidden') {
    if (F.flusso) { F.flusso.getTracks().forEach(function (k) { try { k.stop(); } catch (e) { } }); F.flusso = null; F.sospesa = true; }
    clearTimeout(F.timer);
  } else if (F.sospesa) { F.sospesa = false; camera(); }
}
// il lettore del browser, dove c'e': tutti i formati che sa
function rilevatore() {
  try {
    if (!('BarcodeDetector' in window)) return;
    var f0 = F;
    window.BarcodeDetector.getSupportedFormats().then(function (f) {
      if (F && F === f0 && f && f.length) F.rilevatore = new window.BarcodeDetector({ formats: f });
    }).catch(function () { });
  } catch (e) { }
}
async function camera() {
  var f = F, t = f.t, md = navigator.mediaDevices, s;
  if (!md || !md.getUserMedia) { nota(t.noCam, true); return; }
  try {
    s = await md.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
  } catch (err) {
    if (F !== f) return;
    var n = err && err.name;
    nota(n === 'NotAllowedError' || n === 'SecurityError' ? t.negato : n === 'NotFoundError' || n === 'OverconstrainedError' ? t.manca
      : n === 'NotReadableError' ? t.occupata : t.nonSiApre, true);
    return;
  }
  if (F !== f || f.sospesa) { s.getTracks().forEach(function (k) { k.stop(); }); return; }   // chiusa o dietro mentre chiedeva
  f.flusso = s; f.traccia = s.getVideoTracks()[0] || null;
  var v = f.video; v.muted = true; v.srcObject = s;
  try { await v.play(); } catch (e) { }
  if (F !== f) return;
  /* La webcam di un PC guarda chi sta davanti: l'immagine va a specchio (come in
     uno specchio: l'etichetta spostata a sinistra va a sinistra; senza, si
     centrava a fatica) e il consiglio e' un altro, perche' a fuoco fisso da
     vicino non legge. Il lettore lavora sull'immagine vera, non su quella a
     specchio. Una webcam USB spesso non dice da che parte guarda: su un
     computer (non al tocco) vale come davanti. */
  var st = {}, tocco = false;
  try { st = f.traccia && f.traccia.getSettings ? f.traccia.getSettings() : {}; } catch (e) { }
  try { tocco = !!(window.matchMedia && window.matchMedia('(pointer:coarse)').matches); } catch (e) { }
  var davanti = st.facingMode === 'user' || (!st.facingMode && !tocco);
  f.box.querySelector('.lett-vista').classList.toggle('specchio', davanti);
  nota(davanti && t.webcam ? t.webcam : t.inquadra);
  try {
    var c = f.traccia && f.traccia.getCapabilities ? f.traccia.getCapabilities() : {};
    if (c && c.torch) f.box.querySelector('.lett-luce').hidden = false;
    if (c && c.zoom && c.zoom.max >= 2) { f.zoom = { min: c.zoom.min || 1, max: c.zoom.max }; f.box.querySelector('.lett-zoom').hidden = false; }
  } catch (e) { }
  clearTimeout(f.timer);
  f.timer = setTimeout(giro, 250);
}
function cambia(b, vincolo) {
  var si = b.getAttribute('aria-pressed') !== 'true', f = F;
  f.traccia.applyConstraints({ advanced: [vincolo(si)] }).then(function () { b.setAttribute('aria-pressed', String(si)); }, function () { b.hidden = true; });
}
function luce(e) { if (F && F.traccia) cambia(e.currentTarget, function (si) { return { torch: si }; }); }
function ingrandisci(e) { if (F && F.traccia && F.zoom) cambia(e.currentTarget, function (si) { return { zoom: si ? Math.min(2, F.zoom.max) : F.zoom.min }; }); }
/* L'immagine per questo lettore, in tre modi: 'centro' il quadrato al centro (il
   mirino e un po' di margine, 0,9 del lato corto), 'mirino' il solo riquadro del
   mirino (0,5), tutti e due a piena risoluzione fino a max px; 'intero' tutta
   l'immagine ridotta a max px. */
function fotogramma(src, w, h, modo, max) {
  var sx = 0, sy = 0, sw = w, sh = h, ow, oh;
  if (modo === 'intero') { var k = Math.min(1, max / Math.max(w, h)); ow = Math.round(w * k); oh = Math.round(h * k); }
  else {
    var l = Math.round(Math.min(w, h) * (modo === 'mirino' ? 0.5 : 0.9));
    sx = Math.round((w - l) / 2); sy = Math.round((h - l) / 2); sw = sh = l; ow = oh = Math.min(l, max);
  }
  var c = F.tela || (F.tela = document.createElement('canvas'));
  if (c.width !== ow) c.width = ow;
  if (c.height !== oh) c.height = oh;
  var x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, sx, sy, sw, sh, 0, 0, ow, oh);
  return x.getImageData(0, 0, ow, oh);
}
function giro() {
  if (!F) return;
  var f = F, v = f.video;
  f.timer = setTimeout(giro, 150);
  if (f.lavora || !v || v.readyState < 2 || !v.videoWidth) return;
  f.giro++;
  if (f.rilevatore && f.giro % 2) {
    f.lavora = true;
    f.rilevatore.detect(v).then(function (r) { f.lavora = false; if (r && r.length) trovato(r[0].rawValue, r[0].format); },
      function () { f.lavora = false; f.rilevatore = null; });   // un lettore che sbaglia si lascia stare
    return;
  }
  /* a giri: il centro a piena risoluzione; tutta l'immagine (un codice a barre
     lungo dal quadrato esce); il riquadro del mirino, e se il QR li' e' piccolo
     e sfocato (la webcam del PC) ingrandito e piu' nitido */
  try {
    var modo = ['centro', 'intero', 'mirino'][(f.nostro++) % 3];
    var im = fotogramma(v, v.videoWidth, v.videoHeight, modo, modo === 'intero' ? 1280 : modo === 'mirino' ? 700 : 1000);
    var r = leggi(im.data, im.width, im.height, modo === 'mirino' ? { ingrandisci: true, barre: false } : null);
    if (r.length) trovato(r[0].testo, r[0].formato);
  } catch (e) { }
}
function trovato(testo, formato, daFoto) {
  if (!F || testo == null || testo === '') return;
  testo = String(testo);
  if (!daFoto && DEBOLI.test(formato || '')) {                // controllo debole: vale letto due volte uguale
    var ora = Date.now(), k = formato + '|' + testo, p = F.visti[k];
    F.visti[k] = ora;
    if (!p || ora - p > 2500) return;
  }
  try { if (navigator.vibrate) navigator.vibrate(40); } catch (e) { }
  var o = F.o;
  chiudi();
  if (o.letto) o.letto(testo, formato);
}
function immagine(file) {
  return new Promise(function (ok, ko) {
    var u = URL.createObjectURL(file), im = new Image();
    im.onload = function () { URL.revokeObjectURL(u); ok(im); };
    im.onerror = function () { URL.revokeObjectURL(u); ko(new Error('foto')); };
    im.src = u;
  });
}
async function foto(file) {
  var f = F;
  if (!f) return;
  nota(f.t.leggoFoto);
  var img = null;
  try { img = window.createImageBitmap ? await createImageBitmap(file) : await immagine(file); }
  catch (e) { try { img = await immagine(file); } catch (e2) { } }
  if (img && F === f) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    try { if (f.rilevatore) { var r0 = await f.rilevatore.detect(img); if (r0 && r0.length && F === f) { trovato(r0[0].rawValue, r0[0].format, true); return; } } } catch (e) { }
    var prove = ['intero', 'centro', 'mirino'];
    try {
      for (var i = 0; i < prove.length && F === f; i++) {
        var im = fotogramma(img, w, h, prove[i], prove[i] === 'mirino' ? 800 : 1600);
        var r = leggi(im.data, im.width, im.height, prove[i] === 'mirino' ? { ingrandisci: true, barre: false } : null);
        if (r.length) { trovato(r[0].testo, r[0].formato, true); return; }
      }
    } catch (e) { }
  }
  if (F === f) nota(f.t.nienteFoto, true);
}

var api = { leggi: leggi, apri: apri, chiudi: chiudi, versione: 1 };
// per le prove: i pezzi, uno per uno
api._interni = { grigi: grigi, binarizza: binarizza, mirini: mirini, terne: terne, ordina: ordina,
  quadQuad: quadQuad, trasforma: trasforma, allineamenti: allineamenti, codewordTotali: codewordTotali,
  funzione: funzione, formato: formato, versione: versione, mascherato: mascherato, blocchi: blocchi,
  correggi: correggi, ESP: ESP, LOG: LOG, mul: mul, testoQR: testoQR, decodificaMatrice: decodificaMatrice,
  EC_BLOCCO: EC_BLOCCO, BLOCCHI: BLOCCHI, FORMATI: FORMATI, VERSIONI: VERSIONI, utf8: utf8,
  corse: corse, profilo: profilo, barre: barre, c128: c128, c39: c39, ean: ean, C128: C128, C39: C39, C39A: C39A,
  raddoppia: raddoppia, nitido: nitido,
  EAN_L: EAN_L, EAN_PRIMA: EAN_PRIMA, leggiQR: leggiQR, leggi1D: leggi1D };
radice.LettoreCodici = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
