# Jello Studio · M6.4.2 — Studio & Material Quality Gate: consegna

Stato: **COMPLETATA, con limiti dichiarati** (vedi §12). Nessun push, merge o PR: tutto è in commit locali sul branch di lavoro.

## 1. Baseline effettivamente utilizzata

- `origin/main` = **`7692b4c3c4894707fc6b68e1be5365a446864769`** (*Merge pull request #3 — m641-material-library-integrity*): coincide con il commit del mandato. Il `main` **locale** era fermo a `3dd8bce` (2 PR indietro) ed è stato lasciato com'era; il branch di lavoro nasce da `origin/main` dopo un `git fetch`.
- Working tree pulito all'avvio. Il branch locale `m641-material-library-integrity` aveva **2 commit non pushati** (`095af87`, `6ce4dce`) con un fix reale (M642-00): sono stati portati sul branch di lavoro con `cherry-pick` (`a2d421f`, `a3b9be7`), non spostati né riscritti. **Per questo il branch di lavoro non è `origin/main` + solo M6.4.2**: contiene quei 2 commit.
- Baseline misurata su `origin/main` **puro**, prima di qualsiasi modifica: typecheck PASS · 766 unit PASS · build PASS · E2E locale **791 passati / 64 saltati / 0 falliti** (13,7 min) · 0 errori console in 7 viewport. Dettagli: `audit-baseline.md`.

## 2. Branch di lavoro e commit locali

`m642-studio-material-quality-gate` (da `origin/main`). Commit, dal più vecchio:

| Commit | Contenuto |
|---|---|
| `ce2f247` | Fase A: report di baseline e registro dei problemi |
| `a2d421f`, `a3b9be7` | **carry-over** dei commit locali di `m641` (M642-00) |
| `c62bcbd` | Fasi B–D: Home, rail, kit, Library, vocabolario Jello, accessibilità dei campi; test (control-effect, a11y, Studio) |
| `2c535d1` | Ripristino alla base nel Material Lab (M642-17) |
| `43ce36b` | Misure di risorse/lifecycle, test del Builder |
| `41f97c3`, `8364bf6`, `bd6838b`, `af58d15` | Fase F: matrice di screenshot, strumento di confronto, metriche di moto Jello; scene di prova (M642-20) |
| `7c35a07` | Confine d'errore delle aree sperimentali (M642-18), `createSceneView` (M642-19), verifica dei pacchetti Jello |
| `b0f82bb` | Ripristino del layout (M642-21), sweep tema chiaro/scuro e contrasto |
| `839ed68`, `09036f8` | Descrittori memoizzati (M642-22) e test drawer-aware; registro aggiornato |
| (finale) | questa documentazione e `verification.json` |

## 3–5. Problemi rilevati, corretti, rimasti

Registro completo con riproduzione, causa, correzione e test: **`issues-and-fixes.md`**.

- **P0: nessuno.** Nessuna perdita o corruzione di dati, nessun export rotto, nessun problema di sicurezza.
- **P1: 12 trovati, 12 corretti.** I più rilevanti: **M642-18** un chunk lazy di Jello non caricabile **svuotava l'intero Studio** (nessun error boundary); **M642-19** il runtime **pubblico** `createSceneView` ricordava per sempre una promessa rifiutata; **M642-20** cinque «Sfondo di prova» (Dark, Light, Gradient, Checker, Contrast) erano una pagina bianca per un errore di specificità CSS — scoperto dalla matrice di screenshot; **M642-17** il ↺ del Material Lab riportava ai default generici invece che alla base; **M642-03** ogni nuovo progetto riceveva la configurazione diagnostica «Refraction Test»; **M642-01/02/04/05** Jello presentato come «presto» e inerte nella Home, aree bloccate senza spiegazione, Gallery con terminologia sbagliata, «Jelly Soft» accanto a «Jello · Soft»; **M642-22** una regressione **introdotta da me** (M642-17) che cancellava il testo digitato: trovata dalla verifica finale completa, corretta con un test che fallisce senza la correzione.
- **P2: 11 trovati, 8 corretti, 1 parziale, 2 rinviati** (M642-14 ciclo di import; M642-15 `raster.spec` riscrive `verification/*.json`; M642-13: restano senza ripristino per campo / frecce i campi numerici del Builder).
- **Documentati, non difetti** (O-1…O-5 in `issues-and-fixes.md`): `finish: soft` quasi invisibile su fondi chiari, hover Solid sottile, Soft e Clear meccanicamente identici, copie del kit con lo stesso nome dei preset inclusi.

## 6. File modificati

28 file di `src/`, +292 −87 (elenco in `issues-and-fixes.md`, più `studio-preferences.ts` e `Settings.tsx` per il layout reset): nessuno schema, formato persistito o numero di versione toccato. Nuovi: `src/lab/app/ExperimentalBoundary.tsx`, `src/lab/material-base.ts`. Test nuovi: 5 spec E2E (`m642-studio` 16 test/progetto, `m642-control-effect` 33, `m642-a11y` 9, `m642-builder` 8, `m642-resilience` 3), 2 file unit (`m642-quality` 4, `scene-loader` 2) e 2 scenari (×2 repository) in `jelly-integrity` dal carry-over. Script nuovi: `m642-perf`, `m642-screenshots`, `m642-compare`, `m642-verify-jelly-package`, `m642-jello-motion-metrics`. `README.md`: 2 righe. `verification/*.json` **identici a `origin/main`** (l'E2E ne riscrive il campo `date`: M642-15; un commit intermedio l'aveva incluso per errore ed è stato ripristinato).

## 7. Decisioni architetturali

1. **Isolamento delle aree sperimentali con un confine d'errore e `retryableLazy`** — il guasto di un chunk resta dentro l'area; il retry funziona senza reload perché `Component` legge il lazy corrente al render. Verificato che i browser **non** memorizzano un `import()` fallito dello stesso URL (Chromium e Firefox).
2. **Un solo concetto di «base»** (`src/lab/material-base.ts`): preset incluso, o `meta.basedOn` per una copia; senza base, default di famiglia, dichiarato. Allinea il Material Lab al Jello lab. Descrittori memoizzati perché `NumberField` dipende dall'identità di `d`.
3. **Kit senza diagnostica**; i progetti esistenti non vengono toccati (nessuna migrazione, nessun formato cambiato).
4. **Nome visualizzato ≠ nome persistito**: `presetLabel()` per la UI, il documento resta «Jelly Soft».
5. **Nessun refactor generalizzato**: il ciclo di import e la divergenza dei campi del Builder restano, motivati.
6. **Nessuna modifica ai valori dei preset**: le proposte di tuning (Soft, Dense, bolle, Subtle) sono in `material-quality.md`, separate dai bug.
7. **Visual regression come processo, non come baseline automatica**: `m642-compare` non aggiorna nulla; la review è in `visual-review.md`.

## 8. Risultati dei test (verifica finale al commit `09036f8`)

| Passo | Esito |
|---|---|
| `git diff --check` | pulito |
| `npm run typecheck` | **PASS** (1,3 s) |
| `npm test` | **PASS — 39 file, 776 test** (baseline 766: +10) |
| `npm run build` (+ `build:lib`, `build:jelly`) | **PASS**; 1 avviso Vite (chunk Studio 628,9 kB) |
| `npm run test:e2e:local` | **PASS — 931 passati · 131 saltati · 0 falliti · 0 instabili** (16,2 min). chromium 354/0 skip · firefox 308/46 skip · mobile-emulated 269/85 skip |
| consumer React, Vanilla, esempio navbar | PASS (nei 931; costruiti dai server dell'E2E) |
| consumer Jello (`m642-verify-jelly-package.mjs`) | **PASS — 4 pacchetti × 2 motori × 2 preferenze di movimento = 16 esecuzioni** |
| WebKit | **NOT RUN** — host senza dipendenze; `sudo npx playwright install-deps webkit && npx playwright test --project=webkit` |

Gli skip (131) sono tutti motivati nel codice; l'aumento da 64 è dovuto a specifiche nuove che dichiarano di girare una volta su Chromium (`browser-compatibility.md`). Una **prima** esecuzione completa su una versione intermedia aveva dato 7 fallimenti su `mobile-emulated` (6 miei test non adattati al cassetto dei telefoni + 1 test esistente instabile): il secondo era un difetto reale (M642-22) e li ho corretti tutti; un'esecuzione ancora precedente, interrotta, aveva 4 fallimenti che passavano da isolati (ipotesi: carico del mio lavoro concorrente e un rebuild di `dist/` a metà run; **non dimostrata**). La verifica finale è stata fatta **senza attività concorrenti**.

## 9. Confronti visuali

102 immagini, baseline = build di `origin/main`: **47 identiche · 55 cambiate**. Tutte le 55 sono giudicate in `visual-review.md`: i materiali Glass su testo/foto/uniforme e i componenti Glass sono **identici** (nessuna regressione del renderer); le scene Dark/Light/Gradient/Checker/Contrast cambiano al 96–98 % perché prima erano bianche (correzione); gli schermi Studio cambiano dove la UI è stata corretta.

## 10. Prestazioni

`performance.md`, `perf-results.json`. **Misurato** (headless, i7-10510U): 0 RAF a riposo in Home, Material Lab Glass/Solid, Jello (anche dopo il rimbalzo e con il puntatore tenuto), Library; Jello ≈ 0,3 ms di script/frame, 37 frame ≈ 0,6 s di moto, nessun long task; 252 cambi di area: nodi 3 319 → 3 319, listener 532 → 532. **Dedotto/non diagnosticato:** heap +2 MB sublineare su quei 252 cambi; +12 listener per fase di moto Jello. **Non misurato:** GPU, paint, telefoni.

## 11. Compatibilità verificata

`jello-material` v2, `jello-component-definition` v1, `.jello`, ID e revisioni dei preset, collegamenti, IndexedDB stabile e `jello-lab-experimental`, copie, preferiti, bozze, package React/Vanilla, API del runtime: **invariati** (`persistence-integrity.md` §5). Unica modifica al runtime pubblico: `createSceneView` ritenta dopo un caricamento fallito (nessuna firma cambiata). `git diff origin/main -- src/model src/components src/project src/migration` → solo `families.ts` (campo informativo).

## 12. Rischi residui e limiti

- WebKit, Safari/iOS, Android WebView, telefoni reali: **non verificati**.
- Accessibilità: solo controlli automatici e sonde; **checklist manuale non eseguita** (`accessibility.md` §4). Nessuna dichiarazione di conformità WCAG.
- Qualità percettiva dei materiali: giudizio da immagini, **non** una review di designer; i preset Jello restano «candidati non approvati».
- Damping e stretch di Glass non verificati singolarmente in E2E.
- Parità raster Stage ↔ consumer **non misurata per Jello** (solo comportamento).
- Nessuna sessione con utenti.
- Un test e2e che elimini un componente reale legato a una prova Jello non esiste (la classificazione `orphan` è provata a livello di unità).
- Il codice di M642-17…22 è nuovo: i test passano su 3 progetti, ma la superficie toccata è l'Inspector, usato ovunque; una regressione sfuggita sarebbe stata trovata dalla suite solo se coperta (M642-22 lo dimostra).

## 13. Indicazioni per M6.5

`jello-m65-readiness.md` (classificazione READY/PARTIAL/BLOCKED/NOT TESTED di 12 requisiti e criteri di promozione proposti). In sintesi: **READY** fisica deterministica, isolamento, dichiarazioni = capacità; **PARTIAL** qualità percettiva (serve un designer), prestazioni (serve un telefono), browser, Builder, migrazione dei dati; **BLOCKED** integrazione nel documento canonico ed export React/Vanilla (nessun adapter contiene Jello, per scelta di questa milestone).

## 14. Stato del branch e proposta di PR

Branch `m642-studio-material-quality-gate`, **15 commit locali** sopra `origin/main`, non pushato, nessuna PR aperta. *Proposta di PR (da non creare senza autorizzazione):* titolo «M6.4.2 — Studio & Material Quality Gate»; descrizione = §3–§5 e §12 di questo file; avvertenza per chi rivede: il branch include i 2 commit di `m641` (M642-00) e **aggiunge 13 MB di screenshot** in `docs/m642/screenshots/` (già nella consuetudine del repository: `docs/screenshots` è 19 MB).

## 15. Indice dei documenti

`audit-baseline.md` · `issues-and-fixes.md` · `material-quality.md` · `catalog-validation.md` · `studio-ux-review.md` · `builder-validation.md` · `persistence-integrity.md` · `export-consumer-parity.md` · `performance.md` · `accessibility.md` · `browser-compatibility.md` · `visual-review.md` · `jello-m65-readiness.md` · `verification.json` · `perf-results.json` · `package-verification.json` · `jello-motion-metrics.json` · `visual-diff.json` · `screenshots/` · `tools/`.
