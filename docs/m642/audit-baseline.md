# M6.4.2 — Audit baseline

Misurato il 2026-11-03, prima di qualsiasi modifica funzionale.

## 1. Baseline effettivamente utilizzata

| Voce | Valore |
|---|---|
| Repository | `lonelyfrank/jello` |
| HEAD di `origin/main` (dopo `git fetch`) | `7692b4c3c4894707fc6b68e1be5365a446864769` — *Merge pull request #3 (m641-material-library-integrity)*, coincide con il commit indicato nel mandato |
| `main` locale | `3dd8bce` (in ritardo di 2 PR rispetto a `origin/main`; **non toccato**) |
| Branch di lavoro | `m642-studio-material-quality-gate`, creato da `origin/main` |
| Modifiche locali all'avvio | nessuna (working tree pulito) |
| Commit locali non pushati sul branch `m641-material-library-integrity` | 2 (`095af87`, `6ce4dce`), **assenti da `main`** — vedi M642-00 |
| Host | Fedora 44, kernel 7.2.13, Intel i7-10510U, 31 GB RAM, GPU UHD Graphics |
| Toolchain | Node 22.23.1, npm 10.9.8, Playwright 1.64.1, Chromium 156, Firefox 157 |
| WebKit | **NOT RUN** — `browserType.launch: Host system is missing dependencies to run browsers` (riverificato oggi). Per riprodurre: `sudo npx playwright install-deps webkit && npx playwright test --project=webkit` |

La baseline di test è stata misurata su `origin/main` puro. I due commit locali di `m641` sono stati portati sul branch con `cherry-pick` solo dopo (commit `a2d421f`, `a3b9be7`).

## 2. Risultati automatici di baseline

| Comando | Esito | Tempo | Note |
|---|---|---|---|
| `npm ci` | OK, 0 vulnerabilità | 2,2 s | 54 pacchetti |
| `npm run typecheck` | **PASS**, 0 errori/avvisi | 1,5 s | |
| `npm test` | **PASS** — 37 file, **766 test**, 0 falliti, 0 saltati | 9,7 s | |
| `npm run build` (lib + jelly + tsc + vite) | **PASS** | ~25 s | 1 avviso Vite (vedi §4) |
| `npm run build:lib` | PASS | 1,4 s | |
| `npm run build:jelly` | PASS | 0,9 s | |
| `npm run test:e2e:local` (chromium + firefox + mobile-emulated) | **791 passati, 64 saltati, 0 falliti, 0 flaky** | 13,7 min | 855 test totali; 2 worker |

Consumer React / Vanilla / esempio navbar: sono costruiti ed esposti da `scripts/e2e-servers.mjs` (`prepare-example`, `prepare-consumer`, `prepare-vanilla`) e le loro spec (`react-consumer`, `vanilla-consumer`, `desktop-consumer`, `example`, `component-export`) sono nei 791 passati. Il consumer Jello (`jelly-consumer:prepare`) non fa parte di `e2e-servers`: il suo percorso è coperto da `jelly-studio.spec.ts` ("Jelly experimental export"), vedi `export-consumer-parity.md`.

### 2.1 Skip esistenti (64) — non trasformati in successi

| Gruppo | N | Motivo dichiarato nel codice |
|---|---|---|
| `studio-responsive.spec.ts` (4 test × 7 viewport) su firefox e mobile-emulated | 56 | "layout rules are checked once, on desktop Chromium" |
| `jelly-studio.spec.ts` su mobile-emulated (tastiera, pointer-leave, download/consumer, flusso desktop) | 4 | nessuna tastiera hardware / semantica mouse / flusso desktop |
| `projects.spec.ts:70`, `release-gate.spec.ts:53`, `studio-redesign.spec.ts:61` su mobile-emulated | 3 | switcher progetto nel breadcrumb nascosto sui telefoni / separatori solo desktop |
| `fallback.spec.ts:73` su firefox | 1 | emulazione CDP solo in Chromium |

Nessuno skip è condizionato da WebGL2 o da `forced-colors` in questo ambiente (i test relativi sono eseguiti).

### 2.2 Console, network, chunk

- Errori di console / `pageerror` / richieste fallite durante la visita di tutte le aree dello Studio (Home, Builder, Material Lab, Library, Preview & Test, Jello β, Asset, Impostazioni) a 1280×860: **0**.
- Stessa visita a 320×640, 390×844, 768×1024, 844×390, 1024×768, 1440×900: **0 errori, 0 overflow orizzontale, 0 `id` duplicati, 0 controlli senza nome accessibile** (sonda in `docs/m642/tools/`, vedi `studio-ux-review.md`). L'unico difetto di nome accessibile emerge in uno stato non iniziale (M642-12).
- Avviso Vite: *"Some chunks are larger than 500 kB"* → `dist/assets/lab-*.js` 625,38 kB (gzip 176,65 kB). Gli altri chunk sono ≤ 112 kB.
- File modificati indirettamente dai test: `verification/{chromium,firefox,mobile-emulated}.json` (solo il campo `date`), riscritti da `tests/e2e/raster.spec.ts:288`. Ripristinati con `git checkout verification/` (M642-15). Nessun altro file tracciato è cambiato (lockfile compresi).

### 2.3 Dimensioni dei bundle (build di baseline)

| Artefatto | Raw | gzip |
|---|---|---|
| `dist-lib/jello.js` (runtime produttivo) | 202,13 kB | 54,72 kB |
| `dist-lib/chunks/glass-group-*.js` | 81,55 kB | 23,92 kB |
| `dist-lib/chunks/scene-view-*.js` (WebGL2, lazy) | 35,87 kB | 10,81 kB |
| `dist-lib/jello.css` | 22,08 kB | 4,37 kB |
| `dist-jelly/jello-jelly-experimental.js` (runtime sperimentale, separato) | 87,01 kB | 24,57 kB |
| `dist/assets/lab-*.js` (Studio) | 625,38 kB | 176,65 kB |
| `dist/assets/components-*.js` | 112,35 kB | 36,53 kB |
| `dist/assets/url-*.js` | 102,61 kB | 30,50 kB |
| `dist/assets/jelly-lab-*.js` + `JellyMain-*.js` (lazy) | 65,54 + 45,40 kB | 21,38 + 14,57 kB |
| `dist/assets/lab-*.css` | 116,40 kB | 22,57 kB |

## 3. Ricognizione architetturale

Metodo: grafo degli `import` statici di `src/` (script in `docs/m642/tools/import-graph.mjs`), più lettura dei moduli.

| Verifica | Risultato |
|---|---|
| Dipendenze circolari (import di valore) | **1 ciclo**: `components/definition.ts` → `navbar-desktop.ts` → `navbar-structure.ts` → `definition.ts`. Funziona perché gli usi sono dentro funzioni (nessun accesso a livello di modulo). Non modificato: M642-14 (P2, rinviato). |
| Il runtime produttivo (`src/runtime/index.ts`, 45 file raggiungibili) importa staticamente moduli sperimentali/Jelly | **No** |
| Moduli fuori da `experimental`/`lab` che importano catalogo o nomi | Solo `model/catalog/names.ts` (dipendenza-foglia voluta) da `core/presets.ts`, `model/solid.ts`, `components/templates.ts`; nessun import di `catalog/index.ts` o `experimental-names.ts` |
| Caricamento Jello | `React.lazy(() => import('../experimental/jelly/JellyMain'))`, `JellyCatalogPreview`, `BuilderTrial`: tutti dinamici |
| Renderer duplicati | Nessuna seconda implementazione visiva trovata. Le miniature usano `MaterialThumbnail runtime` / `RuntimeThumbnail` (runtime reale) |
| Campi di metadati letti da nessuno | `FamilyInfo.editor` (M642-10) |
| Lifecycle (RAF / listener / observer) | Ogni `addEventListener`/`ResizeObserver`/`IntersectionObserver` incontrato in `runtime/`, `stage/`, `core/`, `runtime/experimental/` ha una `removeEventListener`/`disconnect`/cleanup corrispondente (lettura). Misure a runtime in `performance.md` |

## 4. Registro dei problemi

Priorità: P0 bloccante · P1 importante · P2 rifinitura. Ogni voce è stata **riprodotta** (R) nel browser/nei test o **verificata per lettura** (L); lo stato finale è in `issues-and-fixes.md`.

### M642-00 — Conflitto di bozza che mascherava il conflitto sulla copia (Jello lab)

| Campo | |
|---|---|
| Area | `src/lab/experimental/jelly/workbench.ts` |
| Priorità | P1 (integrità dati / flusso di risoluzione) |
| Sintomo | Con due schede aperte, un conflitto sulla bozza sostituiva il conflitto sulla copia salvata: l'utente perdeva la via d'uscita "salva come copia" |
| Riproduzione | Test unitario `jelly-integrity.test.ts › a draft conflict never masks a conflict about the copy…` eseguito su `workbench.ts` di `origin/main` |
| Atteso | Il conflitto sulla copia resta visibile; quello sulla bozza riemerge dopo la risoluzione |
| Effettivo | **R**: 2 test falliti su `origin/main` (memory + IndexedDB), 70/70 con il fix |
| Causa | `leavingConflict()`/`save()` azzeravano `conflict` senza considerare `draftPaused` |
| Impatto | Utente (scelta di risoluzione persa); nessuna perdita di dati: la scrittura era comunque rifiutata |
| Test | Già nei commit locali `095af87`/`6ce4dce`, portati con cherry-pick (`a2d421f`, `a3b9be7`) |

### M642-01 — La tile «Jello» della Home è marcata "In sviluppo" e non fa nulla

| Campo | |
|---|---|
| Area | `src/lab/app/Home.tsx` (`useCategories`) |
| Priorità | P1 (§7.7: famiglia implementata ma presentata come inesistente) |
| Sintomo | La tile mostra il badge "presto", `title="In sviluppo: non ancora disponibile"`, `aria-disabled`, `run: () => undefined`; la rail ha invece "Jello Lab · sperimentale" funzionante |
| Riproduzione | Primo avvio → Home → tile "Jello" (R, `audit/first-launch.mjs`) |
| Atteso | La tile apre il Jello lab, dichiarandolo sperimentale |
| Effettivo | Inerte, messaggio contraddittorio con Library, rail e Material Gallery |
| Causa | Residuo di M5/M6 prima dell'introduzione del Jello lab (M6.4) |
| Impatto | Utente: non capisce che Jello esiste e dove provarlo |
| Test | Da aggiungere (e2e) |

### M642-02 — Aree disabilitate al primo avvio senza spiegazione (Library, Jello β, …)

| Campo | |
|---|---|
| Area | `StudioNav.tsx` (rail), `Home.tsx` (`HomeCategories`) |
| Priorità | P1 (§10.3, §16: controllo importante nascosto senza percorso alternativo) |
| Sintomo | Senza progetto 7 pulsanti della rail su 10 sono `disabled`; il solo testo è il nome dell'area. Un `button[disabled]` non è focalizzabile né espone la ragione. La Home usa `aria-disabled` + `title` (che non è accessibile da tastiera/touch) |
| Riproduzione | Profilo vuoto → `/` (R) |
| Atteso | Ragione visibile ("Serve un progetto"), raggiungibile da tastiera, con un'azione per creare il progetto |
| Effettivo | Nessuna ragione visibile; Library e Jello β irraggiungibili finché non si crea un progetto |
| Causa | `disabled={it.id !== 'workspace' && !hasProject}` |
| Impatto | Utente |
| Test | Da aggiungere |

Nota di prodotto: Library e Jello lab dipendono da un progetto attivo (preferiti, copie sperimentali per progetto). Non si propone di renderli utilizzabili senza progetto, ma di dirlo.

### M642-03 — Il kit nuovo-progetto copia la configurazione diagnostica "Refraction Test" tra i materiali personali

| Campo | |
|---|---|
| Area | `src/lab/projects.ts` (`KIT_PRESETS`), `Flows.tsx` (wizard) |
| Priorità | P1 (§3.1: i preset diagnostici non sono materiali per designer; M6.4.1 li nasconde già da Library e Material Lab) |
| Sintomo | Ogni progetto creato con "Parti da un preset incluso"/Kit contiene una copia personale "Refraction Test"; la Library la mostra con la diagnostica **disattivata**, insieme a copie omonime di "Glass · Default/Frosted/Refractive" (stesso nome del preset incluso, distinte solo da "Personale"). Il wizard la propone come chip pre-selezionato |
| Riproduzione | `#startKit` → Library → "Tutti": 16 elementi, 4 copie personali (R, `audit/hyp.mjs`) |
| Atteso | Nessuna configurazione diagnostica creata automaticamente |
| Effettivo | `KIT_PRESETS = ['jello','satin','deep','optics']` |
| Causa | Elenco storico precedente a M6.4.1 |
| Impatto | Utente (contenuto fittizio salvato come materiale reale, §10.3) |
| Test | Da aggiungere (unit + e2e). I progetti esistenti non vengono modificati |

### M642-04 — La Material Gallery della Home presenta la diagnostica, omette 3 preset Solid e usa un vocabolario errato

| Campo | |
|---|---|
| Area | `Home.tsx` (`DemoGallery`) |
| Priorità | P1 |
| Sintomo | `slice(0, 6)` dei preset inclusi = Default, **Refraction Test**, Frosted, Refractive, Subtle, Solid·Matte. Sotto ogni nome: `glass · preset Jello` (id di famiglia grezzo + "Jello" usato per Glass/Solid). Testo: *"Jelly è un'ispirazione visiva del brand, il suo renderer è in sviluppo"* (falso dopo M6.4) |
| Riproduzione | Primo avvio (R) |
| Atteso | 8 preset non diagnostici, etichetta "Famiglia · trattamento" dal catalogo, nessuna affermazione errata su Jello |
| Causa | Codice precedente a M6.4/M6.4.1 |
| Impatto | Utente (terminologia fuorviante; §3.4, §8.5) |
| Test | Da aggiungere |

### M642-05 — Nel Jello lab e nel Builder compaiono i nomi tecnici "Jelly Soft" / "Prova Jelly"

| Campo | |
|---|---|
| Area | `JellyInspector.tsx:187,195,196`, `JellyPreview.tsx:94`, `JellyDiagnostics.tsx:40`, `Builder.tsx:787` |
| Priorità | P1 (§3.4, §8.5: stessa funzione, due nomi) |
| Sintomo | Elenco preset: "Jello · Soft". Inspector subito accanto: "Base: **Jelly Soft**", "Ripristina «Jelly Soft»", "Valori Jelly di base". Builder: "Prova Jelly · sperimentale" |
| Riproduzione | Jello β con il preset predefinito (R, `audit/jello-page.mjs`) |
| Atteso | Nome visualizzato del catalogo (`presetLabel`) ovunque; "Jello" nei testi rivolti all'utente; `jelly` solo come id tecnico |
| Causa | `base.doc.name` (nome tecnico persistito) usato al posto di `presetLabel(base.doc)` |
| Impatto | Utente. Il nome persistito **non** cambia |
| Test | Da aggiungere (e2e di vocabolario) |

### M642-06 — "Template e preset inclusi" (Home) elenca la configurazione diagnostica

P2 · `Home.tsx` modalità `tpl`: `library.filter(origin === 'builtin')` include "Refraction Test" (R). Atteso: come in Library, solo con la diagnostica attiva.

### M642-07 — Il contatore "Diagnostica" della Library è sempre 0

P2 · `StudioLibrary.tsx`: il badge conta `entries.filter(matchCategory)`, ma `entries` esclude per costruzione le voci diagnostiche, mentre la categoria mostra `diagnostics`. Con la diagnostica attiva: etichetta "Diagnostica 0" e 1 scheda (R).

### M642-08 — Filtro "Jello" nella Library: categorie non pertinenti

P2 · Con la famiglia Jello sono mostrate "Buttons 0", "Navigation 0", "Le mie creazioni 0", "Preferiti 0" (R). Le voci sperimentali non sono componenti, copie né preferiti: le categorie andrebbero nascoste.

### M642-09 — Due `<h1>` visibili al primo avvio

P2 · `HomeHero` ("Che cosa vuoi creare oggi?") e `HomeEmpty` ("Crea la tua prima componente") (R). Gerarchia dei titoli errata.

### M642-10 — `FamilyInfo.editor` non è letto da nessuno e dice `false` per Solid

P2 · `model/families.ts` (L, `grep`). Solid è modificabile nel Material Lab; il campo è codice morto fuorviante.

### M642-11 — Pulsanti della rail con `aria-pressed` e `aria-current`

P2 · `StudioNav.tsx:44`: sono link di navigazione, non toggle; `aria-pressed` annuncia "premuto" oltre a "pagina corrente".

### M642-12 — Campo "Raggio (px)" del Builder senza nome accessibile corretto

| Campo | |
|---|---|
| Area | `FieldControl.tsx` (`radius`) |
| Priorità | P1 (§10.6: label degli input) |
| Riproduzione | Builder → Button → Raggio = "Raggio in px" (R, `audit/radius.mjs`) |
| Atteso | Nome "Raggio, px" |
| Effettivo | `aria-labelledby="bf-layout-radius-px-label bf-layout-radius-px-unit"`: il primo id **non esiste**, il nome è solo "px" |
| Causa | La `<label>` passata a `NumberControl` non porta l'id `${id}-label` che `NumberControl` si aspetta |
| Test | Da aggiungere (e2e a11y) |

### M642-13 — Controlli numerici del Builder meno completi di quelli del Material Lab

P2 · `FieldControl.NumberControl`: messaggio d'errore generico "Valore non valido: non applicato." (senza intervallo), nessun reset per campo, nessuna freccia ↑/↓, `role="status"` montato dopo l'errore (non annunciato in modo affidabile). Il Material Lab (`ParamField`) ha tutto questo. Non si propone di unificare i due componenti in M6.4.2; si documenta e si migliora il messaggio.

### M642-14 — Ciclo di import `definition` ↔ `navbar-desktop` ↔ `navbar-structure`

P2 · Vedi §3. Rinviato: nessun malfunzionamento, rischio di refactor > beneficio.

### M642-15 — `raster.spec.ts` riscrive file tracciati

P2 · `verification/*.json` cambia `date` a ogni esecuzione completa: sporca il working tree. Registro volontario ("verificato in questo browser"), da aggiornare solo quando la suite raster passa.

### M642-16 — `CreateDialog` deduce "Glass" da "non è Solid"

P2 · `CreateDialog.tsx:72`: `family === 'solid' ? 'Solid' : 'Glass'` — il modello M6.4.1 vieta "tutto ciò che non è X è Y" (`familyLabel`).

## 5. Controlli che **non** hanno rilevato difetti (con evidenza)

| Controllo | Evidenza |
|---|---|
| Ogni parametro statico Glass abilitato (17 su 18) ha un effetto visibile sullo Stage | sonda pixel su `#stageMain` (SVG, scena griglia): 17/17 con >1 900 px cambiati; `radius` è disabilitato (con nota) quando la forma è capsula, quindi non sondato; i 6 parametri di movimento sono in `material-quality.md` |
| Ogni parametro statico Solid (10) ha un effetto visibile | stessa sonda: 10/10 (`foreground` 396 px, `borderColor` 374 px …). `duration` e `easing` sono di transizione (verificati in `material-quality.md`) |
| Catalogo coerente con i parametri | `validateCatalog()` vuoto; test `catalog.test.ts` verdi |
| Nessun overflow / nome mancante / id duplicato / errore console nei 7 viewport | sonda `areas.mjs` |
| Nessun import statico Jelly nel runtime produttivo | grafo import |
| Orfani Jello (componente eliminato) conservati e recuperabili | `reconcile.ts` + `jelly-integrity.test.ts` (classificazione `orphan`, mai cancellazione automatica) |

## 5.1 Dopo la baseline

Questo documento è la fotografia **iniziale** e non viene riscritto. Altri problemi sono emersi durante l'implementazione con lo stesso metodo (riproduzione prima della correzione): M642-17 (reset ai default generici invece che alla base), M642-18 (chunk lazy mancante → Studio vuoto), M642-19 (`createSceneView` memorizza una promessa rifiutata), M642-20 (scene Dark/Light/Gradient/Checker/Contrast bianche), più la mancanza di un «Ripristina il layout» (§4.1). Stato, correzioni e test di tutti: `issues-and-fixes.md`.

## 6. Limiti della baseline

- WebKit: NOT RUN (host).
- Nessun dispositivo fisico, nessun WebView Android: i progetti "mobile" sono emulazione desktop.
- Le misure di prestazioni sono in `performance.md`; non appartengono alla baseline di correttezza.
