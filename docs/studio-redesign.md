# Jello Studio — redesign

## Audit e mappatura (M1)

Il checkout iniziale è pulito. React 19, TypeScript, Vite; nessuna libreria UI aggiuntiva.
`App`, `Home`, `Builder`, `Library`, `Properties`, `Preview`, `Flows` e `ExportDialog`
costituiscono la UI. `design.css` e `lab.css` condividono i token di `stage/theme.css`;
le nuove regole dello Studio saranno isolate dall'anteprima e dal runtime esportabile.

| UI precedente | Jello Studio | Logica mantenuta |
| --- | --- | --- |
| Home / progetti | Workspace | ProjectManager, conteggi reali, IndexedDB, wizard |
| Componenti | Component Builder | BuilderSidebar, inspector contestuale, definizione canonica |
| Materiali | Material Lab | registro parametri, Glass/Solid, libreria e preset |
| Librerie laterali | Library | stessi documenti e azioni della sessione, anteprime runtime |
| Toolbar, Rendering, telefono | Preview & Test | stesso Stage, dispositivi, scene, diagnostica, relay |
| Esporta… / export progetto | Export | stessi adapter, manifest, backup `.jello` distinto |
| Asset / Impostazioni | utility persistenti | palette, icone, font, preferenze |

`src/stage/controller.ts` è il controller condiviso: non viene duplicato. I renderer
Glass (CSS/SVG e WebGL2) e Solid (CSS) sono indipendenti. Button e Mobile Navbar
sono modificabili ed esportabili; Desktop Navbar ha anteprima tecnica e JSON,
senza editor completo né adapter React/Vanilla. Jelly è pianificato e disabilitato.
Non esistono undo/redo generali o trascinamento geometrico libero: non verranno simulati.

Il modello rimane `jello-material` v2 / `jello-component-definition` v1. Il database
rimane alla versione 4; nessuna migrazione o modifica dei contratti pubblici.
Le preferenze visive dello Studio sono separate dai documenti e dai pacchetti.

### Audit brand

- `public/brand/` contiene già marchio e logotipo originali: riutilizzati.
- Cable / BT Darts sono confinati alle migrazioni legacy e alle fixture: preservati.
- La dashboard sportiva e i testi di card/pannello dello Stage sono demo operative:
  saranno sostituiti da contenuti Jello centralizzati.
- La fotografia dei tulipani è una scena diagnostica CC0, con sorgente legacy
  `example:tulips` usata anche dagli export: preservata per compatibilità.
  Le scene Jelly si aggiungono al catalogo, senza alterare gli URL diagnostici.
- Reticoli, coordinate, blocchi, testo, texture WebGL2 e mappe restano disponibili.

### Verifica prevista

Typecheck, unit, build, E2E locali disponibili, round trip e persistenza,
parità con i consumatori esportati, screenshot desktop/mobile e overflow.
Safari/WebKit e dispositivi fisici conservano i limiti documentati in compatibility.md.

## Consegna

### Viste aggiornate

| Milestone | Risultato |
| --- | --- |
| M1 Foundation | Shell persistente, Jello Studio, marchio originale, Inter locale, token semantici, chiaro/scuro e focus dell'editor isolato dal runtime. |
| M2 Workspace | Benvenuto con asset originale, progetti reali e date di modifica, filtri tutti/recenti, menu progetto, Quick Start, Material Gallery, componenti salvati e asset. Primo avvio esplicitamente vuoto, kit solo su scelta. |
| M3 Builder | Tre colonne, pannelli ridimensionabili con puntatore e tastiera, filtri Tutto/Layers/Components/Assets, inspector Tutto/Design/Interactions/Advanced, JSON canonico, selezione, viewport, zoom e barra degli stati registrati. |
| M4 Material Lab | Stesso registro dei controlli, superfici e gerarchie coerenti, libreria Glass/Solid, proprietà per gruppi, renderer e diagnostica separati, canvas centrale. |
| M5 Library/Preview/Export | Catalogo di documenti reali, ricerca e filtri, preferiti e duplicazione; composizione della diagnostica e del relay esistenti; export in cinque passi con anteprima di file/dipendenze e riepilogo completo. |
| M6 Brand | Microcopy demo centralizzata, dashboard e card sportive sostituite con Jello Creative Space, asset Jelly locale, scene originali e attribuzioni. |
| M7 Responsive/QA | Navigazione compatta scorrevole, ricerca anche mobile, stato di salvataggio, pannello inferiore senza sovrapposizione al canvas, focus e reduced motion, verifiche browser e regressioni. |

Le miniature del catalogo e della galleria usano `mountComponent` o
`createMaterialGroup`, con backend CSS esplicitamente dichiarato. Non sono verifiche
della rifrazione SVG/WebGL2. I piccoli campioni nelle sidebar restano indicativi;
l'anteprima tecnica del materiale è nel canvas. Observer e renderer delle miniature
vengono rilasciati allo smontaggio; lo Stage centrale non viene ricreato al cambio vista.

Le preferenze sono in `jello-studio-preferences-v1` (localStorage, con validazione e
limiti delle dimensioni). Il contenuto resta in IndexedDB. Il parametro URL opzionale
`studio=library|preview` ripristina la vista; tutti i precedenti parametri conservano
il loro significato. Un URL esplicito senza `studio` apre l'editor come prima.

### Screenshot

Acquisiti con Chromium headless, profilo browser isolato, desktop 1440×1000 e
mobile 390×844. Sono screenshot dell'applicazione funzionante, non del mockup.
Il progetto visibile è stato creato dall'azione reale «Parti da un preset Jello».

| Vista | Desktop | Mobile |
| --- | --- | --- |
| Primo avvio | [Workspace vuoto](screenshots/studio/workspace-first-launch-desktop.png) | — |
| Workspace | [Desktop](screenshots/studio/workspace-desktop.png) | [Mobile](screenshots/studio/workspace-mobile.png) |
| Component Builder | [Desktop](screenshots/studio/component-builder-desktop.png) | [Mobile](screenshots/studio/component-builder-mobile.png) |
| Material Lab | [Desktop](screenshots/studio/material-lab-desktop.png) | [Mobile](screenshots/studio/material-lab-mobile.png) |
| Library | [Desktop](screenshots/studio/library-desktop.png) | [Mobile](screenshots/studio/library-mobile.png) |
| Preview & Test | [Desktop](screenshots/studio/preview-test-desktop.png) | — |
| Export | [Desktop](screenshots/studio/export-desktop.png) | — |
| Inspector | — | [Pannello mobile](screenshots/studio/inspector-mobile.png) |

Ulteriori controlli: [320×800](screenshots/studio/builder-320x800.png),
[768×1024](screenshots/studio/builder-768x1024.png),
[844×390](screenshots/studio/builder-844x390.png),
[1024×768](screenshots/studio/builder-1024x768.png).
Tema chiaro: [Workspace](screenshots/studio/workspace-light-desktop.png) e
[Builder](screenshots/studio/builder-light-desktop.png).
[Esito automatico del layout](screenshots/studio/verification.json).
Riproduzione: avviare `npm run dev`, poi `node scripts/studio-screenshots.mjs`.

### File interessati

| Area | File |
| --- | --- |
| Shell | `src/lab/app/App.tsx`, `StudioNav.tsx`, `PanelResize.tsx`, `src/lab/main.tsx`, `src/lab/studio.css`, `src/lab/studio-preferences.ts` |
| Workspace e catalogo | `src/lab/app/Home.tsx`, `StudioLibrary.tsx`, `RuntimeThumbnail.tsx`, `Library.tsx`, `Search.tsx` |
| Editor e preview | `src/lab/app/Builder.tsx`, `InspectorLevel.tsx`, `Preview.tsx`, `Properties.tsx`, `TestInspector.tsx`, `ExportDialog.tsx`, `src/lab/session.ts` |
| Brand e demo | `src/stage/demo-content.ts`, `scenes.ts`, `components.ts`, `stage.css`, `src/project/defaults.ts`, `public/assets/ATTRIBUTION.md`, `public/assets/backgrounds/jelly-macro.png`, `public/assets/backgrounds/README.md` |
| Documenti e metadati | `README.md`, `index.html`, `package.json`, questo documento e `docs/screenshots/studio/` |
| Verifiche | `scripts/studio-screenshots.mjs`, `tests/e2e/studio-redesign.spec.ts`, `tests/unit/studio-preferences.test.ts`, selettori aggiornati in `tests/e2e/projects.spec.ts` e `studio-completion.spec.ts`, record raster `verification/*.json` prodotti dai test |

### Verifiche eseguite — 31 ottobre 2026

| Controllo | Esito |
| --- | --- |
| `npm run typecheck` | Superato. |
| `npm test` | 402 test superati, 24 file; relay locale incluso. |
| `npm run build` | Superato: libreria, tipi, Studio e preview leggera. Rimane l'avviso Vite per il chunk editor sopra 500 kB; nessuna nuova dipendenza. |
| E2E Chromium | 209 superati. |
| E2E Firefox | 208 superati, 1 skip previsto (emulazione della preferenza reduced transparency). |
| E2E mobile emulato | 207 superati, 2 skip per casi desktop (wizard di isolamento progetti storico e resize tramite separatori). |
| Totale E2E finale | **624 superati, 3 skip, nessun fallimento residuo**, combinando suite completa e riesecuzioni dei gruppi corretti. |
| Screenshot e reflow | 18 acquisizioni, nessun overflow orizzontale del documento e nessun errore JavaScript; da 320 px, tablet, landscape, desktop e tema chiaro/scuro. |
| Contrasto token | Testo primario e secondario sui pannelli e sulle superfici elevate: minimo 5,10:1 nei due temi. Non è una certificazione di ogni immagine/materiale. |
| `git diff --check` | Superato. |

La suite completa è stata eseguita con `npm run test:e2e:local`. Il primo giro
completo ha prodotto 601 pass, 10 fallimenti, 3 skip e 7 casi non eseguiti
a valle del gruppo raster seriale. Sono stati corretti l'isolamento del focus,
i selettori adattati alla nuova navigazione, l'altezza minima del canvas mobile
e la scelta esplicita dell'adapter JSON nel nuovo test del wizard.
La riesecuzione di `projects`, `studio-completion`, `studio-redesign` e `raster`
ha chiuso le regressioni: 130 pass e 2 skip. Un ultimo giro di `studio-redesign`
(23 pass, 1 skip) aggiunge la copertura dei primary Glass/Solid personalizzati,
con snapshot React stabili nell'inspector diagnostico.
Il conteggio finale usa l'ultimo risultato per browser/file/nome del test,
senza sommare come nuovi test le ripetizioni.

Copertura effettiva: schemi canonici e migrazioni legacy, salvataggio e bozze,
IndexedDB, progetti, preferiti, import/export e round trip `.jello`, Button e
Navbar Glass/Solid, CSS/SVG, raster, scene WebGL2, fallback, tastiera, reduced
motion/transparency e relay. I consumatori React e Vanilla conservano la parità
di stile e comportamento e i byte runtime previsti dai test.

[Riepilogo verificabile in JSON](studio-verification.json), con risultati per
browser e skip. Non sono stati eseguiti Safari/WebKit, prove su telefono fisico,
WebView Android, screen reader manuale o un audit completo di tutte le combinazioni
di colore. Il reflow a 320 px è verificato; lo zoom reale del browser al 200% non
è stato misurato separatamente. Restano i limiti ottici WebGL2 già documentati.

### Riferimenti sostituiti e preservati

- Rimossi dalle demo operative torneo, squadre, partite, punteggi e notifiche sportive.
  Nuovi contenuti: collezioni, forme, palette, Creative Space, «Shape the Interface.»
  e «Create with Jello», centralizzati in `src/stage/demo-content.ts`.
- Cable e BT Darts non erano più demo attive: i riferimenti residui di migrazione,
  fixture e documentazione storica sono preservati per riaprire documenti precedenti.
- Il raster Jelly è quello allegato dall'utente, copiato senza modifiche.
  Spectrum è una composizione dello stesso asset. Non viene dichiarata una licenza
  di redistribuzione generale che non è stata fornita.
- Tulipani CC0 e `example:tulips` rimangono nella scena fotografica diagnostica
  e nei percorsi legacy; il kit principale si apre su Jelly Macro. Griglia,
  coordinate, testo, blocchi, texture controllata e displacement sono preservati.

### Differenze dal mockup e roadmap

- Il mockup contiene progetti e cronologie esemplificativi: qui vengono mostrati
  esclusivamente dati reali, con un primo avvio vuoto.
- Jelly rimane in sviluppo: il raster è identità visiva, non un renderer Jelly.
  Bollicine, elasticità, famiglie iridescenti e liquid richiedono un'evoluzione separata.
- Button e Mobile Navbar sono operativi; Desktop Navbar conserva la sola anteprima
  tecnica e JSON. Editor completo e adapter Desktop restano nella roadmap M5.3.
- Card e pannello sono oggetti demo del Material Lab, non nuovi tipi esportabili
  del Builder. Input, Toggle, Badge e Layout non vengono presentati come disponibili.
- Nessun editor geometrico libero, undo/redo generale o trascinamento inventato.
  La selezione mostra la struttura reale; dimensioni e layout usano i controlli supportati.
- L'export offre sia cinque passi sia il riepilogo completo; non introduce formati
  o opzioni che gli adapter non supportano. Il backup progetto resta un flusso distinto.
- Lo Studio conserva le regole di base in `lab.css`/`design.css`; la composizione e
  i token del redesign sono centralizzati in `studio.css`, caricato solo dall'editor.
  Non vengono inclusi nei pacchetti runtime né nella preview leggera.
- Nessun deploy, commit remoto, modifica di altre repository o nuova dipendenza UI.

## Aggiornamento M5.3 — Desktop Navbar

Il limite Desktop descritto nell’audit e nella consegna storica sopra è superato: il Builder visuale e gli adapter React/Vanilla sono implementati sullo stesso runtime M5.2. Albero per regioni, inspector contestuale Base/Avanzato, picker, token, font e Stage rimangono quelli del redesign. Nessuna nuova pagina o nuovo Inspector. [Consegna e verifiche aggiornate](navbar-m53-delivery.md).
