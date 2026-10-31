# M5.3 — Visual Navbar Builder e Desktop Export

Audit iniziale: [navbar-m53-audit.md](navbar-m53-audit.md). Implementazione sul branch `main`, senza riscrivere renderer o Studio.

## UX

Il wizard e i template ufficiali offrono Desktop Navbar. La libreria personale resta distinta. L’albero legge `navbarItems`, `navbarGroups`, `desktopNavbarRegions` e l’ordine della struttura canonica; mostra Start/Main/End con brand, voci, azioni e gruppi, anche vuoti o nascosti. Le frecce riordinano nella regione o nel gruppo corrente; Regione sposta un nodo radice, mentre i membri ereditano la regione del gruppo. Il selettore Gruppo propone quelli compatibili: per cambiare regione a un membro, estrarlo o spostare il gruppo.

Aggiungi, duplica, elimina, crea/sciogli gruppo e riordina senza JSON. Il brand è opzionale e unico; sono ammesse fino a quattro azioni. I ruoli, ID, materiale, breakpoint, stili e collegamenti ai preset rimangono canonici. Nessun gruppo genera un dropdown.

Lo stesso Inspector Base/Avanzato ospita root, brand, voce, azione e gruppo. Root usa i descrittori Desktop e non offre anchor, placement, orientamento verticale o semantica tabs. Dimensioni, radius, padding/gap, distribuzione di Main, inline/stacked, compact, icone/etichette, stati, materiale e breakpoint hanno i controlli esistenti. I controlli Solid senza effetto sono sostituiti da spiegazioni. Le azioni vengono validate su Applica; bozze incomplete e valori invalidi non alterano il documento. Le proprietà accessibili e gli override tipografici sono in Avanzato.

Selezione albero → evidenziazione Canvas; Seleziona nel Canvas → nodo e proprietà, anche tramite Enter/Space. La modalità Interagisci prova selezione, link e consumer action; le consumer action mostrano il nome nello Studio. Il documento non memorizza gli stati simulati né la selezione provata. I gruppi evidenziano l’unione geometrica delle voci visibili; i gruppi vuoti non hanno un elemento fittizio. La selezione rivela le voci nei contenitori scorrevoli, senza spostare la pagina Studio. Il Canvas riporta overflow e breakpoint attivo. Gli stati simulati Desktop compaiono soltanto quando è selezionato un controllo visibile. Selezionare dal Canvas di Preview & Test riapre l’Inspector e i Layers esistenti del Builder. Su telefono il cassetto scorre alle proprietà selezionate, senza aprire la tastiera virtuale. Tutte le dimensioni di prova e il reflow dello Studio usano i percorsi preesistenti.

## API aggiunte

Tutte additive, esportate dal barrel dei componenti e dal runtime:

| API | Scopo |
| --- | --- |
| `addNavbarControl(def, 'brand' \| 'action', patch?)` | Aggiunta esplicita tramite slot e validazione comuni, restituisce definition/id. |
| `renameNavbarGroup(def, id, label)` | Nome del gruppo; ID e ordine invariati. |
| `setNavbarItemStyle(def, id, key, value \| null)` | Override numerici iconSize/fontSize/fontWeight/letterSpacing anche su brand e azioni. |
| `editDesktopNavbarBreakpoint(def, id \| null, patch)` | Aggiunta, modifica, rimozione tramite validatore e percorsi canonici; rifiuta proprietà non supportate. |

API interne aggiunte a `LabSession`: `addDesktopControl`, `setNavbarRegion`, `renameNavbarGroup`, `moveNavbarGroup`. Le operazioni di voci e breakpoint esistenti riconoscono entrambe le navbar.

Le operazioni fallibili lanciano `NavbarStructureError` senza mutare il documento. Il validatore Desktop conserva ora anche gli stili di brand/action già supportati dal renderer. `LabSession` collega le operazioni a selezione, anteprima e autosave; non ricostruisce la struttura Desktop tramite `applyNavbarView`.

## Export

Il registry dichiara JSON, React e Vanilla. Il dialog usa gli adapter reali e mostra file, dipendenze, materiale risolto, istruzioni source Glass e limiti.

React include ESM, dichiarazioni, sorgente TSX equivalente, definizione canonica, materiale risolto, runtime/CSS/tipi, esempio, README e manifest con SHA-256. Il wrapper monta `DesktopNavigation` tramite `createComponent`, aggiorna config e activeItem in luogo, inoltra i callback correnti e distrugge l’istanza allo smontaggio. `JelloDesktopNavigation` e il componente nominato espongono config, activeItem/defaultActiveItem, onChange/onTabPress/onReselect/onAction/onHover/onFocus, sourceRef/scrollerRef/backend/className/aria-label. Il tipo degli ID include anche brand e azioni. Props controllate, StrictMode e cleanup sono verificati nel consumatore installato; il wrapper usa l’effetto isomorfo per non accedere al DOM durante render.

Vanilla include component.json, material.json, index.js, index.d.ts con `DesktopNavigationOptions`/`DesktopNavigation`, runtime/CSS/tipi, esempio HTTP senza build, README e manifest. `mount` restituisce l’istanza pubblica: update, setActiveItem, unmount/mount, destroy e callback/eventi sono quelli dello Studio. Nessun React. Solid funziona senza source; Glass senza source usa CSS, con source opaca separata usa SVG dove disponibile e fallback CSS/opaco.

I fixture dei consumatori aggiungono gli stessi edit canonici su brand, gruppi, ordine, link e consumer action. I pacchetti sono installati nel progetto React indipendente e serviti dal progetto Vanilla indipendente. I test confrontano anche i byte runtime/CSS/tipi e geometria/stili con lo Stage a pari condizioni del contenitore.

## File

| Area | File |
| --- | --- |
| Modello e descrittori | `src/components/navbar-structure.ts`, `navbar-desktop.ts`, `navbar.ts`, `registry.ts`, `templates.ts` |
| Builder/Stage | `src/lab/app/Builder.tsx`, `Flows.tsx`, `Preview.tsx`, `StudioLibrary.tsx`, `src/lab/session.ts`, `store.ts`, `studio.css`, `src/stage/component-overlay.ts`, `stage.ts` |
| Export | `src/export/react-desktop.ts`, `react.ts`, `vanilla.ts`, `adapters.ts` |
| Consumatori | `scripts/desktop-consumer-fixture.mjs`, `prepare-consumer.mjs`, `prepare-vanilla.mjs`, `examples/react-consumer/src/DesktopConsumer.tsx`, `main.tsx`, package/lock/tsconfig e README dei consumatori |
| Test | `tests/unit/desktop-builder-export.test.ts`, aspettative registry/renderer/struttura aggiornate; `tests/e2e/desktop-builder.spec.ts`, `desktop-consumer.spec.ts`, `desktop-navigation.spec.ts` |
| Documentazione | questo documento, audit, `navbar-m53-verification.json`, screenshot, README, component-builder, component-engine, export, desktop-navbar-renderer e studio-redesign |

## Persistenza e compatibilità

Definizione v1, typeVersion v1, materiale v2, IndexedDB v4: invariati. Nessun database nuovo. JSON, IndexedDB e ZIP `.jello` rileggono gli edit Desktop, inclusi stili brand/azioni, regioni, gruppi e preset materiali collegati. Il cambio Glass/Solid conserva struttura e responsive. Le migrazioni legacy Mobile non cambiano. Nessuna breaking change intenzionale; i pacchetti precedenti restano autonomi.

## Verifiche

Risultati effettivi del 31 ottobre 2026. [Report verificabile](navbar-m53-verification.json), con comandi, conteggi per browser/file, skip, hash runtime e correzioni.

| Verifica | Esito |
| --- | --- |
| `npm run typecheck` | Superato. |
| `npm test` | **411 superati**, 25 file, nessuno skip. |
| `npm run build` | Superato: runtime, tipi, Studio e preview. Rimane l’avviso Vite per chunk oltre 500 kB. |
| Suite E2E locale completa | **666 superati, 3 skip, 0 fallimenti**, 669 casi. |
| Giro finale Desktop/consumatori/Builder/redesign | Desktop Builder **33/33**, consumatori Desktop React/Vanilla **12/12**, runtime Desktop **27/27**. Il cambio automatico di pannello aveva introdotto 3 fallimenti nel flusso Mobile; corretti preservando la preferenza Mobile. |
| Regressioni finali Builder/redesign | **53 superati, 1 skip, 0 fallimenti** sui tre browser. |
| Totale E2E unico finale | **669 superati, 3 skip, 0 fallimenti residui**, 672 casi. Chromium 224, Firefox 223 + 1 skip, mobile emulato 222 + 2 skip. |
| Consumatori indipendenti | Installazione reale React, typecheck inclusi sorgenti TSX e build superati; Vanilla HTTP senza React, tipi dei sette pacchetti superati. Geometria/stili, byte runtime, callback, link, tastiera, responsive e cleanup verificati. |
| Reflow Studio | 320, 390, 768, 844, 1024 e 1440 px nei tre browser; nessun overflow orizzontale del documento. A 844 px è provata anche l’altezza landscape di 390 px. Proprietà selezionate realmente nella viewport, non soltanto presenti nel DOM. |
| `git diff --check` | Superato. |

Il totale unico usa l’ultimo risultato per browser/file/suite/nome, senza sommare le riesecuzioni. L’ultimo caso Preview & Test aggiunge 3 esecuzioni alla suite completa iniziale. Le modifiche finali di selezione e cassetto sono coperte dai giri mirati successivi. Nessun nuovo timeout artificiale: le attese verificano DOM, viewport, geometria, eventi, persistenza o download.

Skip esistenti: Firefox non emula reduced-transparency tramite CDP; mobile non esegue il vecchio caso wizard con project switcher desktop né il resize tramite separatori desktop. Non sono skip delle funzioni Desktop nuove.

Errori iniziali risolti: quattro aspettative unitarie ancora limitate a JSON; relay bloccato da EPERM nella sandbox (rieseguito e passato con i permessi per la porta locale); primo giro Desktop 16 pass/5 fail per condizioni diverse del contenitore e selettore dell’icona. I confronti allineano larghezza/padding/font e attendono gli stili correnti senza congelare una transizione in corso. La successiva verifica visiva ha portato lo scroll del cassetto alle proprietà e corretto la regressione della preferenza Mobile.

## Stato finale M5

M5.1 (struttura), M5.2 (runtime Desktop) e M5.3 (Builder visuale e pacchetti Desktop) completati per il flusso Navbar web verificato. I sette criteri di accettazione sono coperti: creazione, modifica senza JSON, Glass/Solid, Stage responsive, salvataggio/riapertura, export React/Vanilla e uso indipendente con comportamento/rendering/accessibilità automatici. Restano i limiti di verifica fisica e manuale elencati sotto.

## Limiti

Desktop supporta navigation. Tabs richiederebbe un contratto dei pannelli; import Desktop tabs rifiutato prima di cambiare il documento. Brand: testo e icona builtin/SVG sanitizzata, senza pipeline immagini remote. I gruppi sono logici; non hanno focus o controllo autonomo nel renderer. Le regioni non si nascondono via breakpoint v1. Overflow scorrevole, senza hamburger/dropdown o conversione Mobile. La distribuzione riguarda Main. Font-size del contenitore e sua larghezza/padding sono condizioni dell’integrazione: font e geometria dei controlli provengono dalla definizione.

Restano i limiti Glass SVG/CSS/WebGL2 documentati nel renderer. Le verifiche automatiche locali non equivalgono a un audit screen reader manuale, Safari o dispositivi fisici. L’avviso Vite sui chunk Studio/consumatore React oltre 500 kB rimane; nessuna dipendenza UI aggiunta.

## Screenshot verificati

Catture del Builder reale dopo selezione Canvas: [1440 px](screenshots/navbar-m53/builder-1440.png), [390 px](screenshots/navbar-m53/builder-390.png), [320 px](screenshots/navbar-m53/builder-320.png). Su telefono è visibile il controllo selezionato nel cassetto Inspector; sul desktop sono visibili struttura, Canvas e proprietà.
