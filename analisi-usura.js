/* IL CONFRONTO DELL'USURA CON UNA FOTO (20/10/2026)
   ---------------------------------------------------------------------------
   Chiesto dall'utente: «nella sezione delle usure del tagliente, sarebbe bello
   poter verificare l'usura inserendo o scattando una foto». Il modello e' lo
   strumento di un grande produttore, che l'usura non la riconosce da solo: si
   scatta la foto, la si confronta scorrendo le immagini dei tipi di usura, si
   misura, si salva o si condivide. Qui lo stesso, coi contenuti BFT della
   pagina «Le usure del tagliente» (le sei usure del manuale di fresatura, pp.
   32-36): le immagini, da che cosa viene, che cosa fare. Niente IA e niente
   rete: la foto si apre nel telefono e li' resta, finche' non la si condivide.

   Perche' un file a parte: come il lettore delle etichette, lo scarica solo chi
   lo apre (il primo avvio del catalogo e' a un passo dal megabyte compresso).
   Nella pagina (app-template.html, IL CONFRONTO DELL'USURA) restano il
   pulsante, le scritte tradotte e i dati delle usure (USURE_TAGLIENTE).

   Si usa cosi':
     AnalisiUsura.apri({usure: [{id, tit, img, perche: [...], rimedi: [...]}],
       testi: {...}, lingua: 'it', limite: 0.3, limiteDi: 'usura-fianco',
       ritorno, chiuso})
   La misura: due punti a distanza nota (due tacche di un righello, gli spigoli
   di un lato dell'inserto) danno la scala; altri due, l'inizio e la fine
   dell'usura, i millimetri. Il limite di 0,3 mm vale per l'usura sul fianco,
   come dice la pagina.
   Le prove: _test/prova-usura.js (i conti) e _test/edge-usura.mjs (Edge). */
(function (radice) {
'use strict';

/* ======================= I CONTI ======================= */
function dist(p, q) { var x = p.x - q.x, y = p.y - q.y; return Math.sqrt(x * x + y * y); }
// i millimetri dell'usura: punti[0..1] a distanza nota (mm), punti[2..3] l'usura
function misura(punti, mm) {
  if (!punti || punti.length < 4 || !(mm > 0)) return null;
  var s = dist(punti[0], punti[1]);
  return s > 0 ? dist(punti[2], punti[3]) * mm / s : null;
}
function numero(v, lingua) {
  try { return new Intl.NumberFormat(lingua || 'it', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v); }
  catch (e) { return v.toFixed(2); }
}
// «0,7» e «0.7» sono la stessa cosa: chi scrive a mano usa la virgola
function leggiMm(s) { var v = parseFloat(String(s == null ? '' : s).replace(',', '.')); return v > 0 && v < 1000 ? v : null; }
function testo(t, k, a) { var s = (t && t[k]) || ''; return a === undefined ? s : s.split('%1').join(a); }

/* Le scritte della finestra, nelle tre lingue: stanno qui e non nel dizionario
   della pagina perche' le scarica solo chi apre il confronto (il primo avvio e'
   a un passo dal megabyte). La pagina dice la lingua; i nomi delle usure, le
   cause e i rimedi li passa gia' tradotti (sono quelli della pagina). La prova
   (_test/prova-usura.js) guarda che ogni lingua abbia tutte le voci. */
var TESTI = {
  it: { titolo: 'Confronta l’usura', chiudi: 'Chiudi', scatta: 'Scatta o scegli una foto',
    consiglio: 'Fotografa da vicino l’angolo del tagliente, con buona luce: meglio con una lente macro. Poi confronta la foto con le sei usure.',
    fotoAlt: 'La tua foto dell’inserto', ingrandisci: 'Ingrandisci la foto', rimpicciolisci: 'Rimpicciolisci la foto', adatta: 'Foto intera',
    scegli: 'Scorri le usure e scegli quella che somiglia alla tua foto.',
    precedente: 'Usura precedente', successiva: 'Usura successiva', questa: 'È questa',
    perche: 'Da che cosa viene', rimedi: 'Che cosa fare',
    misura: 'Misura l’usura', condividi: 'Condividi', salva: 'Salva l’immagine', altra: 'Scegli un’altra usura',
    scelta: 'Ecco da che cosa viene e che cosa fare. Puoi anche misurarla sulla foto e salvare il risultato.',
    sceltaSenzaFoto: 'Ecco da che cosa viene e che cosa fare. Con una foto la puoi anche misurare.',
    nonApre: 'Questa foto non si apre: prova con un’altra.',
    misura1: 'Tocca due punti di cui conosci la distanza: due tacche di un righello, o i due spigoli di un lato dell’inserto.',
    distanza: 'Quanti millimetri ci sono fra i due punti?', avanti: 'Avanti con la misura',
    distanzaNo: 'Scrivi la distanza in millimetri, per esempio 1 o 0,5.',
    misura2: 'Ora tocca dove comincia e dove finisce l’usura.',
    misurata: 'Usura misurata', misurataFrase: 'Usura misurata: %1 mm',
    oltre: 'Oltre il limite di %1 mm: il tagliente va cambiato.', entro: 'Entro il limite di %1 mm.',
    rifai: 'Rifai la misura', misuraNo: 'I due punti della scala sono nello stesso posto: rifai la misura.',
    salvata: 'Immagine salvata: %1',
    privacy: 'La foto resta su questo dispositivo: il catalogo non la manda a nessuno.' },
  en: { titolo: 'Compare the wear', chiudi: 'Close', scatta: 'Take or choose a photo',
    consiglio: 'Photograph the corner of the cutting edge up close, in good light: a macro lens is even better. Then compare the photo with the six wear types.',
    fotoAlt: 'Your photo of the insert', ingrandisci: 'Zoom in on the photo', rimpicciolisci: 'Zoom out of the photo', adatta: 'Whole photo',
    scegli: 'Scroll through the wear types and choose the one that looks like your photo.',
    precedente: 'Previous wear type', successiva: 'Next wear type', questa: 'This is it',
    perche: 'Where it comes from', rimedi: 'What to do',
    misura: 'Measure the wear', condividi: 'Share', salva: 'Save the image', altra: 'Choose another wear type',
    scelta: 'Here is where it comes from and what to do. You can also measure it on the photo and save the result.',
    sceltaSenzaFoto: 'Here is where it comes from and what to do. With a photo you can also measure it.',
    nonApre: 'This photo cannot be opened: try another one.',
    misura1: 'Tap two points whose distance you know: two marks on a ruler, or the two corners of one side of the insert.',
    distanza: 'How many millimetres are there between the two points?', avanti: 'Continue measuring',
    distanzaNo: 'Write the distance in millimetres, for example 1 or 0.5.',
    misura2: 'Now tap where the wear starts and where it ends.',
    misurata: 'Measured wear', misurataFrase: 'Measured wear: %1 mm',
    oltre: 'Beyond the %1 mm limit: the cutting edge must be changed.', entro: 'Within the %1 mm limit.',
    rifai: 'Measure again', misuraNo: 'The two scale points are in the same place: measure again.',
    salvata: 'Image saved: %1',
    privacy: 'The photo stays on this device: the catalogue sends it to no one.' },
  de: { titolo: 'Verschleiß vergleichen', chiudi: 'Schließen', scatta: 'Foto aufnehmen oder auswählen',
    consiglio: 'Fotografieren Sie die Ecke der Schneide aus der Nähe und bei gutem Licht, am besten mit einem Makroobjektiv. Vergleichen Sie das Foto dann mit den sechs Verschleißarten.',
    fotoAlt: 'Ihr Foto der Wendeschneidplatte', ingrandisci: 'Foto vergrößern', rimpicciolisci: 'Foto verkleinern', adatta: 'Ganzes Foto',
    scegli: 'Blättern Sie durch die Verschleißarten und wählen Sie die, die Ihrem Foto ähnelt.',
    precedente: 'Vorherige Verschleißart', successiva: 'Nächste Verschleißart', questa: 'Das ist es',
    perche: 'Woher er kommt', rimedi: 'Was zu tun ist',
    misura: 'Verschleiß messen', condividi: 'Teilen', salva: 'Bild speichern', altra: 'Andere Verschleißart wählen',
    scelta: 'Hier sehen Sie, woher er kommt und was zu tun ist. Sie können ihn auch auf dem Foto messen und das Ergebnis speichern.',
    sceltaSenzaFoto: 'Hier sehen Sie, woher er kommt und was zu tun ist. Mit einem Foto können Sie ihn auch messen.',
    nonApre: 'Dieses Foto lässt sich nicht öffnen: versuchen Sie ein anderes.',
    misura1: 'Tippen Sie auf zwei Punkte mit bekanntem Abstand: zwei Striche eines Lineals oder die zwei Ecken einer Seite der Wendeschneidplatte.',
    distanza: 'Wie viele Millimeter liegen zwischen den beiden Punkten?', avanti: 'Weiter messen',
    distanzaNo: 'Geben Sie den Abstand in Millimetern ein, zum Beispiel 1 oder 0,5.',
    misura2: 'Tippen Sie jetzt dort, wo der Verschleiß beginnt und wo er endet.',
    misurata: 'Gemessener Verschleiß', misurataFrase: 'Gemessener Verschleiß: %1 mm',
    oltre: 'Über der Grenze von %1 mm: die Schneide muss gewechselt werden.', entro: 'Innerhalb der Grenze von %1 mm.',
    rifai: 'Neu messen', misuraNo: 'Die beiden Maßstabspunkte liegen an derselben Stelle: messen Sie neu.',
    salvata: 'Bild gespeichert: %1',
    privacy: 'Das Foto bleibt auf diesem Gerät: der Katalog sendet es an niemanden.' }
};
function scritte(o) { var t = {}, k, l = TESTI[o.lingua] || {}; for (k in TESTI.it) t[k] = l[k] || TESTI.it[k]; for (k in (o.testi || {})) t[k] = o.testi[k]; return t; }

/* ======================= LA FINESTRA ======================= */
var STILE = [
  '.usa{position:fixed;inset:0;z-index:95;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(2,2,2,.84)}',
  '.usa-box{display:flex;flex-direction:column;width:100%;max-width:1060px;max-height:100%;background:#111214;color:#fff;border:1px solid #2A2C31;border-radius:var(--r-sm);overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.55)}',
  '.usa-testa{display:flex;align-items:center;gap:12px;padding:10px 10px 10px 16px;border-bottom:3px solid var(--yellow)}',
  '.usa-testa h2{flex:1;margin:0;font-family:var(--display);font-weight:600;font-size:17px;letter-spacing:.05em;text-transform:uppercase;color:#fff}',
  '.usa-x,.usa-freccia{flex-shrink:0;width:40px;height:40px;display:grid;place-items:center;padding:0;background:transparent;border:1px solid rgba(255,255,255,.22);border-radius:var(--r-sm);color:#fff;cursor:pointer}',
  '.usa-x:hover,.usa-freccia:hover{border-color:var(--yellow)}',
  '.usa-corpo{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);overflow:auto}',
  '.usa-foto{display:flex;flex-direction:column;min-height:0;border-right:1px solid #2A2C31}',
  '.usa-vista{position:relative;flex:1 1 auto;min-height:340px;background:#000;overflow:hidden;touch-action:none;cursor:grab}',
  '.usa-vista.misura{cursor:crosshair}',
  '.usa-tela{position:absolute;left:0;top:0;transform-origin:0 0}',
  '.usa-tela[hidden]{display:none}',
  '.usa-tela img,.usa-tela svg{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;-webkit-user-drag:none;pointer-events:none}',
  '.usa-vuota{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;color:#D7D9DE;font-size:14.5px;line-height:1.5}',
  '.usa-vuota[hidden]{display:none}',
  '.usa-barra{display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px;border-top:1px solid #2A2C31}',
  '.usa-btn{position:relative;display:inline-flex;align-items:center;gap:7px;min-height:40px;padding:0 14px;background:transparent;color:#fff;border:1px solid rgba(255,255,255,.26);border-radius:var(--r-sm);font:600 13.5px var(--sans);cursor:pointer}',
  '.usa-btn[hidden]{display:none}',
  '.usa-btn:hover{border-color:var(--yellow)}',
  '.usa-btn:disabled{opacity:.45;cursor:default}',
  '.usa-btn.primo{background:var(--yellow);color:#000;border-color:var(--yellow)}',
  '.usa-btn input{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden}',
  '.usa-rif{display:flex;flex-direction:column;gap:12px;padding:14px 16px;min-height:0;overflow:auto}',
  '.usa-passo{margin:0;font-size:14.5px;line-height:1.45;color:#E6E7EA}',
  '.usa-passo.err{color:#FFB8AD}',
  '.usa-rif-vista{display:flex;align-items:center;gap:8px}',
  '.usa-rif-vista figure{flex:1;margin:0;text-align:center}',
  '.usa-rif-vista img{width:100%;max-width:280px;aspect-ratio:1/1;object-fit:contain;background:#fff;border-radius:10px}',
  '.usa-rif-vista figcaption{margin-top:8px;font-family:var(--display);font-weight:600;font-size:16px;letter-spacing:.04em;text-transform:uppercase}',
  '.usa-strip{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}',
  '.usa-mini{padding:0;border:2px solid transparent;border-radius:8px;background:#fff;cursor:pointer;aspect-ratio:1/1;overflow:hidden}',
  '.usa-mini img{width:100%;height:100%;object-fit:contain;display:block}',
  '.usa-mini[aria-current="true"]{border-color:var(--yellow)}',
  '.usa-mini.scelta{box-shadow:0 0 0 3px #22C55E}',
  '.usa-esito{border-top:1px solid #2A2C31;padding-top:12px}',
  '.usa-esito[hidden],.usa-misura[hidden]{display:none}',
  '.usa-esito h3{margin:0 0 4px;font-family:var(--display);font-size:18px;text-transform:uppercase;letter-spacing:.04em;color:var(--yellow)}',
  '.usa-esito h4{margin:10px 0 4px;font-size:12.5px;letter-spacing:.06em;text-transform:uppercase;color:#A3A6AD}',
  '.usa-esito ul{margin:0;padding-left:18px;font-size:14px;line-height:1.5}',
  '.usa-esito .usa-barra{padding:12px 0 0;border:0}',
  '.usa-misura{margin-top:12px;padding:10px 12px;border:1px solid #3A3D44;border-radius:10px;font-size:14px;line-height:1.45}',
  '.usa-misura label{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}',
  '.usa-misura input{width:110px;height:38px;padding:0 10px;border:1px solid #8E9097;border-radius:var(--r-sm);background:#1B1C20;color:#fff;font:15px var(--sans)}',
  '.usa-mm{display:block;margin-top:6px;font-family:var(--display);font-size:24px;font-weight:700}',
  '.usa-mm.oltre{color:#FF9B8C}',
  '.usa-mm.entro{color:#86E0A5}',
  '.usa-priv{margin:0;padding:8px 16px 12px;font-size:12px;line-height:1.4;color:#A3A6AD;border-top:1px solid #2A2C31}',
  '.usa-x:focus-visible,.usa-freccia:focus-visible,.usa-btn:focus-visible,.usa-btn:focus-within,.usa-mini:focus-visible,.usa-misura input:focus-visible{outline:2px solid var(--yellow);outline-offset:2px}',
  '@media(max-width:760px){.usa{padding:0}.usa-box{max-width:none;height:100%;border:0;border-radius:0}' +
    '.usa-corpo{grid-template-columns:1fr;grid-template-rows:minmax(240px,44vh) auto}.usa-foto{border-right:0;border-bottom:1px solid #2A2C31}' +
    '.usa-vista{min-height:0}.usa-rif-vista img{max-width:170px}}'
].join('\n');
var A = null;                 // la finestra aperta

function sicuro(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
function icona(d) {
  return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
}
var IC_FOTO = 'M4 7h3l2-3h6l2 3h3v13H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z';
function q(s) { return A.box.querySelector(s); }
function passo(t, err) { var n = A && q('.usa-passo'); if (n) { n.textContent = t || ''; n.classList.toggle('err', !!err); } }

function apri(o) {
  if (A) return;
  o = o || {};
  var doc = document, t = scritte(o), usure = o.usure || [];
  if (!usure.length) return;
  if (!doc.getElementById('usa-stile')) { var st = doc.createElement('style'); st.id = 'usa-stile'; st.textContent = STILE; doc.head.appendChild(st); }
  var box = doc.createElement('div');
  box.className = 'usa'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'usaTit');
  var mini = usure.map(function (u, i) {
    return '<button type="button" class="usa-mini" data-i="' + i + '" aria-label="' + sicuro(u.tit) + '" title="' + sicuro(u.tit) + '"><img src="' + sicuro(u.img) + '" alt=""></button>';
  }).join('');
  var scegli = function (cls) { return '<label class="usa-btn' + (cls || '') + '">' + icona(IC_FOTO) + sicuro(t.scatta) + '<input type="file" accept="image/*"></label>'; };
  box.innerHTML = '<div class="usa-box">' +
    '<div class="usa-testa"><h2 id="usaTit">' + sicuro(t.titolo) + '</h2>' +
    '<button type="button" class="usa-x" aria-label="' + sicuro(t.chiudi) + '" title="' + sicuro(t.chiudi) + '">' + icona('M6 6l12 12M18 6L6 18') + '</button></div>' +
    '<div class="usa-corpo">' +
    '<section class="usa-foto"><div class="usa-vista"><div class="usa-tela" hidden><img class="usa-img" alt="' + sicuro(t.fotoAlt) + '">' +
    '<svg class="usa-segni" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" aria-hidden="true"></svg></div>' +
    '<div class="usa-vuota">' + icona(IC_FOTO).replace('width="18" height="18"', 'width="44" height="44"') + '<p>' + sicuro(t.consiglio) + '</p>' + scegli(' primo') + '</div></div>' +
    '<div class="usa-barra">' +
    '<button type="button" class="usa-btn usa-meno" hidden aria-label="' + sicuro(t.rimpicciolisci) + '" title="' + sicuro(t.rimpicciolisci) + '">' + icona('M5 12h14') + '</button>' +
    '<button type="button" class="usa-btn usa-piu" hidden aria-label="' + sicuro(t.ingrandisci) + '" title="' + sicuro(t.ingrandisci) + '">' + icona('M12 5v14M5 12h14') + '</button>' +
    '<button type="button" class="usa-btn usa-adatta" hidden>' + sicuro(t.adatta) + '</button>' +
    '<span class="usa-cambia" hidden>' + scegli('') + '</span></div></section>' +
    '<section class="usa-rif"><p class="usa-passo" aria-live="polite">' + sicuro(t.scegli) + '</p>' +
    '<div class="usa-rif-vista"><button type="button" class="usa-freccia usa-prec" aria-label="' + sicuro(t.precedente) + '" title="' + sicuro(t.precedente) + '">' + icona('M15 18l-6-6 6-6') + '</button>' +
    '<figure><img class="usa-rif-img" alt=""><figcaption class="usa-rif-tit"></figcaption></figure>' +
    '<button type="button" class="usa-freccia usa-succ" aria-label="' + sicuro(t.successiva) + '" title="' + sicuro(t.successiva) + '">' + icona('M9 18l6-6-6-6') + '</button></div>' +
    '<div class="usa-strip">' + mini + '</div>' +
    '<div class="usa-barra" style="padding:0;border:0"><button type="button" class="usa-btn primo usa-questa">' + icona('M5 12l5 5L20 7') + sicuro(t.questa) + '</button></div>' +
    '<div class="usa-esito" hidden></div></section></div>' +
    '<p class="usa-priv">' + sicuro(t.privacy) + '</p></div>';
  doc.body.appendChild(box);
  A = { o: o, t: t, usure: usure, box: box, i: 0, scelta: -1, foto: null, nw: 0, nh: 0, s: 1, tx: 0, ty: 0, b: 1,
    punt: {}, pinch: 0, mosso: false, mis: null, prima: o.ritorno || doc.activeElement,
    dietro: [].slice.call(doc.body.children).filter(function (el) { return el !== box && !el.inert; }) };
  A.dietro.forEach(function (el) { el.inert = true; });          // dietro non si arriva, nemmeno col Tab
  q('.usa-x').addEventListener('click', function () { chiudi(); });
  box.addEventListener('click', function (e) {
    if (e.target === box) { chiudi(); return; }
    var m = e.target.closest && e.target.closest('.usa-mini');
    if (m) { mostra(+m.getAttribute('data-i')); return; }
    if (e.target.closest('.usa-prec')) mostra(A.i - 1);
    else if (e.target.closest('.usa-succ')) mostra(A.i + 1);
    else if (e.target.closest('.usa-questa')) scegliQuesta();
    else if (e.target.closest('.usa-piu')) zoomCentro(1.5);
    else if (e.target.closest('.usa-meno')) zoomCentro(1 / 1.5);
    else if (e.target.closest('.usa-adatta')) adatta();
    else if (e.target.closest('.usa-misura-via')) misuraInizia();
    else if (e.target.closest('.usa-avanti')) misuraAvanti();
    else if (e.target.closest('.usa-condividi')) salvaCondividi(true);
    else if (e.target.closest('.usa-salva')) salvaCondividi(false);
    else if (e.target.closest('.usa-altra')) { q('.usa-esito').hidden = true; passo(t.scegli); q('.usa-questa').focus(); }
  });
  box.addEventListener('change', function (e) {
    var f = e.target && e.target.files && e.target.files[0];
    if (f) caricaFoto(f);
    if (e.target && e.target.type === 'file') e.target.value = '';
  });
  doc.addEventListener('keydown', tasti, true);       // anche col fuoco sul fondo (vedi misuraPannello)
  var v = q('.usa-vista');
  v.addEventListener('pointerdown', giu); v.addEventListener('pointermove', muovi);
  v.addEventListener('pointerup', su); v.addEventListener('pointercancel', su);
  v.addEventListener('wheel', rotella, { passive: false });
  A.via = function () { chiudi(); };
  A.ridimensiona = function () { if (A && A.foto) adatta(); };
  window.addEventListener('hashchange', A.via); window.addEventListener('pagehide', A.via);
  window.addEventListener('resize', A.ridimensiona);
  mostra(0);
  q('.usa-x').focus({ preventScroll: true });
}
function chiudi() {
  if (!A) return;
  var a = A; A = null;
  window.removeEventListener('hashchange', a.via); window.removeEventListener('pagehide', a.via);
  window.removeEventListener('resize', a.ridimensiona);
  document.removeEventListener('keydown', tasti, true);
  if (a.foto) URL.revokeObjectURL(a.foto);
  a.dietro.forEach(function (el) { el.inert = false; });
  a.box.remove();
  if (a.prima && a.prima.focus && document.body.contains(a.prima)) a.prima.focus({ preventScroll: true });
  if (a.o.chiuso) try { a.o.chiuso(); } catch (e) { }
}
function tasti(e) {
  if (!A) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudi(); return; }
  var dentroCampo = e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'file';
  if (!dentroCampo && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); mostra(A.i + (e.key === 'ArrowLeft' ? -1 : 1)); return; }
  if (dentroCampo && e.key === 'Enter') { e.preventDefault(); misuraAvanti(); return; }
  if (e.key !== 'Tab') return;
  var c = [].slice.call(A.box.querySelectorAll('button,input')).filter(function (el) { return !el.disabled && !el.hidden && el.getClientRects().length; });
  if (!c.length) return;
  var i = c.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); c[c.length - 1].focus(); }
  else if (!e.shiftKey && (i < 0 || i === c.length - 1)) { e.preventDefault(); c[0].focus(); }
}

/* ======================= LE USURE DI RIFERIMENTO ======================= */
function mostra(i) {
  var n = A.usure.length; i = ((i % n) + n) % n; A.i = i;
  var u = A.usure[i];
  q('.usa-rif-img').src = u.img; q('.usa-rif-img').alt = u.tit;
  q('.usa-rif-tit').textContent = u.tit;
  [].forEach.call(A.box.querySelectorAll('.usa-mini'), function (b, k) { b.setAttribute('aria-current', k === i ? 'true' : 'false'); });
}
function scegliQuesta() {
  var u = A.usure[A.i], t = A.t;
  A.scelta = A.i; A.mis = null;
  [].forEach.call(A.box.querySelectorAll('.usa-mini'), function (b, k) { b.classList.toggle('scelta', k === A.i); });
  var lista = function (xs) { return '<ul>' + (xs || []).map(function (x) { return '<li>' + sicuro(x) + '</li>'; }).join('') + '</ul>'; };
  var e = q('.usa-esito');
  e.innerHTML = '<h3>' + sicuro(u.tit) + '</h3><h4>' + sicuro(t.perche) + '</h4>' + lista(u.perche) + '<h4>' + sicuro(t.rimedi) + '</h4>' + lista(u.rimedi) +
    '<div class="usa-barra"><button type="button" class="usa-btn usa-misura-via"' + (A.foto ? '' : ' disabled') + '>' + icona('M3 17l14-14 4 4-14 14H3zM7 13l2 2M10 10l2 2M13 7l2 2') + sicuro(t.misura) + '</button>' +
    '<button type="button" class="usa-btn usa-condividi"' + (A.foto ? '' : ' disabled') + (condivideFile() ? '' : ' hidden') + '>' + icona('M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 3v12M7 8l5-5 5 5') + sicuro(t.condividi) + '</button>' +
    '<button type="button" class="usa-btn usa-salva"' + (A.foto ? '' : ' disabled') + '>' + icona('M12 4v11M7 10l5 5 5-5M5 20h14') + sicuro(t.salva) + '</button>' +
    '<button type="button" class="usa-btn usa-altra">' + sicuro(t.altra) + '</button></div>' +
    '<div class="usa-misura" hidden></div>';
  e.hidden = false;
  passo(A.foto ? t.scelta : t.sceltaSenzaFoto);
  segni();
  e.querySelector('h3').setAttribute('tabindex', '-1'); e.querySelector('h3').focus({ preventScroll: false });
}

/* ======================= LA FOTO: ZOOM, SPOSTAMENTO ======================= */
function caricaFoto(file) {
  var url = URL.createObjectURL(file), img = new Image();
  img.onload = function () {
    if (!A) { URL.revokeObjectURL(url); return; }
    if (A.foto) URL.revokeObjectURL(A.foto);
    A.foto = url; A.nw = img.naturalWidth; A.nh = img.naturalHeight; A.mis = null;
    q('.usa-img').src = url;
    q('.usa-segni').setAttribute('viewBox', '0 0 ' + A.nw + ' ' + A.nh);
    q('.usa-tela').hidden = false; q('.usa-vuota').hidden = true;
    ['.usa-meno', '.usa-piu', '.usa-adatta', '.usa-cambia'].forEach(function (s) { q(s).hidden = false; });
    [].forEach.call(A.box.querySelectorAll('.usa-misura-via,.usa-condividi,.usa-salva'), function (b) { b.disabled = false; });
    var m = q('.usa-misura'); if (m) m.hidden = true;
    adatta(); segni();
    passo(A.scelta >= 0 ? A.t.scelta : A.t.scegli);
  };
  img.onerror = function () { URL.revokeObjectURL(url); if (A) passo(A.t.nonApre, true); };
  img.src = url;
}
function vista() { var r = q('.usa-vista').getBoundingClientRect(); return { w: r.width, h: r.height, r: r }; }
function adatta() {
  if (!A.foto) return;
  var v = vista();
  A.b = Math.min(v.w / A.nw, v.h / A.nh) || 1; A.s = 1;
  A.tx = (v.w - A.nw * A.b) / 2; A.ty = (v.h - A.nh * A.b) / 2;
  disegna();
}
function vincola() {
  var v = vista(), W = A.nw * A.b * A.s, H = A.nh * A.b * A.s;
  A.tx = W <= v.w ? (v.w - W) / 2 : Math.min(0, Math.max(v.w - W, A.tx));
  A.ty = H <= v.h ? (v.h - H) / 2 : Math.min(0, Math.max(v.h - H, A.ty));
}
function zoom(f, cx, cy) {
  if (!A.foto) return;
  var s2 = Math.min(12, Math.max(1, A.s * f));
  A.tx = cx - (cx - A.tx) * s2 / A.s; A.ty = cy - (cy - A.ty) * s2 / A.s; A.s = s2;
  vincola(); disegna();
}
function zoomCentro(f) { var v = vista(); zoom(f, v.w / 2, v.h / 2); }
function disegna() {
  var tl = q('.usa-tela');
  tl.style.width = (A.nw * A.b) + 'px'; tl.style.height = (A.nh * A.b) + 'px';
  tl.style.transform = 'translate(' + A.tx + 'px,' + A.ty + 'px) scale(' + A.s + ')';
  segni();
}
function giu(e) {
  if (!A || !A.foto) return;
  try { q('.usa-vista').setPointerCapture(e.pointerId); } catch (x) { }
  A.punt[e.pointerId] = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY };
  var ids = Object.keys(A.punt);
  if (ids.length === 1) A.mosso = false;
  if (ids.length === 2) { var a = A.punt[ids[0]], b = A.punt[ids[1]]; A.pinch = Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)); A.mosso = true; }
}
function muovi(e) {
  if (!A) return;
  var p = A.punt[e.pointerId]; if (!p) return;
  var ids = Object.keys(A.punt), r = vista().r;
  if (ids.length === 2) {                                       // due dita: si ingrandisce intorno al punto di mezzo
    p.x = e.clientX; p.y = e.clientY;
    var a = A.punt[ids[0]], b = A.punt[ids[1]], d = Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
    if (A.pinch > 0) zoom(d / A.pinch, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
    A.pinch = d; return;
  }
  var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (Math.abs(e.clientX - p.x0) + Math.abs(e.clientY - p.y0) > 6) A.mosso = true;
  if (A.mosso) { A.tx += dx; A.ty += dy; vincola(); disegna(); }
}
function su(e) {
  if (!A) return;
  var p = A.punt[e.pointerId]; delete A.punt[e.pointerId]; A.pinch = 0;
  if (p && !A.mosso && e.type === 'pointerup' && A.mis && (A.mis.passo === 1 || A.mis.passo === 3)) tocco(e);
}
function rotella(e) {
  if (!A || !A.foto) return;
  e.preventDefault();
  var r = vista().r; zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top);
}

/* ======================= LA MISURA ======================= */
function misuraInizia() {
  if (!A.foto) return;
  A.mis = { passo: 1, punti: [], mm: null };
  q('.usa-vista').classList.add('misura');
  misuraPannello(); segni();
}
function tocco(e) {
  var r = q('.usa-tela').getBoundingClientRect();
  var x = (e.clientX - r.left) / r.width * A.nw, y = (e.clientY - r.top) / r.height * A.nh;
  if (!(x >= 0 && y >= 0 && x <= A.nw && y <= A.nh)) return;
  A.mis.punti.push({ x: x, y: y });
  if (A.mis.passo === 1 && A.mis.punti.length === 2) A.mis.passo = 2;
  else if (A.mis.passo === 3 && A.mis.punti.length === 4) { A.mis.passo = 4; q('.usa-vista').classList.remove('misura'); }
  misuraPannello(); segni();
}
function misuraAvanti() {
  if (!A || !A.mis || A.mis.passo !== 2) return;
  var c = q('.usa-mm-campo'), v = leggiMm(c && c.value);
  if (!v) { if (c) c.focus(); passo(A.t.distanzaNo, true); return; }
  A.mis.mm = v; A.mis.passo = 3;
  misuraPannello(); segni();
}
function misuraVal() { return A.mis && A.mis.passo === 4 ? misura(A.mis.punti, A.mis.mm) : null; }
function misuraPannello() {
  var t = A.t, m = q('.usa-misura'), p = A.mis;
  if (!m || !p) return;
  m.hidden = false;
  var fuoco = function () { var f = document.activeElement; if (!f || !A.box.contains(f) || f === document.body) { m.setAttribute('tabindex', '-1'); m.focus({ preventScroll: true }); } };
  // il pannello sta in fondo alla colonna delle usure, sotto i pulsanti: al telefono
  // e' fuori dal riquadro che scorre, e chi ha premuto «Misura l'usura» non vedeva
  // che cosa toccare. Lo si porta in vista; la foto sta in un'altra cella e non si muove
  var vedi = function () { try { m.scrollIntoView({ block: 'nearest' }); } catch (e) { } };
  if (p.passo === 1) { m.innerHTML = '<p style="margin:0">' + sicuro(t.misura1) + '</p>'; passo(t.misura1); vedi(); fuoco(); }
  else if (p.passo === 2) {
    m.innerHTML = '<label>' + sicuro(t.distanza) + ' <input class="usa-mm-campo" inputmode="decimal" value="' + (p.mm || '') + '" placeholder="1,0"></label>' +
      '<div class="usa-barra" style="padding:10px 0 0;border:0"><button type="button" class="usa-btn primo usa-avanti">' + sicuro(t.avanti) + '</button></div>';
    passo(t.distanza); vedi();
    var c = m.querySelector('input'); if (c) c.focus();
  } else if (p.passo === 3) { m.innerHTML = '<p style="margin:0">' + sicuro(t.misura2) + '</p>'; passo(t.misura2); vedi(); fuoco(); }
  else {
    var vb = misuraVal(), u = A.usure[A.scelta] || {}, lim = A.o.limite, conLimite = lim > 0 && u.id === A.o.limiteDi;
    if (vb == null) {                               // i due punti della scala nello stesso posto: la scala non c'e'
      m.innerHTML = '<p style="margin:0">' + sicuro(t.misuraNo) + '</p><div class="usa-barra" style="padding:10px 0 0;border:0"><button type="button" class="usa-btn usa-misura-via">' + sicuro(t.rifai) + '</button></div>';
      passo(t.misuraNo, true); vedi(); return;
    }
    var cls = conLimite ? (vb > lim ? ' oltre' : ' entro') : '';
    m.innerHTML = '<span>' + sicuro(t.misurata) + '</span><span class="usa-mm' + cls + '">' + sicuro(numero(vb, A.o.lingua)) + ' mm</span>' +
      (conLimite ? '<p style="margin:6px 0 0">' + sicuro(testo(t, vb > lim ? 'oltre' : 'entro', numero(lim, A.o.lingua))) + '</p>' : '') +
      '<div class="usa-barra" style="padding:10px 0 0;border:0"><button type="button" class="usa-btn usa-misura-via">' + sicuro(t.rifai) + '</button></div>';
    passo(testo(t, 'misurataFrase', numero(vb, A.o.lingua)));
    vedi(); fuoco();
  }
}
// i segni sulla foto: la scala in giallo, l'usura in rosso (in pixel della foto, grandi uguali a ogni zoom)
function segni() {
  var g = A && q('.usa-segni'); if (!g || !A.foto) return;
  var k = 1 / (A.b * A.s), p = A.mis ? A.mis.punti : [], out = '';
  var linea = function (a, b, col) { return '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + col + '" stroke-width="' + (2.5 * k) + '"/>'; };
  if (p.length >= 2) out += linea(p[0], p[1], '#FFC400');
  if (p.length >= 4) out += linea(p[2], p[3], '#FF4D3D');
  p.forEach(function (c, i) {
    out += '<circle cx="' + c.x + '" cy="' + c.y + '" r="' + (7 * k) + '" fill="none" stroke="' + (i < 2 ? '#FFC400' : '#FF4D3D') + '" stroke-width="' + (2.5 * k) + '"/>';
  });
  g.innerHTML = out;
}

/* ======================= SALVA O CONDIVIDI ======================= */
function righeTesto() {
  var t = A.t, u = A.usure[A.scelta], r = [];
  if (u) r.push(u.tit);
  var vb = misuraVal();
  if (vb != null) r.push(testo(t, 'misurataFrase', numero(vb, A.o.lingua)));
  r.push(new Date().toLocaleDateString(A.o.lingua || 'it') + ' · ' + (t.firma || ''));
  return r;
}
function componi() {
  return new Promise(function (ok) {
    var img = q('.usa-img'), k = Math.min(1, 1600 / Math.max(A.nw, A.nh)), w = Math.round(A.nw * k), h = Math.round(A.nh * k);
    var righe = righeTesto(), fs = Math.max(18, Math.round(w / 38)), banda = Math.round(fs * (righe.length * 1.5 + 0.9));
    var c = document.createElement('canvas'); c.width = w; c.height = h + banda;
    var x = c.getContext('2d');
    x.drawImage(img, 0, 0, w, h);
    var p = A.mis && A.mis.passo === 4 ? A.mis.punti : [];
    var tratto = function (a, b, col) { x.strokeStyle = col; x.lineWidth = Math.max(2, w / 400); x.beginPath(); x.moveTo(a.x * k, a.y * k); x.lineTo(b.x * k, b.y * k); x.stroke(); };
    if (p.length === 4) { tratto(p[0], p[1], '#FFC400'); tratto(p[2], p[3], '#FF4D3D'); }
    x.fillStyle = '#111214'; x.fillRect(0, h, w, banda);
    x.fillStyle = '#FFC400'; x.fillRect(0, h, w, Math.max(3, Math.round(fs / 6)));
    x.textBaseline = 'top';
    righe.forEach(function (r, i) {
      x.fillStyle = i === 0 ? '#FFFFFF' : '#C9CCD2';
      x.font = (i === 0 ? '700 ' : '400 ') + fs + 'px Roboto, Arial, sans-serif';
      x.fillText(r, Math.round(fs * 0.7), h + Math.round(fs * 0.6) + i * Math.round(fs * 1.5));
    });
    c.toBlob(function (b) { ok(b); }, 'image/jpeg', 0.9);
  });
}
/* Al computer si salva, al telefono si condivide (WhatsApp, la mail): due
   pulsanti, perche' Edge su Windows sa condividere i file e «Salva o condividi»
   apriva la finestra di condivisione di Windows a chi voleva solo salvare.
   «Condividi» c'e' solo dove il dispositivo condivide file. */
function condivideFile() {
  try { return !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'prova.jpg', { type: 'image/jpeg' })] })); } catch (e) { return false; }
}
function salvaCondividi(manda) {
  if (!A || !A.foto) return;
  var t = A.t, nome = 'usura-' + new Date().toISOString().slice(0, 10) + '.jpg', a0 = A;
  componi().then(function (blob) {
    if (!blob || A !== a0) return;
    var u = A.usure[A.scelta] || {}, file = null;
    if (manda) {
      try { file = new File([blob], nome, { type: 'image/jpeg' }); } catch (e) { }
      var frase = righeTesto().slice(0, -1).join(' — ') + (u.rimedi && u.rimedi.length ? '\n' + t.rimedi + ': ' + u.rimedi.join('; ') : '');
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: t.titolo, text: frase }).catch(function () { });
        return;
      }
    }
    var l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = nome;
    document.body.appendChild(l); l.click();
    setTimeout(function () { URL.revokeObjectURL(l.href); l.remove(); }, 4000);
    passo(testo(t, 'salvata', nome));
  });
}

var api = { apri: apri, chiudi: chiudi, versione: 1, _interni: { misura: misura, numero: numero, leggiMm: leggiMm, testo: testo, TESTI: TESTI, scritte: scritte } };
radice.AnalisiUsura = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
