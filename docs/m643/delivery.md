# M6.4.3 — Consegna: anatomia visiva di Jello e raffinamento dei preset

> **VISUAL APPROVAL PENDING.** Il completamento tecnico non è un'approvazione estetica. Nessun preset è stato promosso, nessun valore built-in è cambiato, `visuallyVerified` è `false` per tutti e quattro.

**Branch** `m643-jello-visual-refinement` · **baseline** `0582f65e6fc6f1a27778f7e33faf21e154749346` (`origin/main`, merge di M6.4.2) · working tree pulito all'inizio · nessun merge, nessuna PR.

## 1. Cosa è stato fatto

| Fase | Esito | Documento |
|---|---|---|
| A · baseline (codice, screenshot reali 4×8×3×5×DPR, motion, perf) | fatta; la baseline di motion coincide con M6.4.2 | `baseline.md` |
| B · anatomia, esperimenti sulle inclusioni | fatta; **opt-in** `treatment: 'm643'` | `visual-anatomy.md` |
| C · varianti A/B1/B2/B3 dei quattro preset | fatta, **solo come configurazioni diagnostiche** | `preset-experiments.md` |
| D · accoppiamento riflessi | **analizzata, nessun codice**: l'accoppiamento esiste già (residuo ≤ 0,22 px) | `motion-coupling.md` |
| E · review | preparata; **approvazione visiva in sospeso** | `visual-review.md` |
| F · verifica | eseguita | `verification.json`, `performance.md`, `compatibility.md` |
| G · consegna e readiness M6.5 | questo documento | `m65-visual-readiness.md` |

## 2. Modifiche al repository

Codice di prodotto (sperimentale, 2 file, +51/−8):
- `src/model/experimental/jelly-visual.ts`: `projectBubble(..., treatment = 'm642')`; con `'m643'` protezione dell'etichetta continua e attenuazione più mite.
- `src/runtime/experimental/jelly.ts`: opzioni `treatment` e `diagnosticBubbleParts` (non persistite); bolle `m643` = cerchio con gradiente tinto + arco di luce + mezzaluna speculare. Validazione atomica; nessun nodo/RAF/solver aggiuntivo.

Test e strumenti: `tests/unit/m643-visual.test.ts` (74 test), `tests/e2e/jelly-m643.spec.ts` (8 test × 2 motori), `tests/fixtures/jelly-m643/` (harness che usa il renderer reale con orologio iniettato + `variants.ts`), registrazione dello spec privato in `playwright.config.ts` (ignorato dalla suite principale) e `playwright.jelly.config.ts`. `docs/m643/tools/`: cattura matrici, timeline, metriche raster, metriche di moto, analisi di coupling, normalizzazione, performance, attribuzione listener, controllo di regressione.

**Non modificati:** schema, parser, descrittori, `familyVersion`, preset built-in, registro produttivo, `dist-lib` (runtime Glass/Solid: 202 194 B, identico), persistenza, Studio, Builder Trial.

## 3. Risultati

**Visivi** (`metrics-*.json`, 160×44 chiaro, A → B3): Dense luminanza corpo 0,590 → 0,494 (ora più pesante di Soft, 0,559), contrasto sul fondo 1,57 → 1,85; Candy contrasto bordo/centro 0,0035 → 0,039; Clear contrasto 1,29 → 1,34 e bolle visibili ×2,1; Soft invariato nel corpo, bordo +14 %, bolle volutamente più piccole. Etichetta: contrasto 5° percentile ≥ 4,81 in tutte le varianti B3 (idle). **Limiti onesti:** le bolle a 80×32 restano sotto la soglia di leggibilità in ogni variante; il gradiente tinto da solo *riduce* la visibilità delle bolle, la leva forte è parametrica; con tinta normalizzata Candy/Dense sono la coppia più simile nelle immagini ferme (5,9 su 255), Soft/Clear la più debole in A (6,1 → 9,2 con B3).

**Moto** (`motion-metrics.json`): Soft 0,0417 → 0,0485 di picco, swing 0,0027 → 0,0067 (0,29 px a 44 px: ancora sub-pixel), riposo 587 → 764 ms; Clear swing 0,0017, riposo 413 ms (ora meccanicamente distinto da Soft); Candy invariato; Dense picco 0,026, nessun rimbalzo, 90 % a 190 ms, riposo 433 ms. Sensibilità di Soft calcolata: neppure ζ = 0,40 supera 0,51 px. Anche il rimbalzo di Candy è 0,68 px: per tutta la famiglia l'elasticità percepita viene dalla compressione e dalla durata, non dall'oltrepassamento.

**Performance** (`performance.md`): +5 % per frame a 12 superfici, entro il rumore a 1 e 24, 0 RAF a riposo, nessun long task, nodi e listener costanti su 900 mount/unmount per variante, bundle sperimentale +2,3 kB. Il «+12 listener per fase» di M6.4.2 **non si riproduce** (renderer: 0 aggiunti nel moto; Studio con GC forzato: 0/0): non attribuito con certezza, non dichiarato «non-leak»; la crescita di heap a livello Studio resta non diagnosticata.

**Test** (dettaglio e caveat in `verification.json`): typecheck PASS; unit 850 passed (+74); build PASS; consumer 4 pacchetti × 16 esecuzioni OK; suite fixture privata 54 passed; **regressione visiva del rendering di default: 0 pixel diversi su 17 fogli**; **E2E completa locale 930 passed / 131 skipped / 1 failed**. WebKit **NOT RUN**.

## 4. Regressioni e flaky osservati

1. **E2E: 1 fallimento** — Firefox, `m642-control-effect.spec.ts:148` «glass … stiffness» (temporizzazione della molla di Glass, nessun Jello). Rieseguito in isolamento: intermittente **anche sulla baseline pristina** (2 riesecuzioni su 4 con un fallimento) e su questo branch (2 fallite, 1 mista, 2 passate). Flake preesistente; causa non diagnosticata. Non è mascherato: la suite completa non è «verde».
2. **Unit: 1 fallimento isolato** (`jelly-integrity`, «two tabs … resolution 3») in una delle prime esecuzioni; non riprodotto in 6 esecuzioni isolate, 3 complete e 12 sotto carico (baseline: 12/12 verdi). Causa non diagnosticata.
3. Durante la suite completa ho eseguito per pochi secondi un piccolo script di calcolo (Node, ~10 s): può aver contribuito al fallimento di (1); la riesecuzione isolata mostra comunque che il test è instabile da sé.

## 5. Rischi residui

- Nessuna review visiva indipendente; i giudizi sono dell'agente (`visual-review.md`).
- Stato premuto/hover, sfondi testo/struttura e lettore di schermo non misurati per il contrasto.
- Telefoni, Safari/WebView, GPU/paint, bundle di produzione servito: non misurati.
- Dimensione dei file: `docs/m643/screenshots/` ≈ 37 MB di PNG compressi senza perdita (potati rispetto alla matrice completa, rigenerabile con gli strumenti).
- L'opzione `treatment` è nuova superficie sperimentale pubblica nel pacchetto `dist-jelly`; il default non cambia.

## 6. Decisioni sul mantenimento dei preset

**Tutti e quattro i built-in restano com'erano** (A). I candidati B (B3; per Candy B1 = B3) sono documentati e riproducibili da `tests/fixtures/jelly-m643/variants.ts`, in attesa di review. Strategia di adozione proposta, senza schema né migrazione: `compatibility.md` §3.

## 7. Readiness per M6.4 → M6.5

Vedi `m65-visual-readiness.md`: nessun requisito è peggiorato; il n. 1 (qualità percettiva) resta `PARTIAL — VISUAL APPROVAL PENDING`, il n. 3 (performance) resta `PARTIAL` con diagnosi migliorata; 5 e 7 restano `BLOCKED` (schema e export, fuori ambito).

## 8. Come riprodurre

```bash
npm run dev -- --host 127.0.0.1 --port 4178         # server per l'harness
node docs/m643/tools/capture-matrix.mjs <outDir> --variants A,B1,B3 --dpr 1,2
node docs/m643/tools/analyze.mjs B3 <out.json>       # metriche raster
node docs/m643/tools/motion-metrics.mjs <out.json>   # metriche di moto
node docs/m643/tools/perf.mjs <out.json>             # A vs B3, RAF reale
node docs/m643/tools/regression-check.mjs            # default = baseline, pixel per pixel
npx playwright test -c playwright.jelly.config.ts    # suite fixture privata (include jelly-m643)
```
