# Compatibilità: evidenze e limiti

Legenda: **superato** = test eseguito e passato · **fallito** = eseguito e non passato ·
**non eseguibile** = non è stato possibile eseguirlo · **non verificato** = nessuna prova.

Le evidenze sono legate a **versione del runtime, backend e ambiente**. Un record raster conta per
il laboratorio solo se è stato prodotto per la stessa versione del runtime (`findVerification` con
`runtimeVersion`): i risultati precedenti non certificano il codice modificato. L’emulazione
mobile non certifica un telefono.

## M2 · Component Engine (runtime 0.3.0) — 30 ottobre 2026

Ambiente: lo stesso delle sezioni seguenti (Linux x64, Playwright 1.64.1, browser headless). Esecuzione completa
con `npm run typecheck && npm test && npm run build && npm run test:e2e:local`, dopo l'ultima modifica.

| Controllo | Esito |
| --- | --- |
| `tsc --noEmit` | **superato** |
| Vitest | **superato** — 339 test (19 file; 285 prima di M2) |
| `npm run build` (libreria + laboratorio) | **superato**; il consumer di prova (`examples/react-consumer`, progetto indipendente con tre pacchetti esportati) passa `tsc --noEmit` e `vite build` |
| E2E Chromium + Firefox + Pixel 7 emulato (`test:e2e:local`) | **523 superati, 2 saltati, 0 falliti** (424 dei test esistenti + 99 nuovi) |
| E2E WebKit | **non eseguibile** (mancano `libicu74` e `libjpeg-turbo8`; non installate) |
| Fedeltà preview ↔ componente esportato | **superato** su Chromium, Firefox e Pixel 7: stesso elemento, attributi, testo, icona, stile calcolato di ogni strato e geometria, a riposo, in hover, premuto e con focus — 7 pulsanti (Glass/Solid; primary, secondary, ghost, collegamento, disabilitato) e 3 barre (Glass, Solid, Solid con breakpoint, tab disabilitata e semantica «tabs») |
| Raster SVG → `verification/*.json` | rigenerati dalla suite per il runtime `0.3.0` |

I due test saltati sono quelli di sempre: `prefers-reduced-transparency` (si emula solo via CDP di Chromium) in Firefox e il
cambio di progetto dal breadcrumb sul viewport mobile (che il telefono nasconde).

**Cosa coprono i test nuovi**

- `tests/unit/button.test.ts` (30): definizione, validazione (ogni proprietà non valida rifiuta il documento con il suo percorso; proprietà
  mancanti → default con avviso; sconosciute → avviso), modifica, responsive, presentazione per famiglia — **ogni proprietà descritta, cambiata, modifica
  ciò che il renderer scrive se e solo se non è tra quelle dichiarate senza effetto** —, accento Primary (contrasto ≥ 4,5:1), cambio di
  materiale senza perdite, serializzazione canonica.
- `tests/unit/component-registry.test.ts` (14): voci registrate e pianificate, controllo di coerenza, parità registro ↔ runtime, matrice
  componente × materiale, la Mobile Navbar con Solid (stessa prova proprietà per proprietà), stato del legame con override locali.
- `tests/unit/export.test.ts` (+6): pacchetti React del Button (azione, collegamento, Solid) e della navbar Solid, adapter per famiglia.
- `tests/unit/autosave.test.ts` (3), `tests/unit/project.test.ts` (+1: Button Glass e Solid in un pacchetto `.jello`).
- `tests/e2e/components.spec.ts` (19 × 3 progetti): rendering Glass e Solid, cambio di materiale, elemento (pulsante / collegamento / disabilitato),
  tastiera e focus, hover, pressione, ghost, accento, responsive, inspector condiviso con le proprietà senza effetto, navbar Solid (tab, attiva, disabilitata,
  tastiera, responsive), import/export della definizione.
- `tests/e2e/component-export.spec.ts` (10 × 3): fedeltà preview ↔ pacchetto, sopra.
- `tests/e2e/react-consumer.spec.ts` (+4 × 3): i due Button esportati in un'app React indipendente (props, stati, ricreazione sul posto).

**Instabilità.** `builder.spec.ts › a material customised in the Material Lab…` (e il test gemello «an edited built-in…»): in 28 ripetizioni
in parallelo (4 worker) **prima** della correzione non è fallito, quindi l'intermittenza non è stata riprodotta nel browser. La causa è stata
trovata e riprodotta in modo deterministico a livello unitario: `Autosaver.flush()` ritornava al termine della scrittura già in corso, fatta da
uno stato precedente (`tests/unit/autosave.test.ts` fallisce senza la correzione). Il test leggeva inoltre lo stato subito dopo un clic che
completa in modo asincrono: ora aspetta la condizione (`expect.poll`). Nessun timeout aggiunto. Nell'esecuzione completa il test è passato su tutti i progetti.

Trovato e corretto con i test nuovi: la pressione di una tab della navbar terminava quando il focus passava da un'altra tab della stessa barra
(`focusout`); `GlassSurface.destroy()` lasciava `data-jello-path`, `data-jello-sizing` e `--jello-host-radius` sull'ospite; il trigger
dell'evento di focus del Button era sempre «keyboard».

**Non verificato in M2:** WebKit e Safari (macOS, iOS); prestazioni (la suite `test:perf` non è stata rieseguita: il percorso Glass non è stato modificato e
Solid non ha cicli di animazione, ma non c'è una misura); telefono fisico e Android WebView (come in precedenza).

## Runtime 0.3.0 (Material Core: Solid, registro generalizzato) — 30 ottobre 2026

Ambiente: lo stesso della 0.2.0 (Linux x64, Playwright 1.64.1, headless). WebKit non eseguito.

| Controllo | Esito |
| --- | --- |
| `tsc --noEmit` | **superato** |
| Vitest | **superato** — 235 test (165 prima di M1) |
| `npm run build` (libreria + laboratorio) | **superato** |
| E2E Chromium + Firefox + Pixel 7 emulato (`test:e2e:local`) | 394 superati, 2 saltati, 3 falliti alla prima esecuzione (vedi sotto) |
| Solid nel browser (`solid.spec.ts`, 7 test × 3 progetti) | **superato** (21/21) |
| Raster SVG → `verification/*.json` | rigenerati dalla suite per il runtime `0.3.0` (11 controlli per motore, esito dei record) |

I tre fallimenti: `materials.spec.ts › imports become personal materials` falliva **identico sul
commit precedente** (il test leggeva lo stato subito dopo un'eliminazione asincrona): corretto con
`expect.poll`; `builder.spec.ts › an edited built-in is saved as a personal copy` ha fallito una volta
su Pixel 7 emulato e non si è ripetuto. Rieseguiti insieme 18 volte (3 progetti × 3 ripetizioni × 2
test): 18 superati. Non è stata rieseguita l'intera suite dopo la correzione.

### M1.1 · formato unico delle componenti, 30 ottobre 2026

| Controllo | Esito |
| --- | --- |
| `tsc --noEmit` | **superato** |
| Vitest | **superato** — 285 test (16 file) |
| `npm run build` (libreria + laboratorio) | **superato**; la libreria costruita non contiene identificativi legacy |
| E2E Chromium + Firefox + Pixel 7 emulato (`test:e2e:local`), esecuzione completa | 411 superati, 2 saltati, **13 falliti** |
| Gli stessi test falliti, rieseguiti dopo la correzione | **superati** su tutti e tre i progetti (4 test) |
| `builder.spec.ts › a material customised in the Material Lab…` (solo Chromium) | fallito nell'esecuzione completa, superato quando rieseguito: **instabile** (legge lo stato subito dopo il clic) |

I 13 fallimenti dell'esecuzione completa erano 4 test scritti in questa milestone con asserzioni
errate (un elemento `#notice` assente quando non c'è avviso; ombra calcolata dal browser come
`color(srgb …)` invece di `rgba()`; l'host Solid non raggiunto dal primo `Tab`) più l'instabilità
indicata. Non è stata rieseguita l'intera suite dopo le correzioni. WebKit non eseguito.

Migrazione dei formati: 3 file reali del formato precedente (`tests/fixtures/legacy/`) convertiti, vista
derivata identica alla `root` originale (SVG, breakpoint, eventi, materiale personale compresi); lettura
da IndexedDB, da file e da pacchetto `.jello`; apertura nel laboratorio reale (E2E).

Compatibilità preservata (controllata da `tests/unit/registry.test.ts`): 24 parametri e 5 preset di
Glass, `runtime.min` dei documenti Glass a `0.2.0`, simboli pubblici del runtime, lettura dei file
`jello-glass` v1. I record raster della 0.2.0 non valgono per la 0.3.0 (`findVerification` confronta
la versione): sono stati sostituiti da quelli prodotti dalla suite.

## Runtime 0.2.0 (Material Lab) — 29 ottobre 2026

Macchina: ThinkPad T14 Gen1, Intel i7-10510U, 31 GB RAM, grafica integrata Intel UHD, Fedora 44
(kernel 7.2.12). Node 22.23.1, Playwright 1.64.1, browser **headless**.

| Verifica | Ambiente | Esito |
| --- | --- | --- |
| `npm run typecheck` | TypeScript 7.0.2, modalità rigorosa | **superato** |
| `npm test` (Vitest 5) | Node 22 | **superato** (101/101, 9 file) |
| `npm run build` (libreria + laboratorio + anteprima) | Vite 8.3.5 | **superato** (`dist-lib/` con tipi, `dist/` con laboratorio, anteprima e `runtime/`) |
| e2e Chromium 156.0.8078.4, desktop 1280×860 DPR 1 | headless | **superato** (89/89) |
| e2e Firefox 157.0, desktop 1280×860 DPR 1 | headless | **superato** (88/88, 1 saltato: `prefers-reduced-transparency` si emula solo via CDP) |
| e2e viewport Pixel 7 emulato (412×915, DPR 2,625) su Chromium 156 | headless, emulazione | **superato** (89/89); è emulazione, non un telefono |
| e2e WebKit | — | **non eseguibile** (librerie di sistema mancanti, vedi sotto) |
| Raster SVG → `verification/{chromium,firefox,mobile-emulated}.json` | `runtime: "0.2.0"`, `backend: "svg"` | **superata** (11 controlli per motore) |
| Raster WebGL2 (correttezza ottica) | — | **non verificato**: c’è il confronto anteprima ↔ pacchetto, non un controllo raster dedicato |
| Preview ↔ pacchetto esportato, DOM/SVG, 480×320, DPR 1 | Chromium, Firefox, mobile emulato | **superato**: differenza media 0,0000 livelli (identici) su tutti e tre |
| Preview ↔ pacchetto esportato, WebGL2 a t = 0 | Chromium (SwiftShader), Firefox (GPU Intel), mobile emulato | **superato**: differenza media 0,0000 livelli su tutti e tre |
| Esempio consumatore `examples/navbar` dal runtime costruito | Chromium, Firefox, mobile emulato | **superato** (4 test per progetto; backend effettivo SVG su Chromium) |
| Sincronizzazione lab → relay → anteprima (stesso computer, 127.0.0.1) | Chromium, Firefox, mobile emulato | **superato** (4 test per progetto) |
| Telefono fisico sulla LAN | — | **non verificato** (nessun dispositivo collegato, `adb devices` vuoto) |
| Chrome Android su emulatore | AVD `medium_phone`, Android 16 (API 36), x86_64 Play Store | **non eseguibile**: con `-gpu swiftshader_indirect` l’emulatore headless termina con segmentation fault al primo avvio a freddo; con `-gpu swangle_indirect` si avvia ma adb resta *unauthorized* (l’immagine Play Store chiede di confermare la chiave sullo schermo, assente in modalità headless) |
| App Capacitor (`apps/android-preview`) | Capacitor 8.6.0 | progetto Android generato e sincronizzato; **APK non costruito**: il wrapper Gradle 8.14.3 non gira su JDK 25 («Unsupported class file major version 69»); con Gradle 9.2.1 la configurazione passa ma manca `javac` (installato solo il JRE `java-25-openjdk`) |
| Android WebView reale | — | **non verificato** |

### Cosa coprono i nuovi test

- **Modello** (`tests/unit/model.test.ts`): sezioni, migrazione v1 di tutti i preset e di un file
  personalizzato senza perdite, round-trip v1 → v2 → v1, export v1 con campi non rappresentabili,
  import atomici, versioni future (schema, famiglia, runtime) rifiutate, famiglia Jelly (pianificata) rifiutata.
- **Persistenza** (`storage.test.ts`, `materials.spec.ts`): salvataggio e riapertura dopo il
  ricaricamento, bozza dei preset inclusi, annullamento, import come copia personale,
  migrazione del database da versione 1 a 2, IndexedDB assente («Non persistente»), errore di
  quota mai riportato come salvato.
- **Renderer** (`webgl.spec.ts`): chunk WebGL2 caricato solo in Scena controllata, nessun frame a
  riposo, slider → solo uniform (programma compilato una volta), geometria → una mappa, cache,
  loop con sorgente animata e sospensione fuori schermo, DPR e risoluzione interna del profilo,
  perdita e ripristino del contesto, immagine non leggibile per CORS, rilascio delle texture,
  errore di compilazione dello shader, fallback CSS senza WebGL2.
- **Export** (`export.test.ts`, `export.spec.ts`): contenuto e hash del pacchetto, nessun percorso
  privato, solo CSS dichiarato ridotto, confronto con l’anteprima.
- **Sincronizzazione** (`sync.test.ts`, `sync.spec.ts`): protocollo, token, stato completo,
  ricollegamento, messaggio invalido rifiutato per intero, immagine locale via relay.
- **Confini** (`boundaries.test.ts`): il runtime non raggiunge editor, storage, relay né React.
- I 59 test e2e delle milestone precedenti girano sulla nuova dashboard (stessi id e
  semantica); il test di esportazione ora verifica il formato v2 e c’è un test dedicato a v1.

### Prestazioni (headless desktop, `docs/perf/2026-10-29*.json`)

Intervallo tra frame, mediana / p95 in ms, 3 s per scenario. Le misure di prima di questa
versione sono conservate in `docs/perf/2026-10-29-pre-0.2.json` e `…-navbar-pre-0.2.json`.

| Suite | Chromium 156 | Firefox 157 |
| --- | --- | --- |
| Capsula, 1 o 4 superfici, sfondo fermo, a riposo | 16,7 / 16,8 · 0 frame di molla | 17,0 / 17,1 · 0 frame di molla |
| Capsula, 4 superfici, sfondo animato, trascinamento | 16,7 / 16,8 (3 frame > 33 ms) | 32,6 / 33,5 |
| Navbar, sfondo fermo / scorrimento / animato, a riposo | 16,7 / 16,7 | 17,1 / 17,1–17,4 |
| Navbar, pressioni ripetute | 16,7 / 16,8 | 17,1 / 17,1–33,2 |
| Scena WebGL2, pattern fermo, a riposo (tutti i profili) | 16,7 · **0 frame renderizzati** | 17,1 · **0 frame renderizzati** |
| Scena WebGL2, pattern animato, Economy | 16,7 / 16,8 | 17,0 / 17,1 |
| Scena WebGL2, pattern animato, Balanced | **50 / 66,7** | 17,1 / 17,1 |
| Scena WebGL2, pattern animato, Quality | **116,7 / 133** | 17,1 / 17,1 |

- Chromium headless esegue WebGL2 su **SwiftShader** (renderer software su CPU, stringa
  registrata nel file); Firefox headless usa la GPU Intel. I numeri WebGL2 di Chromium misurano
  quindi il fallback software, non la GPU del T14. Con SwiftShader solo Economy regge 60 fps con
  sorgente animata.
- Lavoro JavaScript per frame della scena: ~0,1 ms (mediana) in tutti i casi. Tempo GPU **non
  disponibile**: nessuno dei due browser headless espone `EXT_disjoint_timer_query_webgl2`.
- CSS/SVG: «0 frame di molla» significa nessun loop JavaScript; il costo di filtro e compositing
  del browser non è misurabile da JS ed è incluso solo nell’intervallo tra frame.
- Temperatura, consumo e memoria GPU non sono misurati né stimati. Nessuna misura su telefono.

## Milestone precedenti (runtime non versionato)

Le sezioni seguenti descrivono le prove della milestone 1 e di «Navbar & Material Workbench»,
eseguite sullo stesso giorno prima di questa versione. Restano come storia: i loro record raster
non avevano il campo `runtime` e sono stati sostituiti da quelli della 0.2.0.

## 1. Browser desktop

| Motore | Build | Rilevato | Percorso auto | Esito e2e | Verifica raster |
| ------ | ----- | -------- | ------------- | --------- | --------------- |
| Chromium | 156.0.8078.4 (headless) | filtro SVG su HTML: sì · backdrop-filter: sì | rifrazione | **superato** (59/59) | **superata** → `verification/chromium.json` |
| Firefox | 157.0 (headless) | filtro SVG su HTML: sì · backdrop-filter: sì | rifrazione | **superato** (58/58, 1 saltato*) | **superata** → `verification/firefox.json` |
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
| Fascia perimetrale | 24,5 | 25,4 | 28,0 |
| Lato superiore / inferiore | 28,2 / 9,8 | 37,5 / 9,8 | 33,4 / 7,4 |
| Lato sinistro / destro | 35,1 / 36,0 | 29,4 / 29,4 | 41,5 / 42,7 |
| Centro (oltre la fascia) | 0 | 0 | 0 |
| Rifrazione 0 contro sorgente (stage intero) | 0,00002 | 0,0001 | 0,0001 |
| Foreground sul bordo, rifrazione 60 | 0 | 0 | 0,0001 |
| Navbar: foreground sul bordo, rifrazione 30 | 0,02 | 0 | 0,017 |
| Blur 8 a 6 px dal bordo della sorgente (dev. std. griglia) | 6,1 | 5,9 | 5,5 |
| … stessa misura con riga alfa identità (prima della correzione) | 17,9 | 17,9 | 17,2 |
| … all'interno della lente (riferimento) | 6,1 | 6,1 | 6,0 |

Soglie dei test: fascia > 8, ogni lato > 3, centro < 0,5, pass-through e foreground < 0,05;
blur al bordo < 1,6 × interno + 3 e almeno 1,8 volte sotto la variante non normalizzata.
I valori di fascia e lati sono quelli dell'ultima esecuzione (i lati cambiano di qualche
unità rispetto alla milestone 1 perché lo stage ha altre dimensioni con la toolbar).
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
- **Navbar** (`tests/e2e/navbar.spec.ts`): ancoraggio in basso, target ≥ 44 px, etichette fuori
  dalla sorgente; barra e lente ferme mentre il contenuto scorre, rotella sopra la barra,
  ultima riga raggiungibile; pressione distinta dalla selezione (anche rilascio fuori dalla
  voce); tastiera e anello di focus; indicatore come strato, non lente; toolbar e pannello
  sincronizzati; reset dello scroll in entrambi i riquadri.
- **Confronto**: stesso oggetto nei due riquadri, selezione/scroll sincronizzati in entrambe le
  direzioni, etichetta con il percorso effettivo (opaco con trasparenza ridotta).
- **Ciclo di vita**: sei passaggi Capsula ↔ Navbar senza residui; passaggio durante
  un'animazione; resize e cambio percorso senza riattivare superfici nascoste; host nascosto dal
  layout senza lente; listener rilasciati (la capsula smontata non reagisce alla tastiera).
- **Mappa diagnostica**: appartiene alla superficie montata, con le sue dimensioni, su tutti i
  percorsi.
- **Controlli numerici**: sincronizzazione slider/campo, rifiuto di vuoto, testo, `1e999`, fuori
  intervallo, fuori passo, unità; nessuna scrittura sul filtro con input invalidi.
- **Fallback**: movimento ridotto (indicatore senza transizione, pressione senza scala),
  forced-colors con la navbar (opaco, nessuna lente, selezione funzionante).
- Raster navbar: lente allineata alla barra prima e dopo lo scroll; foreground non deformato;
  blur al bordo della sorgente.

Non coperti: conteggio diretto dei listener rimossi (si verifica l'effetto: nessuna reazione
dopo la rimozione e nessun loop attivo), lettori di schermo reali, zoom del browser.

## 2. Viewport mobile emulato

| Profilo | Motore | Esito e2e | Verifica raster |
| ------- | ------ | --------- | --------------- |
| Pixel 7 (412×915, DPR 2,625, touch) | Chromium 156 desktop | **superato** (59/59) | **superata** → `verification/mobile-emulated.json` |

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

### Navbar (`node scripts/perf.mjs --suite navbar`)

Scena "app", navbar con preset `navbar`, 1280×860, DPR 1, 3 s per scenario. "Scorrevole" =
scroller mosso in ogni frame da un ciclo `requestAnimationFrame` nella pagina; "pressioni" =
pressioni da 120 ms ripetute sulle quattro voci. File: [perf/2026-10-29-navbar.json](perf/2026-10-29-navbar.json).

| Motore | Sfondo | Input | Mediana | p95 | > 33 ms | Mappe | Frame molla |
| ------ | ------ | ----- | ------: | --: | ------: | ----: | ----------: |
| Chromium | fermo | riposo | 16,7 | 16,7 | 0 | 0 | 0 |
| Chromium | fermo | pressioni | 16,7 | 16,7 | 0 | 0 | 34 |
| Chromium | scorrevole | riposo | 16,7 | 16,8 | 0 | 0 | 0 |
| Chromium | scorrevole | pressioni | 16,7 | 16,8 | 0 | 0 | 34 |
| Chromium | animato | riposo | 16,7 | 16,7 | 0 | 0 | 0 |
| Chromium | animato | pressioni | 16,7 | 16,7 | 0 | 0 | 34 |
| Firefox | fermo | riposo | 16,5 | 17,2 | 0 | 0 | 0 |
| Firefox | fermo | pressioni | 17,1 | 17,1 | 0 | 0 | 34 |
| Firefox | scorrevole | riposo | 17,1 | 17,1 | 0 | 0 | 0 |
| Firefox | scorrevole | pressioni | 17,1 | 17,2 | 0 | 0 | 35 |
| Firefox | animato | riposo | 17,0 | 17,2 | 0 | 0 | 0 |
| Firefox | animato | pressioni | 17,1 | 17,1 | 0 | 0 | 34 |

Su Chromium il tempo dei task in 3 s passa da 26 ms (fermo) a 100 ms (scorrevole) e 73 ms
(animato) a riposo: il costo dello scroll è il ridisegno della sorgente filtrata, non il
laboratorio (0 mappe, 0 frame di molla). La molla della navbar gira solo durante le pressioni.
Firefox non espone queste metriche via Playwright.

**Capsula, controllo di regressione.** La suite capsula rieseguita con questo codice resta a
0 mappe e 0 frame a riposo; i frame oltre 33 ms nei casi a 4 superfici (Chromium animato +
trascina 18/141, Firefox fino a 12/131) sono più che nella tabella sopra. Rieseguendo subito
dopo la build della milestone 1 sulla stessa macchina i valori sono dello stesso ordine
(Chromium 9/153, Firefox fino a 20/115): la differenza è variabilità della macchina, non del
codice. Un confronto mirato (trascinamento 3 s, 3 ripetizioni, Chromium) dà tempo dei task
430–519 ms per M1 e 440–478 ms per questa versione. La tabella della capsula sopra resta quella
della milestone 1; i numeri del controllo non sono stati salvati in `docs/perf/`.

## Non dichiariamo

- compatibilità universale;
- compatibilità con Safari/iOS, WebKit, Chrome Android, Android WebView, Samsung Internet;
- prestazioni o consumi su dispositivi reali.
