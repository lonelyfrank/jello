# Consegna M5.2 · Desktop Navbar Renderer

Stato: renderer Desktop implementato nel runtime condiviso, con anteprima tecnica nello Stage. Editor Desktop completo e adapter React/Vanilla rimangono per M5.3.

## Audit e architettura

[Audit iniziale e piano prima delle modifiche](navbar-m52-audit.md). M5.1 forniva già definizioni, operazioni immutabili, gruppi, azioni, descrittori e risoluzione dei breakpoint. Mancavano renderer e registrazione Desktop; lo Stage costruiva BottomNavigation per ogni tipo diverso da Button e il pannello trattava Desktop come Button.

`DesktopNavigation` implementa ComponentInstance e riceve una DesktopNavbarDefinition validata. Ha DOM dedicato Start/Main/End, derivato dagli stessi riferimenti canonici. Riutilizza MaterialBinding e Material Registry, icone sanificate, semantica della selezione e presentazione degli stili condivisi. Il runtime pubblico, lo Stage e i futuri pacchetti usano lo stesso createComponent/mountComponent. Nessun renderer React aggiuntivo.

## Funzioni disponibili e API

- Mount/unmount/update/destroy idempotenti; validazione atomica prima di toccare l'istanza; controlli riconciliati per ID e ripristino del focus.
- Brand modificabile con testo/icona builtin o SVG sanificato, destinazione e nome accessibile; template generico con Home, Explore, Projects, Settings e Action.
- Regioni canoniche, gruppi logici senza dropdown, ordine, visibilità/disabled, icone prima/dopo/sopra/sotto e per-item typography.
- Select controllato/non controllato, reselect, veri link sicuri, consumer action con nome/ID/valore, callback ed eventi DOM configurabili.
- Default/hover/pressed/active/focus/disabled, indicatore personalizzabile, forced-colors e reduced motion; Glass/Solid tramite il binding esistente.
- Breakpoint sulla larghezza del contenitore, overflow Main con scroll e fallback della riga completa; compress conserva i nomi accessibili e lo scroll.
- Stage esistente, cambio materiale/viewport, selezione per anteprima degli stati e aggiornamenti della definizione tramite JSON.

API pubbliche aggiunte: `DesktopNavigation`, `DesktopNavigationOptions`, `DesktopNavigationEvent`, `DesktopNavigationActionEvent`, `DesktopNavigationStatus`; helper puri `desktopNavbarRegions`, `desktopNavbarPresentation`, `DESKTOP_NAVBAR_UNSUPPORTED`. Entry point invariato: `createComponent`/`mountComponent`.

Lettura/impostazione attiva: `activeItem`/`setActiveItem` (alias `activeTab`/`setActiveTab` per gli handler Stage). Stato e lookup: `status`, `component`, `host`, `regions`, `elementFor`, `nodeAt`; anteprima: `setInteractive`, `previewState`. Materiale aggiornabile con `update` mantenendo struttura e ID. [API completa, DOM e limiti](desktop-navbar-renderer.md).

## File modificati

| Area | File |
| --- | --- |
| Nuovo renderer | `src/runtime/desktop-navigation.ts`, `src/runtime/desktop-navigation.css` |
| Dispatch e API pubblica | `src/runtime/components.ts`, `src/runtime/index.ts` |
| Modello, capability e template | `src/components/navbar-desktop.ts`, `definition.ts`, `registry.ts`, `templates.ts` |
| Protezione export | `src/export/adapters.ts` |
| Stage e anteprima tecnica | `src/stage/stage.ts`, `src/lab/session.ts`, `src/lab/app/Builder.tsx` |
| Unitari | nuovo `tests/unit/desktop-navigation.test.ts`; aggiornate aspettative di `component-registry`, `components`, `definition`, `navbar-structure` |
| Browser | nuovo `tests/e2e/desktop-navigation.spec.ts`; aggiornate aspettative dei template in `builder.spec.ts` e `components.spec.ts` |
| Documentazione | `README.md`, `docs/navbar-architecture.md`, `component-engine.md`, `component-definition.md`, `compatibility.md`, `studio-completion.md`; nuovi audit, guida renderer e questa consegna |

## Verifiche

Ambiente Linux x64, headless; data di consegna 30 ottobre 2026. La data segue il contesto del client. Nessuna prova su dispositivi fisici o Safari.

| Comando / controllo | Risultato |
| --- | --- |
| `npm run typecheck` | Superato |
| `npm test` | **399/399**, 23 file |
| `npm run build` | Superato: runtime, dichiarazioni e Studio; resta avviso Vite sul chunk Studio oltre 500 kB |
| Regressione E2E su 10 file × 3 progetti | **350 superati, 1 saltato**, nessun fallimento |
| Desktop finale, 9 casi × 3 progetti | **27/27 superati**, Chromium/Firefox/Pixel 7 emulato |
| WebKit, prova Desktop Glass | **Non eseguibile**: avvio browser fallito per libicu74/libjpeg-turbo8 mancanti; 1 test non arrivato al comportamento del prodotto |
| `git diff --check` | Superato |

La regressione comprende Desktop, Navbar Structure Engine, Mobile Navbar, Builder, Button/components, fedeltà export, consumer React e Vanilla, Solid e progetti. Il test saltato è il cambio di progetto tramite breadcrumb a viewport mobile, dove quel controllo è nascosto. Non è l'intera suite E2E della repository. Il setup ricostruisce i consumer indipendenti; React supera anche il proprio typecheck/build. I confronti esistenti verificano runtime byte-identico, geometria e stili tra anteprima e pacchetti.

```sh
npx playwright test tests/e2e/desktop-navigation.spec.ts \
  tests/e2e/navbar-structure.spec.ts tests/e2e/navbar.spec.ts \
  tests/e2e/builder.spec.ts tests/e2e/components.spec.ts \
  tests/e2e/component-export.spec.ts tests/e2e/react-consumer.spec.ts \
  tests/e2e/vanilla-consumer.spec.ts tests/e2e/solid.spec.ts \
  tests/e2e/projects.spec.ts \
  --project=chromium --project=firefox --project=mobile-emulated

npx playwright test tests/e2e/desktop-navigation.spec.ts \
  --project=chromium --project=firefox --project=mobile-emulated

npx playwright test tests/e2e/desktop-navigation.spec.ts \
  --project=webkit --grep 'glass: brand' --max-failures=1
```

I test Desktop controllano attributi/ARIA, callback/eventi, Tab/Shift+Tab/Enter/Space/frecce/Home/End, touch Pixel emulato, navigazione reale, disabilitazioni, focus durante aggiornamenti, breakpoint, scroll senza sovrapposizioni, indicatori/stili calcolati, cambio materiale, istanze indipendenti e gruppo Glass condiviso. Distruzione/rimontaggio ripetuti verificano zero ResizeObserver attivi, zero strati/filtri residui, nessuna callback su un controllo distrutto e attributi/stili del contenitore intatti.

## Errori incontrati e classificazione

- Prima suite unitaria: aspettative M5.1 ancora impostate su Desktop pianificata, aggiornate alla nuova capability. Il relay nella sandbox falliva con `listen EPERM`; la suite completa con accesso alle porte locali supera tutti i test. Nessun timeout aumentato.
- Prime esecuzioni Desktop: la prova Studio usava nomi inesistenti dell'helper (`importText`, `setPick`); corretta con `importComponent` e il controllo UI reale. Errori del test, poi superati nella regressione da 350 casi.
- Nuova prova sugli stili dell'indicatore: leggeva il colore nel mezzo della transizione CSS (24/27 passati, 3 falliti). Corretta aspettando il valore calcolato con `expect.poll`, senza pause arbitrarie o aumento dei timeout; rieseguite tutte le nove prove su tre progetti: **27/27**.
- WebKit: limite dell'ambiente all'avvio, non errore funzionale del renderer. Nessuna dichiarazione di test Safari.

## Limiti e M5.3

Tabs sono rifiutate esplicitamente dal renderer: v1 non associa tab e pannelli. Il DOM usa navigation. Posizionamento Desktop nel flusso e orientamento orizzontale; non esistono anchor/placement/offset o visibilità responsive delle regioni nel contratto Desktop. Asset: builtin e SVG sanificati, nessuna immagine remota arbitraria. A larghezze estreme scorre anche la riga esterna; brand e azioni non possono restare tutti visibili contemporaneamente. Il limite minimo dei target resta 44px; altezze configurate inferiori richiedono overflow verticale.

Una navbar è una superficie unica: stati pressed/active/disabled delle voci usano lo stile componente, non lo stato dell'intera barra Solid. Gli override materiali relativi sono conservati e spiegati in status.reasons; gli altri campi Solid senza effetto sono nella tabella unsupported. Indicatore per voce con transizione del colore, senza geometria Mobile.

M5.3: editor Desktop completo basato sui descrittori e sulle operazioni esistenti, controlli strutturali/layout/responsive, adapter React/Vanilla e relativa interfaccia di export. Eventuale semantica tabs richiede prima il contratto pannelli. Dropdown, hamburger, drag-and-drop, conversione Desktop→Mobile, Jelly, WordPress e backend restano fuori da questa consegna.

**Breaking changes: nessuna per Mobile Navbar, Button o schema/store.** Desktop passa da pianificata a disponibile nel registry; il suo starter usa un brand generico. Non cambiano migrazioni, schemaVersion/typeVersion, IndexedDB o formati di progetto. Gli export Desktop non disponibili sono rifiutati; quelli Mobile/Button continuano a funzionare.
