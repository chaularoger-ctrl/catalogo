/* Service worker del catalogo interattivo BFT.
 * -----------------------------------------------------------------------------
 * Due cache, e la differenza fra le due e' tutta la progettazione:
 *
 *   GUSCIO   l'app vera e propria: un file HTML da 4,7 MB che in rete sono 0,3 MB
 *            compressi, piu' manifest e icone. Si scarica tutto subito, cosi' dal
 *            secondo avvio il catalogo si apre anche senza rete.
 *
 *   IMMAGINI 196 file per 57 MB, di cui 52 di sola tornitura. Scaricarle tutte in
 *            partenza vorrebbe dire far aspettare un minuto a chi cerca una fresa
 *            per vedere foto che non guardera' mai. Si mettono da parte quelle che
 *            si aprono davvero, in una cache SENZA numero di versione, cosi'
 *            sopravvivono agli aggiornamenti dell'app.
 *
 * GUSCIO_VERSIONE decide se il browser butta via il guscio vecchio. NON si alza
 * a mano: la scrive `genera-app.py` a ogni build, con l'impronta di TUTTI i file
 * elencati in GUSCIO (app, manifest, icone), cosi' come stanno sul disco. Cambia
 * da sola quando cambia uno di loro, resta identica quando non cambia niente. Il
 * valore qui sotto e' solo il segnaposto della sorgente. (Fino al 29/09/2026
 * era l'impronta della sola app: un manifest nuovo non arrivava a nessuno.)
 *
 * Perche': dal 7 al 10 settembre 2026 la costante e' rimasta a «v22» mentre il
 * catalogo cambiava ogni giorno, e chi lo aveva gia' aperto ha continuato a
 * vedere quello del 7. Online sarebbe successo a ogni cliente di ritorno.
 */
const GUSCIO_VERSIONE = 'bft-catalogo-6871049c8329';  // impronta dei file del guscio: la mette genera-app.py, non si tocca a mano
const CACHE_IMMAGINI  = 'bft-catalogo-img';        // niente versione: e' roba pesante
const GUSCIO = [
  './',
  './bft-catalogo-interattivo.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  // addAll fallisce tutto se un solo file manca: qui si prende quello che c'e'.
  // E si prende dalla RETE, non dalla cache HTTP del browser («reload»): senza,
  // il guscio nuovo si riempiva con le copie vecchie che il browser aveva gia'
  // in memoria — provato il 29/09/2026, cache nuova e manifest di prima.
  e.waitUntil(caches.open(GUSCIO_VERSIONE)
    .then((c) => Promise.allSettled(GUSCIO.map((u) => c.add(new Request(u, { cache: 'reload' })))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((k) => Promise.all(k
      .filter((x) => x !== GUSCIO_VERSIONE && x !== CACHE_IMMAGINI)
      .map((x) => caches.delete(x))))
    .then(() => self.clients.claim()));
});

const eImmagine = (u) => /\/(img|icons)\//.test(u.pathname) || /\.(png|jpe?g|webp|svg|gif)$/i.test(u.pathname);
const eFileTecnico = (u) => /\/file\//.test(u.pathname);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // le statistiche e il HUB non passano di qui

  // L'app: prima la rete, cosi' un aggiornamento si vede subito; se non c'e'
  // rete, quella in cache. E' il contrario di quello che si fa di solito, ma un
  // catalogo che mostra prezzi e codici vecchi e' peggio di uno lento.
  if (req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    e.respondWith(
      fetch(req, { cache: 'no-store' })
        .then((r) => { const copia = r.clone();
          caches.open(GUSCIO_VERSIONE).then((c) => c.put(req, copia)); return r; })
        .catch(() => caches.match(req).then((r) => r || caches.match('./bft-catalogo-interattivo.html')))
    );
    return;
  }

  // Immagini e file tecnici: prima la cache. Un disegno quotato non cambia mai,
  // e sono i file che pesano.
  if (eImmagine(url) || eFileTecnico(url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r && r.ok) { const copia = r.clone();
        caches.open(CACHE_IMMAGINI).then((c) => c.put(req, copia)); }
      return r;
    }).catch(() => hit)));
    return;
  }

  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});

/* Il catalogo chiede «quanto pesa quello che ho messo da parte?» per poterlo
   dire a chi consulta, e «buttalo via» quando lo si vuole liberare. */
self.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data === 'salta-attesa') self.skipWaiting();
  if (e.data === 'svuota-immagini') {
    e.waitUntil(caches.delete(CACHE_IMMAGINI).then(() => {
      if (e.source) e.source.postMessage({ immaginiSvuotate: true });
    }));
  }
});
