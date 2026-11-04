# M6.4.3.A — Contratti e regressioni

Riferimenti: `docs/m643/compatibility.md` (contratti di M6.4.3), `docs/m642/` (qualità dei materiali). Qui: cosa questa milestone ha toccato, cosa no, e con quale prova.

## 1. Cosa è stato modificato

**Codice di prodotto (sperimentale, tutto sotto `src/lab/experimental/jelly/`):**

| File | Natura |
|---|---|
| `review/*` (9 file nuovi) | workspace; chunk lazy `ReviewWorkspace-*` |
| `JellyMain.tsx` | porta lazy verso il workspace (`import()`), dentro l'`ExperimentalBoundary` esistente |
| `JellyPreview.tsx` | prop opzionale `onOpenReview` e un pulsante; senza la prop il comportamento è identico |
| `JellyButton.tsx` | props opzionali `ariaLabel`, `renderExtra`; senza di esse il comportamento è identico |
| `bridge.ts` | metodi `press` e `hover` (additivi); `SurfaceLike.setPressed` accetta un punto opzionale |

**Test:** `tests/unit/m643a-review.test.ts` (67 test), `tests/e2e/jelly-review.spec.ts` (22 test per motore desktop + 1 per telefono emulato), **una voce aggiunta** all'elenco dei blocchi Studio importabili in `tests/unit/boundaries.test.ts` (`ExperimentalBoundary`): è la modifica a un contratto esistente, deliberata e motivata (riuso del boundary richiesto dal brief); l'invariante resta «pochi blocchi Studio, nessun runtime produttivo».

**Documentazione e strumenti:** `docs/m643a/**`, `docs/m643a/tools/*.mjs`.

**Non modificati:** `src/model/**` (schema `jello-material` v2, parser, descrittori, `familyVersion`, preset built-in, `jelly-presets.ts`, `jelly-visual.ts`, `jelly-motion.ts`), `src/runtime/**` (nessun file, nemmeno `runtime/experimental/jelly.ts`), registro e famiglie produttive, Studio fuori dall'area Jello, Builder Trial, esportazione, importazione, formato `.jello`, `playwright*.config.ts`, `vite*.config.ts`, `dist-lib`.

## 2. Contratti

| Contratto | Stato | Come lo so |
|---|---|---|
| Built-in `jelly-soft/-clear/-candy/-dense` invariati (valori, id, nome, seed) | **Invariati** | `git diff` vuoto su `jelly-presets.ts`/`jelly.ts`; `m643-visual.test.ts` («built-ins are untouched») e `m643a-review.test.ts` (A = documento built-in, mutare ogni variante non altera `JELLY_CANDIDATE_PRESETS`) |
| `visuallyVerified` | **`false`** per tutti | tipo letterale in `JellyCandidatePreset`; nessun codice lo scrive; ogni variante ha `approved: false`; il report ha `visuallyVerified: false`; test unitario |
| `jello-material` v2, `familyVersion`, ID tecnici, formato `.jello`, migrazioni | **Invariati** | nessuna modifica a `src/model/**`; nessun nuovo campo persistito |
| `m642` predefinito, `m643` opt-in | **Invariato** | `runtime/experimental/jelly.ts` non toccato; il Lab non passa `treatment`; solo il workspace lo passa, per le celle B1/B3 |
| Rendering storico a `treatment` omesso | **0 pixel diversi** | `docs/m643/tools/regression-check.mjs` → `regression-check.json`: 17 fogli confrontati con la baseline M6.4.2, 0 pixel diversi (tutti gli stati, 80×32/160×44/320×96, DPR 1 e 2 dove committati). Nessuna baseline è stata aggiornata |
| Glass e Solid | **Invariati** | `dist-lib/jello.js` 202 194 byte, identico a M6.4.2 e M6.4.3; nessun file stabile toccato; suite E2E completa (vedi `verification.json`) |
| Jello fuori dal registro produttivo; lazy | **Invariato** | `boundaries.test.ts` (avvio senza moduli Jello; Jello raggiungibile solo dalle porte `import()`); test unitario: solo `JellyMain.tsx` raggiunge `review/`, con `import()`; il codice di produzione non cita né `review` né `m643` |
| Le varianti diagnostiche non entrano nel catalogo | **Invariato** | nessun `src/` importa da `tests/` o da `fixtures/jelly-m643` (test); le varianti A/B nascono in memoria da `JELLY_CANDIDATE_PRESETS` |
| Un solo renderer | **Invariato** | le celle sono `JellyButton`/`JellyBridge`/`ExperimentalJellySurface`; nessuna texture, nessun renderer parallelo, nessun secondo solver (la timeline usa il clock iniettabile del coordinatore) |
| Nessuna scrittura su preset, materiali, bozze, libreria, progetti | **Verificato** | E2E «contracts»: snapshot di `localStorage` e di **ogni object store di ogni database IndexedDB** prima/dopo aver usato il workspace in tutti i modi: identici (eccetto la preferenza Base/Avanzata già esistente). Test unitario: i moduli `review/` non importano repository, workbench, storage, sessione, progetti |
| Archivio delle decisioni | **Separato** | chiave `jello-jelly-review-v1`, record versionato, lettore rigoroso (non ripara), un record illeggibile/più nuovo non viene sovrascritto senza una scelta esplicita |
| Avvio dello Studio | **Invariato** | il chunk del workspace non viene richiesto all'avvio né all'apertura del Jello Lab (E2E) |
| Error boundary sperimentali | **Funzionanti** | E2E: chunk non scaricabile → messaggio, Lab e Studio intatti, «Riprova» recupera; suite esistente `m642-resilience.spec` rieseguita |

## 3. Browser e ambienti

| Ambiente | Stato |
|---|---|
| Chromium 156 (Playwright) | eseguito: unit, E2E dedicati, suite completa, fixture privata, strumenti di misura |
| Firefox 157 (Playwright) | eseguito: E2E dedicati, suite completa, fixture privata (non gli strumenti di misura) |
| `mobile-emulated` (Pixel 7: viewport e touch emulati su Chromium) | eseguito: **emulazione**, non un telefono |
| **WebKit** | **NOT RUN**: l'host non riesce ad avviarlo (dipendenze di sistema), come in M6.4.3 |
| Safari iOS, Android WebView, dispositivi fisici | NOT TESTED |
| DPR 2 | applicato da Playwright (`deviceScaleFactor`) su Chromium e Firefox; il workspace mostra il DPR reale del browser e non lo emula |

## 4. Problemi preesistenti o noti, non introdotti qui

Ripresi da `audit-baseline.md` §4 e da `docs/m643/delivery.md` §4: flake intermittente Firefox `m642-control-effect.spec.ts:148` (molla di Glass), un fallimento isolato mai riprodotto di `jelly-integrity`, crescita di heap a livello Studio non diagnosticata, `main` locale obsoleto, avviso di chunk > 500 kB. Il risultato effettivo della suite completa di questa milestone è in `verification.json`.
