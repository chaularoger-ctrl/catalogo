# e-PANTHER — Catalogo BFT Burzoni

Il catalogo utensili BFT Burzoni, interattivo e installabile (PWA): si apre nel
browser, si aggiunge alla schermata home o al desktop, e dal secondo avvio
funziona anche senza rete.

**https://chaularoger-ctrl.github.io/catalogo/**

## Non si modifica qui

Questa cartella è la copia pubblica del catalogo (`output/pubblico/` del
progetto Catalogo-BFT), generata e pubblicata:

1. `AGGIORNA-CATALOGO.bat` nel progetto, come sempre;
2. `.venv\Scripts\python.exe _fonti\pwa\pubblica.py` — copia qui la copia
   pubblica, fa il commit e lo invia. GitHub Pages rimette online il catalogo
   in un minuto o due.

Una modifica fatta a mano qui verrebbe cancellata dalla pubblicazione
successiva: va fatta nel progetto.

`.gitattributes` (`* -text`) tiene i file identici byte per byte a quelli
generati; `.nojekyll` dice a GitHub Pages di servirli così come sono.
