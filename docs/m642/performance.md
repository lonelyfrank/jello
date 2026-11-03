# M6.4.2 — Prestazioni e ciclo di vita delle risorse

Script: `scripts/m642-perf.mjs` (`npm run build && node scripts/m642-perf.mjs`) → `perf-results.json`. Misurato sulla build di produzione servita da `vite preview` su localhost.

**Ambiente:** Fedora 44, kernel 7.2.13, Intel Core i7-10510U (8 thread) a 1,8 GHz, 31 GB RAM, GPU integrata UHD, Chromium 156.0.8078.4 e Firefox 157.0 **headless**, viewport 1280×860, DPR 1. Finestra di misura 3 s. Misure eseguite al commit `43ce36b`; le modifiche successive alla UI (`ExperimentalBoundary`, sezione Impostazioni, CSS delle scene) non toccano percorsi misurati e non sono state rimisurate.

**Cosa è MISURATO e cosa NO.** Misurato: chiamate a `requestAnimationFrame` (strumentate con `addInitScript`), intervalli fra callback, long task, tempo di script/layout/stile (CDP `Performance.getMetrics`, solo Chromium), conteggi DOM/listener/heap (CDP `Memory.getDOMCounters`, solo Chromium). **Non misurato:** tempo GPU, paint/composite (invisibili a JS), telefoni, hardware reale diverso da questo portatile. In headless gli intervalli di frame sono limitati dal vsync virtuale: sono confrontabili fra scenari **su questa macchina**, non sono promesse di FPS. Gli intervalli di Firefox sono più alti di quelli di Chromium nello stesso scenario (p50 26 ms vs 16,6 ms sotto 60 modifiche rapide): sono differenze di motore/headless, non una conclusione sul prodotto.

## 1. Scenari (§13.1–13.2)

| Scenario | RAF pianificati (3 s) | Intervallo frame p50 / p95 / p99 (ms) | Long task | Script / layout / stile (ms) | Nodi · listener · heap |
|---|---|---|---|---|---|
| Studio, primo avvio → `data-ready` | — | — | — | — | **237 ms** (Chromium), 479 ms (Firefox); 2 447 nodi · 568 listener · 6,2 MB |
| Home a riposo | **0** | — | 0 | 5,6 / 0 / 0,01 | 2 453 · 676 · 7,2 MB |
| Material Lab · Glass a riposo | **0** | — | 0 | 0 / 0 / 0 | 2 802 · 1 470 · 9,5 MB |
| Material Lab · Solid a riposo | **0** | — | 0 | 0 / 0 / 0 | 4 973 · 2 286 · 11,7 MB |
| Glass · 60 modifiche rapide di 2 parametri | 44 | 16,6 / 19,6 / 20,0 | 0 | 199 / 35 / 38 | 7 353 · 9 055 · 20,8 MB (tutte le sezioni aperte) |
| **Jello a riposo** | **0** | — | 0 | 0 / 0 / 0 | 5 277 · 510 · 13,0 MB |
| **Jello · puntatore tenuto 3 s** | **37** (≈ 0,6 s di moto, poi si ferma) | 16,7 / 17,0 / 17,0 | 0 | 12,6 / 1,8 / 4,5 | 5 282 · 522 |
| **Jello · rilascio → rimbalzo → riposo** | **37** | 16,7 / 17,0 / 17,0 | 0 | 11,2 / 2,0 / 4,0 | 5 282 · 534 |
| **Jello a riposo dopo il rimbalzo** | **0** | — | 0 | 0 / 0 / 0 | 5 282 · 534 |
| Home a riposo dopo 252 cambi di area | **0** | — | 0 | 0 / 0 / 0 | — |
| Material Lab · 8 cambi di viewport | 16 | 16,2 / 137,4 / 137,4 | 0 | 33 / 42 / 41 | 3 125 · 1 123 |
| Library · famiglia Jello, 4 anteprime vive | **0** | — | 0 | 0 / 0 / 0 | 3 559 · 595; 241 nodi SVG nelle 4 card |

Firefox (stessi scenari, solo RAF/intervalli/long task): RAF a riposo **0** ovunque, Jello tenuto e rimbalzo **37 / 37**, a riposo dopo **0**; nessun long task (Firefox non espone `longtask`: il campo non è informativo). I conteggi DOM/listener/heap sono solo Chromium.

Lettura:
- **Nessun RAF perpetuo a riposo** in nessuna area, in due motori (§13.3). Jello si ferma da solo quando il sistema è assestato **anche con il puntatore ancora premuto** (37 frame ≈ 0,6 s, poi 0): coerente con `jellyMotionSettled`.
- Durante la pressione e il rimbalzo di Jello il numero di nodi del documento **non cambia** (5 282 → 5 282): le bolle non vengono ricreate (§7.4). I listener crescono di 12 per fase (522 → 534): verificare se è accumulo non rilasciato è fuori portata di questa misura (heap +~2 MB per fase prima che il GC passi); non è stato diagnosticato.
- **Aggiornamenti React per frame**: durante il moto Jello lo script totale è 11–13 ms in 37 frame (≈ 0,3 ms/frame): il motore non rende React a ogni frame (verifica indiretta, non uno spy sui render).

## 2. Ciclo di vita (§13.3) — navigazione ripetuta

3 batch × 12 giri × 7 aree (252 cambi di area), con GC forzato dopo ogni batch:

| | prima | dopo batch 1 | dopo batch 2 | dopo batch 3 |
|---|---|---|---|---|
| nodi DOM | 3 319 | 3 319 | 3 319 | 3 319 |
| listener JS | 532 | 532 | 532 | 532 |
| heap JS (MB) | 8,38 | 9,71 | 10,03 | 10,42 |

**Nodi e listener costanti** ⇒ nessun listener duplicato, nessun nodo orfano, nessun observer non scollegato *visibile dai contatori*. **L'heap cresce di 2 MB**, ma in modo sublineare (+1,33 al primo batch, poi +0,32 e +0,39): compatibile con cache che si riempiono, non provato come perdita né escluso. Un test più lungo (≥10 batch) o un confronto di snapshot dell'heap sarebbe il passo successivo; non fatto.

Verifiche di lifecycle esistenti, passate: «releases everything when the area is left: hidden preview is suspended and no RAF is left» (`jelly-studio.spec:327`); `example.spec:64` e il test di `destroy` del consumer Jello (0 RAF, 0 DOM); `webgl.spec` («destroying the view releases every texture», animazione sospesa se in pausa/nascosta); 0 timer diagnostici a pannello chiuso (Home a riposo: 0 RAF, 0 long task, script 0 ms).

## 3. Bundle (§13.4)

Build finale (HEAD `09036f8`; confronto con la baseline `origin/main`). Il bundle dello Studio cresce di **+3,6 kB raw (+1,3 kB gzip)** per ciò che questa milestone aggiunge (confine d'errore, reset alla base, layout reset, scene): irrilevante, ma dichiarato:

| Artefatto | raw | gzip |
|---|---|---|
| `dist/assets/lab-*.js` (**Studio**) | 628,9 kB (baseline 625,4) | 177,9 kB (baseline 176,7) |
| `dist-lib/jello.js` (runtime produttivo) | 202,2 kB (baseline 202,1) | 54,7 kB |
| `dist-jelly/jello-jelly-experimental.js` | 87,0 kB | 24,6 kB |
| `jelly-lab` + `JellyMain` (chunk lazy dello Studio) | 65,5 + 45,4 kB | 21,4 + 14,6 kB |

**Avviso Vite «chunk > 500 kB»**: unico chunk interessato = il bundle dello Studio. **Non proposto alcuno splitting**: l'avvio misurato è 237 ms su localhost (Chromium) con 2 447 nodi; lo splitting per area (Builder / Material Lab / Asset / Export) aggiungerebbe chunk lazy e stati di caricamento in ogni transizione, con il rischio di guasti di rete nell'interfaccia stabile (come M642-18 mostra per le parti già lazy) in cambio di un guadagno **non dimostrato** sul percorso reale (rete mobile, CPU lenta). Prima di qualsiasi split: misurare il tempo di parse/esecuzione su un telefono di fascia media e il contenuto del chunk (non analizzato qui). Il caricamento differito di Jello è **preservato** (la sua area, le anteprime in Library e la prova nel Builder restano `import()`; test `jelly-studio.spec:50` e `material-library.spec:54`).

## 4. Cosa resta aperto

- Nessuna misura su hardware mobile reale né in WebView Android.
- Nessuna misura del costo GPU; la scena WebGL2 ha già suite proprie (`scripts/perf.mjs --suite scene`, `docs/perf/`), non rieseguite.
- Heap: crescita sublineare di ~2 MB su 252 cambi di area, non diagnosticata.
- Listener +12 per fase nel moto Jello, non diagnosticato.
