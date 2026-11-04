# M6.4.3 — Compatibilità, confine sperimentale e politica di revisione dei preset

## 1. Contratti di §1.2 e §1.3: stato

| Contratto | Stato | Come lo so |
|---|---|---|
| `jello-material` v2, `family: "jelly"`, `familyVersion` 1, `schemaVersion` | **Invariati** | nessuna modifica a `src/model/experimental/jelly.ts` (parser, descrittori, versioni); `git diff --stat` tocca solo `jelly-visual.ts` (parametro opzionale), `runtime/experimental/jelly.ts` (opzioni di rendering) e due config di test |
| ID tecnici `jelly-soft/-clear/-candy/-dense` e nomi «Jelly …» / «Jello · …» | **Invariati** | `m643-visual.test.ts › built-ins are untouched` (valori frozen di tinta, seed, densità, opacità, movimento, spessore, edgeFalloff, roughness; nome; `visuallyVerified: false`; `A` = documento built-in `toEqual`) |
| Progetti `.jello`, archivio stabile IndexedDB, DB `jello-lab-experimental`, bozze, copie personali, revisioni/CAS, quarantena, export sperimentali | **Invariati** (nessun codice toccato) | suite `jelly-integrity` (70 test) + `jelly-studio`/`jelly-bridge`/`jelly-package`, E2E `jelly-studio.spec` |
| Persistenza: nessuna migrazione, nessun nuovo campo | **Nessuna modifica allo schema** | il trattamento `m643` è un'opzione di rendering **non persistita**; le varianti A/B vivono in `tests/fixtures/`, non nell'archivio |
| Glass e Solid | **Invariati** | `dist-lib/jello.js` (runtime produttivo) 202 194 byte, identico a M6.4.2; nessun file stabile modificato; E2E Glass/Solid nella suite completa |
| Jello resta `planned` e fuori dal registro produttivo, caricato lazy | **Invariato** | nessuna modifica a `FAMILIES`, registro, `runtime/materials`; `boundaries.test.ts`, `m642-resilience.spec`; il chunk `jelly-lab` resta dinamico |
| Un solo renderer per anteprima, laboratorio, Builder Trial e consumer | **Invariato** | la logica nuova è dentro `ExperimentalJellySurface`; nessun renderer fittizio, nessuna texture; il pacchetto `dist-jelly` la contiene |

**Regressione visiva del rendering di default:** il runtime modificato, con il trattamento di default, produce **0 pixel diversi** su 17 fogli della baseline (`regression-check.json`; tutti gli stati e le dimensioni 80×32/160×44/320×96, DPR 1 e 2 dove committati, Chromium). Quindi i documenti esistenti — storici, copie personali, bozze, link — **si vedono identici** a prima.

## 2. Superficie pubblica aggiunta (sperimentale)

`JellyRenderOptions.treatment?: 'm642' | 'm643'` e `diagnosticBubbleParts?: readonly ('gradient'|'rim'|'crescent')[]`, esportate dal pacchetto sperimentale (`dist-jelly`, +2,3 kB). Omessi = comportamento storico. Valori non validi → `update()`/costruttore **rifiutano atomicamente** (E2E «an invalid treatment is rejected atomically»: DOM invariato). Nessun consumer esistente deve cambiare. Il Jello Lab e il Builder Trial **non passano** il nuovo parametro: l'utente non vede il trattamento m643 finché una decisione non lo attiva.

## 3. Analisi dei contratti di revisione dei preset (§12.3) — nulla è stato applicato

Cosa ho verificato nel codice, e cosa ne segue se i valori dei built-in cambiassero **sul posto**:

| Elemento | Meccanismo reale | Effetto di un cambio in-place dei valori built-in |
|---|---|---|
| Copie personali (`jelly-materials`) | documento completo salvato (`personalJellyCopy`); `basePreset` è solo un'etichetta di origine («da Jello · Soft») | **nessuno**: la copia conserva i suoi valori |
| Bozza di un preset non modificato | `restore()` (`workbench.ts:177`): `base = presetDoc(draft.basePreset)` — **il preset corrente** — mentre `doc` è il documento della bozza | una bozza non toccata, salvata coi vecchi valori, verrebbe confrontata con la base nuova e apparirebbe **«modificata»** (`isJellyDirty`) senza che l'utente abbia fatto nulla |
| Selezione, confronto, anteprime catalogo, export | `presetDoc(id)` / `JELLY_CANDIDATE_PRESETS` (valori correnti) | mostrano e esportano i valori nuovi: è l'effetto voluto di una revisione |
| `meta.basedOn` | nome/ID di origine, nessun hash | nessuno |
| Revision hash (`materialRevision`, `templates.ts`) | esiste **solo per le famiglie stabili** (Glass/Solid); Jello non ne ha | non applicabile: rimarrebbe da introdurre per Jello se servisse distinguere revisioni (richiederebbe schema → evitato) |
| Etichetta «Jello · Soft» | mostrata solo se `doc.name === preset.name` (`presetLabel`) | resta valida finché il nome tecnico non cambia: **non va cambiato** |
| Link del Builder Trial | `jelly-links`: snapshot del documento (non segue il preset) | nessuno |

**Strategia meno invasiva proposta (non adottata, in attesa di approvazione visiva):**
1. Non toccare i built-in finché non c'è una review visiva indipendente (stato attuale: `visuallyVerified: false` per tutti, invariato).
2. All'approvazione: aggiornare i valori **mantenendo ID e nome tecnico**; conservare in codice uno snapshot immutabile «M6.4.2» (già coperto dal test dei valori frozen) usabile in laboratorio come «Baseline».
3. Per le bozze: una bozza il cui `doc` è *uguale* allo snapshot M6.4.2 del suo preset non è stata modificata dall'utente → ricollegarla al preset nuovo; una bozza diversa mantiene il proprio `doc` e viene mostrata «modificata» rispetto alla nuova base (nulla perso, nessuna sovrascrittura). Servono due test nuovi in `jelly-integrity`.
4. Nessun nuovo campo, nessuna migrazione, nessun hash: se si vuole tracciare la revisione, usare `meta.notes` (già libero) — è una scelta di M6.5.

## 4. Compatibilità dei motori e ambienti (§14.4)

Eseguiti: Chromium 156 e Firefox 157 (Studio e fixture; consumer in 16 esecuzioni). **WebKit: NOT RUN** (l'host non lo avvia, vedi memoria progetto). **Non verificati:** Safari iOS, Android WebView, telefoni reali. Il progetto `mobile-emulated` è emulazione di viewport/touch su Chromium desktop.

Fallback verificati: backend CSS e fallback opaco non disegnano inclusioni né pose, con o senza trattamento (E2E `CSS fallback and opaque fallback are unaffected`); `prefers-reduced-motion` → profilo statico (E2E). Nessun requisito WebGL2; nessun filtro nuovo (usati gli stessi `feGaussianBlur` esistenti, nessuna dipendenza nascosta nel percorso CSS).

## 5. Accessibilità (§14.1)

Automatizzato/misurato: contrasto etichetta-contro-pixel sotto l'etichetta (idle), min 4,81–6,20 per le quattro varianti B3 su 3 dimensioni × 3 sfondi (`preset-experiments.md`); focus visibile, tastiera, disabled, reduced motion/transparency, forced colors: coperti dalla suite esistente (`jelly-studio.spec`, `m642-a11y.spec`) rieseguita; il trattamento m643 non cambia nessun markup semantico. **Non misurati:** contrasto in stato premuto/hover, lettore di schermo, contrasto su sfondi `text` e `structured` per l'etichetta.
