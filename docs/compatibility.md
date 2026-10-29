# Compatibilità: evidenze e limiti

Data delle prove: 29 ottobre 2026. Macchina: Fedora Linux 44, Intel i7-10510U, grafica
integrata UHD. Tutti i browser sono stati eseguiti **headless** tramite Playwright 1.64.1.

Legenda: **superato** = test eseguito e passato · **fallito** = eseguito e non passato ·
**non eseguibile** = non è stato possibile eseguirlo · **non verificato** = nessuna prova.

## 1. Browser desktop

| Motore | Build | Rilevato | Percorso auto | Esito e2e | Verifica raster |
| ------ | ----- | -------- | ------------- | --------- | --------------- |
| Chromium | 156.0.8078.4 (headless) | filtro SVG su HTML: sì · backdrop-filter: sì | rifrazione | **superato** (38/38) | **superata** → `verification/chromium.json` |
| Firefox | 157.0 (headless) | filtro SVG su HTML: sì · backdrop-filter: sì | rifrazione | **superato** (37/37, 1 saltato*) | **superata** → `verification/firefox.json` |
| WebKit | Playwright webkit-2370 | — | — | **non eseguibile** | — |

\* `prefers-reduced-transparency` si emula solo via CDP di Chromium; in Firefox il test è saltato.

**WebKit**: il browser non si avvia su Fedora 44 perché mancano `libicu*.so.74` e
`libjpeg.so.8` (Playwright supporta ufficialmente Ubuntu/Debian). Non sono state installate
librerie di sistema né caricate librerie esterne. Per eseguirlo: usare l'immagine Docker
ufficiale di Playwright (`mcr.microsoft.com/playwright:v1.64.1-noble`) o una macchina Ubuntu
24.04, poi `npm run test:e2e`. Anche dopo, WebKit headless su Linux **non equivale a Safari**
su macOS o iOS.

**Safari (macOS, iOS)**: non verificato. Il renderer applica i workaround dichiarati da altri
progetti (id del filtro nuovo a ogni aggiornamento) senza averli provati.

### Metriche raster (DPR 1, preset "Ottica nuda": blur, tinta, luce, ombra a 0)

Differenza media per pixel (0–255) tra rifrazione e sorgente senza filtro, sulla griglia:

| Regione | Chromium 156 | Firefox 157 | Pixel 7 emulato |
| ------- | -----------: | ----------: | --------------: |
| Fascia perimetrale | 24,4 | 22,5 | 25,3 |
| Lato superiore / inferiore | 29,4 / 9,4 | 29,4 / 9,4 | 27,5 / 7,4 |
| Lato sinistro / destro | 38,1 / 25,3 | 32,7 / 20,7 | 41,9 / 44,5 |
| Centro (oltre la fascia) | 0 | 0 | 0 |
| Rifrazione 0 contro sorgente (stage intero) | 0,00004 | 0,0001 | 0,0004 |
| Foreground sul bordo, rifrazione 60 | 0,0001 | 0,002 | 0,0004 |

Soglie dei test: fascia > 8, ogni lato > 3, centro < 0,5, pass-through e foreground < 0,05.
I valori completi per ogni motore sono nei file `verification/*.json` (campo `metrics`).
Le differenze tra i lati dipendono dalla posizione delle linee della griglia, non dal renderer;
l'allineamento è verificato a parte con la scena a coordinate (gradiente continuo).

### Cosa coprono i test e2e (per motore)

- Rifrazione visibile con blur e tinta a zero; differenza tra rifrazione attiva e disattiva;
  rifrazione 0 come pass-through.
- Centro neutro, deviazione su tutti e quattro i lati, nessuna modifica fuori dalla lente;
  `dome` come unico modo di deformare il centro.
- Allineamento dopo spostamento, scroll interno, resize del viewport, scroll della pagina.
- Foreground fuori dal filtro e non deformato (pattern fine su sfondo uniforme).
- Nessuna rigenerazione della mappa per traslazione, trascinamento e pressione; rigenerazione
  e cache sui cambi di geometria.
- Pulizia dello stato su `pointercancel`, `lostpointercapture`, `visibilitychange`, `blur`;
  loop fermo a riposo.
- Tastiera: capsula (frecce), pulsante (Invio, Spazio, anello di focus), selettore (radio
  native, frecce), slider nativo (frecce, cursore glass che segue senza nuove mappe).
- Stati separati: pressione, hover, selezione, focus.
- Il trascinamento non blocca lo scroll del contenuto.
- Percorsi satinato e opaco; `forced-colors`, `prefers-contrast: more`,
  `prefers-reduced-transparency` (Chromium), `prefers-reduced-motion`; controlli manuali.
- Import/export JSON: round trip, input non validi rifiutati senza modifiche, import parziali.
- Rimozione di superfici e del confronto: lenti, strati e filtri rimossi.

Non coperti: conteggio diretto dei listener rimossi (si verifica l'effetto: nessuna reazione
dopo la rimozione e nessun loop attivo), lettori di schermo reali, zoom del browser.

## 2. Viewport mobile emulato

| Profilo | Motore | Esito e2e | Verifica raster |
| ------- | ------ | --------- | --------------- |
| Pixel 7 (412×915, DPR 2,625, touch) | Chromium 156 desktop | **superato** (38/38) | **superata** → `verification/mobile-emulated.json` |

È **emulazione** su Chromium desktop: viewport, DPR, touch (eventi CDP) e user agent Android.
Non dice nulla su GPU, driver, memoria, termica o compositor di un telefono. Il laboratorio
non considera mai questo record come prova per un dispositivo Android (`findVerification`
scarta gli UA Android e WebView).

## 3. Browser Android reale

**Non verificato.** Nessun dispositivo collegato durante il lavoro (`adb devices` vuoto).
Procedura: [device-testing.md](device-testing.md).

## 4. Android WebView reale

**Non verificato.** Serve un'app host con WebView (non inclusa in questa milestone).
Procedura e criteri: [device-testing.md](device-testing.md).

## Prestazioni (headless desktop)

`npm run test:perf`, scena "blocks", 1280×860, DPR 1, 3 s per scenario. Mediana e p95 dei
frame, frame oltre 33 ms, rigenerazioni della mappa. File: [perf/2026-10-29.json](perf/2026-10-29.json).

| Motore | Superfici | Sfondo | Input | Mediana | p95 | > 33 ms | Mappe |
| ------ | --------: | ------ | ----- | ------: | --: | ------: | ----: |
| Chromium | 1 | fermo | riposo | 16,7 | 16,8 | 0 | 0 |
| Chromium | 1 | fermo | trascina | 16,7 | 16,8 | 0 | 0 |
| Chromium | 1 | animato | riposo | 16,7 | 16,8 | 0 | 0 |
| Chromium | 1 | animato | trascina | 16,7 | 16,8 | 0 | 0 |
| Chromium | 4 | fermo | riposo | 16,7 | 16,7 | 0 | 0 |
| Chromium | 4 | fermo | trascina | 16,7 | 16,8 | 0 | 0 |
| Chromium | 4 | animato | riposo | 16,7 | 16,7 | 0 | 0 |
| Chromium | 4 | animato | trascina | 16,7 | 33,3 | 4 / 164 | 0 |
| Firefox | 1 | fermo | riposo | 16,4 | 17,3 | 0 | 0 |
| Firefox | 1 | fermo | trascina | 17,1 | 17,2 | 0 | 0 |
| Firefox | 1 | animato | riposo | 16,5 | 17,3 | 0 | 0 |
| Firefox | 1 | animato | trascina | 16,5 | 17,3 | 0 | 0 |
| Firefox | 4 | fermo | riposo | 16,5 | 17,3 | 0 | 0 |
| Firefox | 4 | fermo | trascina | 17,0 | 33,2 | 5 / 166 | 0 |
| Firefox | 4 | animato | riposo | 17,1 | 17,2 | 0 | 0 |
| Firefox | 4 | animato | trascina | 17,1 | 33,2 | 3 / 165 | 0 |

Lettura prudente: su questa macchina, headless, il caso peggiore (4 superfici, trascinamento)
perde qualche frame; il resto resta sul ritmo di 60 Hz. A riposo la capsula esegue 0 frame
di animazione. Chromium riporta anche tempi di task/style/layout per scenario nel JSON (layout
≤ 0,3 ms in 3 s). Il pilota Playwright gira sulla stessa macchina e muove il mouse a ogni
passo, quindi contribuisce al carico. **Non sono FPS garantiti né misure su telefono.**

## Non dichiariamo

- compatibilità universale;
- compatibilità con Safari/iOS, WebKit, Chrome Android, Android WebView, Samsung Internet;
- prestazioni o consumi su dispositivi reali.
