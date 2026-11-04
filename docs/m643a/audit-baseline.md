# M6.4.3.A — Audit della baseline

Eseguito **prima** di modificare qualsiasi file. Tutto ciò che segue è stato letto o eseguito su questa macchina (Fedora, Node, Chromium/Firefox di Playwright); niente è dedotto dai documenti M6.4.3.

## 1. Stato del repository

| Voce | Valore |
|---|---|
| Branch di partenza | `m643-jello-visual-refinement` |
| Commit HEAD (= commit iniziale della milestone) | `a5d844f3024b0ddf84c78a8cadb62c6b357332e4` |
| Branch di lavoro | `m643a-visual-acceptance` (creato da HEAD, locale; nessun push) |
| Working tree | pulito (`git status --short` vuoto) |
| `main` locale | **obsoleto** (precede il merge della PR #4); il confronto è stato fatto con `origin/main` |
| Differenza rispetto a `origin/main` (`m643` rispetto a M6.4.2) | in `src/`: **solo** `src/model/experimental/jelly-visual.ts` e `src/runtime/experimental/jelly.ts`; il resto sono docs/test/fixture/config M6.4.3 |

## 2. Contratti verificati sul codice

| Controllo | Esito | Come |
|---|---|---|
| Quattro preset esistono (`jelly-soft/-clear/-candy/-dense`) | OK | `src/model/experimental/jelly-presets.ts` |
| Built-in invariati rispetto a M6.4.2 | OK | `git diff origin/main -- jelly-presets.ts jelly.ts` è vuoto; il test «built-ins are untouched» (`m643-visual.test.ts`) passa |
| `visuallyVerified` è `false` per tutti | OK | tipo letterale `false` in `JellyCandidatePreset`; nessun altro punto di `src/` lo scrive |
| `m642` è il trattamento predefinito | OK | `projectBubble(..., treatment = 'm642')` e `this.options.treatment ?? 'm642'` |
| `m643` è opt-in | OK | nessun file del lab (`src/lab/**`) passa `treatment`; l'unico uso è nel renderer e nel modello |
| Varianti diagnostiche non nel catalogo produttivo | OK | `grep tests/fixtures src` e `grep jelly-m643 src` vuoti; `variants.ts` è importato solo da `tests/` |
| Schema `jello-material` v2 / `familyVersion` | invariati | nessuna differenza in `jelly.ts` |
| Caricamento lazy | OK | `App.tsx:28` `retryableLazy(() => import('../experimental/jelly/JellyMain'))`, chunk `JellyMain-*.js` separato nel build |
| Jello fuori dal registro produttivo | OK | nessuna differenza in `src/runtime/index.ts`, `src/runtime/materials` |

## 3. Verifiche eseguite

| Comando | Esito |
|---|---|
| `npm run typecheck` | **PASS** (exit 0) |
| `npm test` | **PASS** — 40 file, **850 test** passati, 0 falliti |
| `npm run build` | **PASS** (exit 0). Avviso preesistente: chunk `lab-*.js` 629 kB > 500 kB (non legato a Jello; chunk `JellyMain` 45,4 kB, `jelly-lab` 67,4 kB, entrambi lazy) |
| E2E Studio Jello, Chromium + Firefox: `jelly-studio.spec.ts` + `m642-resilience.spec.ts` | **PASS** — 40/40 (non è la suite completa) |
| Suite E2E completa, suite privata `jelly-m643`, visual regression pixel, WebKit | **NON eseguite in questa fase** (la suite completa si esegue a fine milestone, senza lavoro concorrente). WebKit: vedi §5 |

## 4. Problemi preesistenti (non introdotti da M6.4.3.A)

Ripresi da `docs/m643/delivery.md` §4, non riverificati qui:

1. E2E Firefox `m642-control-effect.spec.ts:148` («glass … stiffness»): intermittente su baseline pristina e su questo branch. Non lo tocco.
2. Unit `jelly-integrity` «two tabs … resolution 3»: un fallimento isolato mai riprodotto; oggi 850/850.
3. Crescita di heap a livello Studio durante cicli Jello: non diagnosticata.
4. Il chunk `lab` > 500 kB: avviso di build preesistente.
5. `main` locale obsoleto (memoria di progetto): irrilevante per il lavoro, da allineare dall'utente.

## 5. Limiti dell'ambiente

- **WebKit non è avviabile su questo host** (dipendenze di sistema): sarà dichiarato `NOT RUN`.
- DPR 2 è emulato da Playwright (`deviceScaleFactor`) su Chromium/Firefox desktop; nessun dispositivo fisico.
- `mobile-emulated` = viewport e touch emulati su Chromium.

## 6. Conclusione

La baseline è sana: nessun difetto da correggere prima di costruire il workspace. Le uniche note aperte sono preesistenti (§4) e restano fuori ambito.
