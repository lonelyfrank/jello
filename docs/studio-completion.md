# M3.1 / M4.1 — Studio & Export

## Audit prima delle modifiche (30 ottobre 2026)

- `src/model`: `jello-material` v2 è un'unione Glass/Solid, con registro, descrittori, validazione atomica, stati e renderer distinti. Solid non richiede un nuovo schema.
- `src/components`: `jello-component-definition` v1 contiene struttura, contenuto, layout, responsive, stile, stati, eventi e materiale incorporato. Button e Mobile Navbar supportano entrambe le famiglie. Revisioni e aggiornamento dei preset esistono già.
- `src/runtime`: renderer DOM condivisi da Studio e React; Solid usa CSS, Glass usa SVG/CSS e texture controllate dove previste. Observer, listener e gruppi hanno lifecycle esplicito.
- `src/lab`: Builder e Inspector dei materiali sono già basati sul registro. Material Lab, libreria e preset personali sono invece vincolati a Glass. Manca Base/Avanzato; il wizard esistente crea progetti, non componenti.
- `src/export`: JSON generico e React per entrambi i componenti/materiali esistono. Il materiale autonomo è solo Glass; manca l'adapter Vanilla.
- `src/project`: IndexedDB e pacchetto `.jello` esistono, ma import/export dei materiali accettano solo Glass.
- `src/stage`: controller e stage condivisi; il Builder monta i renderer runtime. Riutilizzare lo stesso percorso per le anteprime Solid.
- Baseline: typecheck superato; 339 test unitari superati. Il relay richiede localhost fuori dal sandbox. Verifica E2E di base avviata separatamente.

## Piano e criteri di accettazione

1. Generalizzare libreria/persistenza/import a `MaterialDocument` (`lab`, `project`, `sync`), con controlli Solid dal registro e anteprima sullo stage condiviso. Accettazione: CRUD, preferiti, JSON, recupero e revisioni Solid senza perdere Glass legacy.
2. Riordinare `Builder.tsx`, aggiungere un livello Base/Avanzato e un wizard componente opzionale. Accettazione: Button/Navbar × Glass/Solid, contenuti conservati al cambio famiglia, controlli avanzati e limiti espliciti, viewport/zoom/stati.
3. Aggiungere adapter Vanilla e materiale Solid (`export`, registri). Accettazione: JSON canonici, runtime costruito, CSS, esempio HTTP indipendente, README, manifest; nessuna dipendenza React nel Vanilla; mount/update/destroy e stati/eventi/responsive conservati.
4. Test unitari, E2E e consumatori esterni; aggiornare README e documentazione con risultati reali e limiti.

Rischi: recupero dei progetti precedenti, cambi di famiglia durante il preview, revisioni con override locali, lifecycle e percorsi delle risorse esportate. Verificare round-trip e comportamento nel browser oltre alla compilazione. Nessuna verifica desktop/emulata certifica Safari o Android fisico.

## Implementazione consegnata

- Solid indipendente nel Material Lab: scelta della famiglia, parametri dal registro, stati, anteprima live, simulazione Default/Hover/Pressed/Active/Disabled, reset, materiali personali, duplicazione/rinomina/eliminazione, preferiti, JSON e pacchetti con runtime. Button e Navbar usano il renderer Solid condiviso.
- Libreria, IndexedDB, pacchetti `.jello`, importazione e relay accettano entrambe le famiglie. Nessuna modifica agli schemi canonici o alla versione del database. Compatibilità legacy conservata.
- Builder con sinistra Componenti → Materiali → Struttura → Libreria; Inspector a sei sezioni contestuali e livello Base/Avanzato, controlli con descrittori e reset. Wizard opzionale Componente → Materiale → Personalizzazione, con anteprime runtime e accesso diretto per utenti esperti. Zoom, viewport, sfondo, selezione/interazione e stati condividono lo stage.
- Revisioni dei preset personali anche Solid: aggiornamento automatico dei collegamenti senza override e aggiornamento esplicito in caso di divergenza. URL allineato al salvataggio; bozze ripristinate ricaricando l’indirizzo dello Studio.
- Adapter Vanilla per tutte e quattro le combinazioni: JSON canonici, JS/CSS runtime, tipi, HTML di esempio, README, dipendenze e limiti nel manifest con hash. Nessuna dipendenza React. Lifecycle originale e namespace CSS Jello.
- Export React esistente conservato e verificato nel progetto esterno. Export autonomo Solid con runtime e CSS, senza appiattire gli stati. L’export statico Glass continua a dichiarare la resa ridotta.
- Focus e stati disabled nativi conservati; indicatore Solid con bordo nel colore attivo oltre alla tinta. I percorsi di riduzione movimento/trasparenza e fallback restano quelli del runtime.

## Matrice dei formati

| Contenuto | JSON | React + TypeScript | Vanilla HTML/CSS/JS | Materiale autonomo |
| --- | --- | --- | --- | --- |
| Button Glass | sì | sì | sì | Glass con runtime o CSS ridotto |
| Button Solid | sì | sì | sì | Solid con runtime |
| Mobile Navbar Glass | sì | sì | sì | Glass con runtime o CSS ridotto |
| Mobile Navbar Solid | sì | sì | sì | Solid con runtime |

Il formato progetto `.jello` conserva materiali, componenti e asset dello Studio; non è un pacchetto di integrazione web.

## File principali

- `src/lab/session.ts`, `store.ts`, `storage/repository.ts`, `projects.ts`: ciclo del materiale, revisioni, persistenza e recupero.
- `src/lab/app/Builder.tsx`, `InspectorLevel.tsx`, `Properties.tsx`, `Library.tsx`, `Flows.tsx`, `Preview.tsx`, `ExportDialog.tsx`: Studio, wizard, controlli e destinazioni.
- `src/stage/controller.ts`: anteprime sullo stage condiviso e simulazioni Solid.
- `src/export/vanilla.ts`, `adapters.ts`, `src/components/registry.ts`: destinazione Vanilla e pacchetto Solid autonomo.
- `src/runtime/button.ts`, `bottom-navigation.ts`, `component-types.ts`, `bottom-navigation.css`: simulazioni, semantica e indicatore attivo, mantenendo i renderer condivisi.
- `src/project/importer.ts`, `package.ts`, `src/sync/protocol.ts`, `src/preview/main.ts`: documenti di entrambe le famiglie.
- `scripts/prepare-vanilla.mjs`, `scripts/e2e-servers.mjs`, `examples/vanilla-consumer/README.md`: consumatore HTML indipendente e verifica dei tipi.
- `tests/unit/studio-completion.test.ts`, `vanilla-export.test.ts`, `tests/e2e/studio-completion.spec.ts`, `vanilla-consumer.spec.ts`: nuovi percorsi; aggiornate le suite esistenti del Builder e degli adapter.
- `verification/chromium.json`, `verification/firefox.json`, `verification/mobile-emulated.json`: record raster rigenerati dai test desktop/emulati; nessuna certificazione di dispositivi fisici.
- README e documenti Builder, Export, Progetti, Material Core e Component Engine aggiornati.

## Verifiche finali

- `npm run typecheck`: superato.
- `npm test`: **348 test superati, 21 file** (baseline 339). Comprende schema, migrazioni legacy, materiali, revisioni, storage, round-trip dei progetti, export, confini runtime e relay.
- `npm run build`: superato. Avviso Vite per il chunk Studio maggiore di 500 kB; non bloccante.
- `npm run test:e2e -- --project=chromium --project=firefox --project=mobile-emulated --workers=4`: **565 test superati, 2 saltati, 0 errori** (567 casi, circa 6,3 minuti). I due skip esistenti riguardano l’emulazione della trasparenza via CDP su Firefox e una prova del wizard progetto esclusa su viewport mobile. Nessuno skip nei nuovi flussi Studio o nei consumatori Vanilla.
- Ogni avvio E2E esporta, installa, verifica i tipi e costruisce il progetto React esterno; prepara inoltre quattro pacchetti Vanilla e Solid autonomo e ne verifica i tipi pubblici. I consumatori caricano i file costruiti, senza importare i sorgenti dello Studio.
- I confronti di stile attendono il termine delle transizioni CSS; i test sui preset attendono il salvataggio effettivo prima di leggere l’ID collegato.

## Limiti e seguito

- Nessun test Safari, WebKit o Android fisico eseguito in questa consegna. Il viewport mobile usa Chromium desktop: non certifica un dispositivo.
- I renderer DOM Glass usano SVG/CSS, con fallback dichiarato; WebGL2 rimane per texture controllate. Non campionano liberamente il DOM con WebGL2.
- Solid si prova su Button e Mobile Navbar. Non offre la lente Glass, la scena ottica o il confronto A/B. Focus è della componente. Sulla Navbar pressed/active/disabled sono stati delle tab; gli override del materiale dell’intera superficie sono conservati e provabili nel Material Lab, con limite dichiarato nell’Inspector.
- I colori personalizzati richiedono una verifica del contrasto sullo sfondo effettivo. I preset e le varianti predefinite hanno le verifiche esistenti; nessuna promessa automatica per combinazioni arbitrarie.
- Vanilla richiede un server HTTP e browser moderni (ES modules, CSS custom properties, ResizeObserver); nessun polyfill incluso.
- Prossime verifiche: Safari e Android reali. Possibile ottimizzazione successiva: suddivisione del bundle Studio. Jelly, Desktop Navbar, Input e WordPress restano fuori ambito, insieme a backend/account/cloud/AI.

## Milestone

| Milestone | Stato | Criterio verificato |
| --- | --- | --- |
| M3 / M3.1 — Studio & Completion | **Completata per l’ambito richiesto** | Button/Navbar × Glass/Solid, wizard opzionale, personalizzazione, preset collegati, salvataggio e recupero. |
| M4 / M4.1 — Export Completion | **Completata per l’ambito richiesto** | Pacchetti React e Vanilla realmente utilizzati nei consumatori esterni, con runtime condiviso; JSON e Solid autonomo. |

Safari/Android fisici e ottimizzazione del bundle restano attività successive, dichiarate senza attribuire loro risultati non eseguiti. Nessuna funzionalità necessaria al flusso end-to-end richiesto è rinviata.
