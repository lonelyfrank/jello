# Consegna M6.4 — integrazione sperimentale di Jelly nello Studio

3 novembre 2026, Europe/Rome. Branch `m64-jelly-studio`, creato da `m6h-hardening` (HEAD `3100bed`, albero
pulito). **M6.H non è su `main`**: la PR #2 (`m6h-hardening` → `main`) è aperta; la baseline è quel branch,
nessun merge e nessun push. Nessun `AGENTS.md`. Nessuna nuova dipendenza, nessun servizio cloud.
Architettura, persistenza, export e limiti in dettaglio: [jelly-m64-studio.md](jelly-m64-studio.md).

**Stato: COMPLETE — Experimental Integration Verified, entro il perimetro dichiarato sotto.** Jelly **non** è
pronto per la promozione al runtime ufficiale: vedi «Decisione».

## Implementazione

**Moduli aggiunti**

| Percorso | Ruolo |
| --- | --- |
| `src/lab/experimental/jelly/` | bridge, modello dell'Inspector, workbench, repository, preview-model, package/export, UI React, CSS |
| `src/runtime/experimental/index.ts` | entry del bundle sperimentale: solo re-export dei moduli che la preview esegue |
| `src/lab/app/BuilderJellyTrial.tsx` | seconda e ultima porta (con `App.tsx`) verso Jelly, solo con `import()` |
| `vite.jelly.config.ts`, `scripts/finalize-jelly.mjs` | build separata `dist-jelly` (`npm run build:jelly`) |
| `scripts/prepare-jelly-consumer.mjs` | spacchetta i pacchetti per un consumer (`npm run jelly-consumer:prepare`) |
| `scripts/jelly-studio-perf.mjs`, `scripts/jelly-studio-evidence.mjs` | misure e schermate riproducibili |
| `tests/unit/jelly-{studio,bridge,package}.test.ts`, `tests/e2e/jelly-studio.spec.ts` | test M6.4 |

**File esistenti modificati** (tutti additivi): `App.tsx` (area Jelly lazy, header, footer), `StudioNav.tsx` (voce
«Jelly β»), `ui.tsx` (icona), `studio-preferences.ts` (area `jelly`), `Builder.tsx` (3 righe nell'Inspector del
Button), `vite.config.ts` (plugin generalizzato per servire anche `/runtime-jelly/`), `package.json`,
`scripts/e2e-servers.mjs` (build di `dist-jelly`), `.gitignore`, `tests/unit/boundaries.test.ts`.
`examples/react-consumer/package-lock.json` risulta modificato dalle esecuzioni E2E (rigenerato dalla preparazione del consumer),
non da M6.4: non è incluso nel commit.

**Non toccati:** `src/model/experimental/*`, `src/runtime/experimental/{jelly,jelly-input,jelly-scheduler}.ts` e `jelly.css`
(motore M6.3), `FamilyId`, `MaterialDocument`, registry, runtime produttivo, repository/autosave stabili, formati
`.jello`, export Glass/Solid.

**Funzioni implementate** (checklist §15): area sperimentale «Jelly β» nello Studio · renderer M6.3 reale · 33 controlli
generati da `JELLY_PARAMS` (Base/Avanzato, solo presentazione) · slider, valore, unità, ripristino, descrizione, validazione e
messaggi relazionali comprensibili senza correzioni silenziose · stati di aspetto per stato · quattro preset candidati con
confronto affiancato · seed deterministico (cambia solo con «Nuovo seed casuale») · fisica e interazioni reali (puntatore,
Space, Enter, cancel, leave, disabled, attivo, focus) senza click sintetici · fallback e diagnostica a 10 Hz fuori da React ·
salvataggio atomico in un database separato con bozza ripristinabile · import/export del documento · prova nel Button del
Builder · export web sperimentale con consumer verificato · boundary test aggiornati.

**Rimandato (non segnato come fatto):** applicare Jelly alla *canvas* del Builder o esportarlo con il componente (richiede un
riferimento nuovo in `material`, vietato senza piano di migrazione); WebGL2 Jelly; Android; tipi TypeScript nel pacchetto;
purge automatico degli orfani; misura con dodici superfici *dentro* lo Studio.

## Verifica tecnica

| Controllo | Esito |
| --- | --- |
| `npm run typecheck` (e `tsc` nella build) | Superato |
| `npm test` | **664/664**, 35 file; di cui 47 test nuovi in 3 file (`jelly-studio` 27, `jelly-bridge` 13, `jelly-package` 7) e i boundary test riscritti |
| Boundary test | Superati (25): avvio dello Studio senza Jelly nel grafo statico; due sole porte con `import()`; moduli sperimentali con import diretti ammessi; produzione/export/repository stabili senza riferimenti; `dist-lib` senza Jelly; renderer Jelly in chunk lazy nella build |
| `npm run build` | Superato (lib, runtime Jelly, tipi, Studio). Avviso preesistente: chunk Studio >500 kB. Chunk Jelly separati: `jelly-lab` 56.7 kB, `JellyMain` 36.2 kB, `BuilderTrial` 4.6 kB (gzip 19 / 12 / 2 kB) |
| `dist-lib` (libreria produttiva) | Hash di `jello.js` e `jello.css` **identici** prima e dopo la build con M6.4 |
| E2E Jelly (`jelly-studio.spec.ts`) | 17 test × 3 progetti: **47 passati**, 4 saltati con motivo (tastiera hardware e download/consumer su telefono emulato) |
| E2E suite completa locale (Chromium + Firefox + mobile emulato) | **776 passati, 0 falliti, 0 flaky, 64 saltati** (13.6 min; i salti sono dichiarati nei singoli test per progetto) |
| Consumer esterno | Il test esporta dallo Studio, spacchetta, serve da una pagina indipendente e verifica rendering SVG, pressione (x>0.02), un solo click nativo, teardown a zero decorazioni e nessun errore di console. Manifest e SHA-256 verificati; runtime del pacchetto = runtime servito dallo Studio |
| WebKit | **Non eseguito** (dipendenze di sistema mancanti sull'host: ogni test fallirebbe all'avvio) |
| Android / dispositivi reali / Safari | **Non eseguiti** |

Una regressione trovata da un primo run completo (773 passati, 3 falliti) e corretta prima dell'ultimo run: l'Inspector del Button aveva una settima sezione e
`studio-completion.spec.ts` (6 sezioni di modifica) falliva su tre progetti. Il test non è stato toccato: la prova Jelly è
ora una sottosezione di «Materiale».

### Prestazioni (build di produzione, headless, un run per scenario: osservazioni, non soglie)

[performance.json](screenshots/jelly-m64/performance.json), script [jelly-studio-perf.mjs](../scripts/jelly-studio-perf.mjs). Linux, Intel i7-10510U,
Chromium 156.0.8078.4, Firefox 157.0, 1400×900, DPR 1. «RAF» = tick del coordinatore del renderer.

| Scenario | RAF Chromium / Firefox | Nodi SVG | Chromium: task · script · layout (s) |
| --- | --- | --- | --- |
| Una superficie, fermo 1.5 s | 0 / 0 | 66 → 66 | 0.011 · 0.001 · 0 |
| Una pressione 450 ms + rilascio fino a riposo | 63 / 64 | 66 → 66 | 0.082 · 0.021 · 0.003 |
| 20 pressioni ripetute (60 ms) | 130 / 165 | 66 → 66 | 0.267 · 0.061 · 0.013 |
| 60 modifiche rapide di parametro | 0 / 0 | 66 → 66 | 0.319 · 0.199 · 0.032 |
| 20 cambi di dimensione/zoom | 0 / 0 | 66 → 66 | 0.191 · 0.071 · 0.017 |
| Confronto, 4 superfici, fermo | n/d | 258 → 258 | 0.011 · 0.001 · 0 |
| Confronto, pressione su ciascuna | n/d | 258 → 258 | 0.240 · 0.044 · 0.009 |
| 10 cambi workspace Jelly ↔ Materiali | 0 / 0 | 66 → 66 | 0.521 · 0.127 · 0.092 |
| Anteprima nascosta, 1.5 s | **0 / 0** | 51 → 51 | 0.014 · 0.002 · 0 |

Lettura: nessun RAF a riposo, con anteprima nascosta o dopo il cambio workspace; nessuna creazione continua di nodi SVG;
posizioni delle bolle invariate al cambio di livello Base/Avanzato e di dimensione (test E2E). Intervalli RAF p95 ≈ 16.7–17.2 ms in entrambi i browser;
unica eccezione, Firefox nei 10 cambi workspace (p95 33.2 ms, un frame lungo: causa non isolata). Heap Chromium 8–18 MB senza GC forzato,
indicativo. **Non misurato:** dodici superfici dentro lo Studio (la UI ne mostra al massimo quattro; il caso a dodici resta quello
della fixture M6.3, stesso renderer: Firefox lì mostrava intervalli RAF più lunghi); heap/GC controllato; paint/GPU; hardware reale.

### Compatibilità browser

Chromium 156 e Firefox 157: E2E Jelly e suite completa. Telefono: emulazione Pixel 7 su Chromium, non un dispositivo.
WebKit/Safari e Android: non eseguiti.

## Verifica visuale

Schermate reali dal Studio costruito, Chromium e Firefox, in [docs/screenshots/jelly-m64/](screenshots/jelly-m64/) con
[evidence.json](screenshots/jelly-m64/evidence.json) (stato e solver nell'istante di ogni scatto). Le ho guardate una per una.

| Richiesta | File |
| --- | --- |
| Jelly Lab desktop / mobile | `chromium-lab-desktop.png`, `firefox-lab-desktop.png` · `mobile-emulated-lab.png`, `mobile-emulated-drawer.png` |
| Inspector Appearance / Bubbles / Motion | `*-inspector-appearance.png`, `*-inspector-bubbles.png`, `*-inspector-motion.png` |
| Button idle / premuto / rimbalzo | `*-button-idle.png`, `*-button-pressed.png`, `*-button-rebound.png` |
| Soft / Candy / Clear / Dense | `*-compare.png`, `*-compare-gradient.png`, `*-compare-dark.png` |
| CSS fallback / opaco | `*-css-fallback.png`, `*-opaque-fallback.png` |
| Reduced motion / forced colors | `*-reduced-motion(.png, -lab.png)`, `*-forced-colors(.png, -lab.png)` |

**Fisica (Candy, grande, zoom 200%, Chromium):** a riposo x=0; premuto x=0.0594 con target 0.0585 (corpo più basso e più largo,
bolle e riflessi che seguono il corpo, testo e icona fermi); a ~90 ms dal rilascio x=−0.0153, v<0: il corpo è leggermente più alto
del riposo. Firefox: 0.0594 / −0.0150, stesso aspetto. L'estensione sotto zero è piccola: il ritorno elastico è leggibile ma
discreto, come già annotato in M6.3. Il feedback di colore del pressed resta più evidente della deformazione.
**SVG vs CSS:** il CSS mantiene colore, bordo, riflesso e ombra ma perde bolle e deformazione e ha un gradiente più piatto;
resta leggibile e con lo stesso contenuto. **Forced colors:** contorno di sistema, nessuna decorazione. **Reduced motion:** SVG
mostrato, moto statico.

**Problemi visti e corretti durante la verifica:** (1) nell'Inspector (324 px) lo slider si riduceva a un puntino quando l'unità era
lunga e il pulsante «Nuovo seed casuale» si schiacciava sull'input → slider su riga intera, unità troncata, campo seed più largo (CSS
limitato a Jelly); (2) confronto a zoom 200% con Button sovrapposti → zoom disattivato nel confronto, griglia 2×2/4 adattiva;
(3) nota sperimentale spezzata su due colonne; (4) readout «Non montato» durante il confronto.
**Problemi che restano:** su telefono la toolbar della preview occupa molto spazio verticale e, con il drawer aperto (48% come nel resto
dello Studio), il Button è in parte coperto; Soft su sfondo chiaro ha poco contrasto del corpo (limite ottico M6.2 noto); Dense e Clear
restano giudizi visivi circoscritti e non approvano i preset.

## Compatibilità

| Area | Esito |
| --- | --- |
| Progetti esistenti | Nessuna migrazione, nessun cambio di formato; suite E2E dei progetti (isolamento, import/export, eliminazione, M6.H) nel run completo |
| Glass / Solid | Nessun file di runtime o export toccato; `dist-lib` identico; E2E Glass/Solid nel run completo + test di fumo dedicato |
| Component Builder | Documento del componente identico prima/dopo la prova (confronto JSON in E2E); un unico modello; `material.preset` mai scritto |
| Export produttivi | `src/export/*` non modificato; boundary: nessun riferimento a Jelly |
| IndexedDB | `jello-lab` v4 invariato (E2E verifica che non contenga record Jelly); nuovo database `jello-lab-experimental` v1 |
| Jelly sperimentale | Isolato: lazy, separato per progetto, con i limiti noti in [jelly-m64-studio.md](jelly-m64-studio.md) |

## Decisione

**COMPLETE — Experimental Integration Verified**, nel perimetro: Chromium e Firefox desktop, telefono emulato, Studio e
pacchetto web SVG/CSS. Tutti i criteri della checklist §15 sono soddisfatti; «Builder» significa prova affiancata
nell'Inspector del Button, non applicazione alla canvas (rimandata di proposito).

**Jelly NON è pronto per la promozione al runtime ufficiale; serve ancora sperimentazione.** Mancano: verifica su WebKit/Safari e su
dispositivi reali (Android incluso); la misura con dodici superfici dentro lo Studio e una decisione sul budget di gruppo (Firefox
mostrava intervalli RAF più lunghi in M6.3); l'approvazione visiva dei quattro preset da parte di una persona (restano `visuallyVerified: false`);
un piano di migrazione per un riferimento in `material` e per il formato (`jello-material` v2 con `family: "jelly"` non è importabile dal
Studio ufficiale, voluto); la gestione dei record orfani tra i due database; il miglioramento della toolbar su telefono.
