# M6.4.3 — Fase A: baseline visiva, comportamentale e tecnica

**Branch** `m643-jello-visual-refinement` · **SHA iniziale** `0582f65e6fc6f1a27778f7e33faf21e154749346` (`origin/main`, merge della PR #4 di M6.4.2; albero identico a `m642-studio-material-quality-gate` @ `5924662`). Working tree pulito all'avvio. Il `main` locale era obsoleto (`3dd8bce`): il branch è stato creato da `origin/main` dopo `git fetch`. Nessun push, merge, PR.

Ambiente: Fedora 44, kernel 7.2.13, Intel Core i7-10510U, Chromium 156 e Firefox 157 headless, Node ≥ 20. **WebKit: NOT RUN** (l'host non lo lancia).

## 1. Baseline tecnica (registrata prima di qualsiasi modifica)

| Comando | Esito |
|---|---|
| `npm ci` | OK |
| `npm run typecheck` | PASS |
| `npm test` | **776 passed** |
| `npm run build` (include `build:lib`, `build:jelly`) | PASS |
| E2E pertinenti, Chromium + Firefox: `jelly-studio.spec.ts`, `m642-resilience.spec.ts` | **40 passed** (1,2 min) |

Il riferimento completo di M6.4.2 (E2E 931 passed / 131 skipped / 0 failed) non è stato rieseguito alla baseline; la suite completa è eseguita una volta sul risultato finale (`verification.json`).

## 2. Mappa dell'architettura esaminata

Letti per intero: `src/model/experimental/{jelly,jelly-presets,jelly-visual,jelly-motion}.ts`, `src/runtime/experimental/{jelly.ts,jelly.css,jelly-scheduler.ts,jelly-input.ts}`, `src/lab/experimental/jelly/{workbench,repository,JellyPreview,BuilderTrial,…}`, `docs/m642/{material-quality,jello-m65-readiness,performance}.md`, gli script `scripts/jelly-*`, `scripts/m642-*`, la fixture `tests/fixtures/jelly/`.

- **Un solo renderer** (`ExperimentalJellySurface`): SVG con 10 gradienti, clip, ombra filtrata. Gli strati di §3.1 esistono già: corpo (`base`+`core`), bordo (`rimPath` + `poolPath`, `rimWidth`/`edgeStop` da `jellyOptics`), inclusioni (`bubbles`), pelle (`highlight`, `glossPath`, `gleam`, `caustic`), risposta elastica (`renderMotion`).
- **Geometria condivisa**: `surfacePoint()` è l'unica mappa di deformazione; contorno, rim, pool, core, gloss, gleam, caustic, **centro del riflesso morbido** e centri delle bolle passano tutti da lì (`runtime/experimental/jelly.ts`, `renderMotion`). Il moto ha **un solo** oscillatore (`jelly-motion.ts`) e un solo RAF condiviso (`jelly-scheduler.ts`).
- **Preset**: costanti di codice (`JELLY_CANDIDATE_PRESETS`, `visuallyVerified: false`). Le copie personali sono documenti completi, quindi **non seguono** modifiche dei built-in; seguono invece i built-in il ripristino ai valori-base, il confronto e le bozze con `basePreset` (`workbench.ts:183`, `presetDoc`). Vedi `compatibility.md` §3.
- Nomi: il documento memorizza «Jelly Soft…»; il catalogo mostra «Jello · Soft…» (`presetLabel`, `presetDisplayName`).

## 3. Baseline visiva

Strumento nuovo e riproducibile: `tests/fixtures/jelly-m643/` + `tools/capture-matrix.mjs`. **Ogni cella è l'`ExperimentalJellySurface` reale** pilotata da un orologio iniettato (nessun RAF nativo, nessun renderer alternativo, nessuna texture). Matrice: 4 preset × 8 stati (idle, hover, press, hold, release, rebound, rest, disabled) × 3 dimensioni (80×32, 160×44, 320×96) × 5 sfondi (chiaro, scuro, gradiente, testo, struttura locale a strisce) × DPR 1 e 2. Il rebound è campionato al picco dell'escursione opposta calcolata dallo stesso oscillatore; per i preset senza rimbalzo misurabile (Dense, e di fatto Soft/Clear) si usa un punto fisso (140 ms) sul ritorno.

File committati in `screenshots/baseline/` (tutte le dimensioni × sfondi a DPR 1; DPR 2 per 80×32 e 160×44 su chiaro/scuro/gradiente, per contenere il peso del repository: gli altri si rigenerano con lo strumento). `manifest.json` ne registra gli hash.

**Cosa mostra la baseline** (ispezione delle immagini + `metrics-A.json`):

| Osservazione | Misura |
|---|---|
| Le bolle sono quasi invisibili a dimensione UI | pixel del Button che cambiano per effetto delle bolle: **10 px su 2 560** (Soft 80×32), 81 px (160×44), 258 px (320×96) |
| **Dense non è più corposo di Soft** | luminanza media del corpo 0,590 vs 0,560 a 160×44 chiaro; contrasto del corpo sullo sfondo 1,57 vs 1,65 |
| Clear è debole su sfondo chiaro | contrasto corpo/sfondo **1,29** (il più basso) |
| **Candy non ha profondità di bordo** | contrasto bordo/centro 0,0035 (Soft 0,046, Dense 0,078): il rosa è uniforme |
| Testo | contrasto del colore etichetta contro i pixel sotto l'etichetta, 5° percentile: 6,3–12,4 su chiaro; **minimo su tutte le combinazioni 4,54 (Candy, scuro)** |

## 4. Baseline comportamentale

`tools/motion-metrics.mjs` (oscillatore del modello, griglia 1 ms, pressione 0 → hold 600 ms → rilascio → 3 s): **i valori di A coincidono esattamente con `docs/m642/jello-motion-metrics.json`** (picco, swing e tempo a riposo per i quattro preset; verificato con `diff`).

| Preset | Response | ζ | Max def. | Impulso | Picco press | Swing rilascio | Riposo |
|---|---:|---:|---:|---:|---:|---:|---:|
| Soft | 360 | 0,65 | 0,060 | 0,15 | 0,0417 | 0,0027 | 587 ms |
| Clear | 360 | 0,65 | 0,060 | 0,15 | 0,0417 | 0,0027 | 587 ms |
| Candy | 360 | 0,40 | 0,090 | 0,15 | 0,0733 | 0,0155 | 927 ms |
| Dense | 220 | 1,05 | 0,035 | 0,05 | 0,0227 | 0 | 330 ms |

## 5. Baseline di performance (renderer isolato, A)

Vedi `performance.md`. Sintesi: 0 RAF a riposo, ≈ 0,1 ms/superficie/frame durante il moto, nessun long task, nodi costanti.

## 6. Limiti identificati (da cui nascono gli esperimenti)

1. Bolle poco visibili a dimensione UI (non per quantità, per contrasto e dimensione).
2. Dense indistinguibile da Soft per corpo/bordo.
3. Candy privo di profondità di bordo; Clear con corpo debole su fondo chiaro.
4. Soft e Clear meccanicamente identici.
5. Protezione dell'area testo come scalino brusco (`central = 0,38` dentro un rettangolo): una bolla attraversa il bordo della banda con un salto di opacità del 62 %.
6. Il coupling riflessi↔deformazione **esiste già** (§2): da verificare, non da costruire.
