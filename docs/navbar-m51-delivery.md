# Consegna M5.1 — Unified Navbar Architecture & Structure Engine

30 ottobre 2026. Implementazione nel working tree, senza nuove dipendenze,
registri, formati di progetto o renderer Desktop.

## Audit e decisioni

L'[audit iniziale](navbar-audit.md) ha confermato che il formato canonico,
gli ID indipendenti dal valore, le icone sanificate, i registri, il binding dei
materiali e i breakpoint erano riutilizzabili. Mancavano operazioni strutturali
sulla definizione: il Builder passava da `BnRoot`, ricostruendo struttura e
contenuti. Geometria inferiore, indicatore e animazioni restano specifici di
BottomNavigation.

La soluzione estende l'albero esistente con gruppi a profondità limitata,
aggiunge azioni serializzabili e opera direttamente sulla definizione v1.
Mobile mantiene renderer e API; Desktop ha un profilo indipendente, validato,
modificabile via API e ancora dichiarato non renderizzabile nel registro.

## API consegnate

- Contratti: `NavbarDefinition`, `MobileNavbarDefinition`,
  `DesktopNavbarDefinition`, `DesktopNavbarLayout`, `NavbarItem`, `NavbarGroup`,
  `NavbarAction`, `NavbarRuntimeState`.
- Letture: `isNavbarDefinition`, `navbarItems`, `navbarGroups`,
  `navbarItemNodes`, `navbarActiveItem`.
- Voci: `addNavbarItem`, `updateNavbarItem`, `duplicateNavbarItem`,
  `removeNavbarItem`, `moveNavbarItem`, `reorderNavbarItems`,
  `setNavbarItemVisibility`, `setNavbarItemDisabled`, `setNavbarItemAction`.
- Gruppi: `addNavbarGroup`, `removeNavbarGroup`, `moveNavbarGroup`,
  `moveNavbarItemToGroup`.
- Desktop: `setDesktopNavbarField`, `getDesktopNavbarField`,
  `setDesktopNavbarRegion`, `resolveDesktopNavbar`, descrittori del profilo.
- Inspector esistente: `definitionFields(type, role?)`, con sezioni,
  `scope` e `level`, inclusi i campi dei nodi.
- Runtime ed export: `NavbarActionEvent`, callback `onAction` e CustomEvent
  configurabile (`jello-action` per default), link nativi e selezione della
  route corrente tramite l'esistente `setActiveTab`.

Le operazioni sono pure, tipizzate e validate; `NavbarStructureError.errors`
riporta errori espliciti. L'import resta il punto in cui esaminare eventuali
normalizzazioni. Materiali personali, azioni, gruppi, responsive e nomi degli
eventi sono preservati. [Firma, regole ed esempi](navbar-architecture.md).

## File modificati e aggiunti

| Area | File | Scopo |
| --- | --- | --- |
| Contratti | `src/components/navbar-contract.ts` (nuovo) | Tipi condivisi, azioni/URL, letture e invarianti |
| Operazioni | `src/components/navbar-structure.ts` (nuovo) | Modifiche canoniche immutabili e validate |
| Desktop | `src/components/navbar-desktop.ts` (nuovo) | Profilo, regioni, validazione e responsive |
| Inspector | `src/components/navbar-inspector.ts` (nuovo) | Descrittori dei contenuti e dei gruppi |
| Formato | `src/components/definition.ts` | Ruoli/slot, contenuti, azioni, profili e descrittori |
| Descrittori | `src/components/fields.ts` | Sezioni Contenuto/Accessibilità, scope, livello e campi opzionali |
| Mobile | `src/components/navbar.ts` | Estensioni additive, breakpoint booleani, adattatore compatibile con gruppi |
| API | `src/components/index.ts` | Export delle API nuove |
| Registri | `src/components/registry.ts` | Evento action e disponibilità Desktop descritta correttamente |
| Material binding | `src/components/templates.ts` | Binding e cambio famiglia su definizioni Desktop senza abilitare il renderer |
| Runtime | `src/runtime/bottom-navigation.ts` | Link, azioni, visibilità, accessibilità, focus e aggiornamenti sicuri |
| Stili | `src/runtime/bottom-navigation.css` | Icone, distribuzione, compattezza e posizione icona, default invariati |
| API runtime | `src/runtime/index.ts` | Export del tipo evento action |
| Builder | `src/lab/session.ts` | Operazioni canoniche, gestione errori e gruppi |
| Inspector UI | `src/lab/app/Builder.tsx` | Gruppi, visibilità, azioni, accessibilità e riordino entro il contenitore |
| Export | `src/export/react.ts` | Callback/tipi/README, voci raggruppate e rifiuto export Desktop |
| Consumer | `examples/react-consumer/src/App.tsx` | Uso reale di onAction dal pacchetto esportato |
| Test | `tests/unit/navbar-structure.test.ts` (nuovo) | Identità, struttura, integrità, sicurezza, persistenza ed export |
| Test | `tests/unit/definition.test.ts` | Aspettative aggiornate per il profilo Desktop preparato |
| Test | `tests/unit/component-registry.test.ts` | Evento action dichiarato nel registro |
| Test browser | `tests/e2e/navbar-structure.spec.ts` (nuovo) | Flusso Builder completo e azioni reali nei due materiali |
| Test consumer | `tests/e2e/react-consumer.spec.ts` | Verifica effettiva del callback React |
| Guide | `docs/component-definition.md` | Estensione canonica v1 e contenuti per ruolo |
| Guide | `docs/component-engine.md` | Motore condiviso e disponibilità dei tipi |
| Guide | `docs/component-builder.md` | Controlli realmente utilizzabili e limiti |
| Guide export | `docs/export.md` | Azioni/callback nello stesso sistema di esportazione |
| Architettura | `docs/navbar-architecture.md` (nuovo) | Contratto, scelte, API, esempi, errori, compatibilità e M5.2 |
| Audit | `docs/navbar-audit.md` (nuovo) | Analisi iniziale e baseline |
| Evidenze | `docs/compatibility.md` | Comandi ed esiti realmente eseguiti |
| Consegna | `docs/navbar-m51-delivery.md` (nuovo) | Questo report |

I file in `src/migration`, il formato `.jello` e gli store IndexedDB non
richiedono modifiche: continuano a passare dal parser canonico. La compatibilità
è verificata anche con le tre fixture legacy reali.

## Verifica

Typecheck e build superati; **388 test unitari** superati. La regressione E2E
su nove file ha prodotto **329 superati e uno saltato**. Dopo gli ultimi
ritocchi: 140 test superati nella selezione finale e quattro fallimenti di
isolamento del test URL; corretta la fixture, l'intera suite nuova navbar è
stata rieseguita su tre browser con **9/9 superati**. Nessun fallimento residuo.

Comandi, conteggi ed eventuali esclusioni sono riportati nella sezione M5.1 di
[Compatibilità](compatibility.md). Le prove includono il consumer React con la
propria compilazione TypeScript, i consumer Vanilla indipendenti, confronti
anteprima/export, salvataggio/riapertura e flussi di import/export dei progetti.
Non si deduce il completamento dalla sola compilazione.

## Compatibilità e attività residue

Nessuna API pubblica rimossa e nessun incremento di schema o store. `BnRoot`,
`BnTab`, operazioni `*Tab`, parser, serializer, eventi/callback precedenti,
runtime Mobile e generatori dei pacchetti restano disponibili. La validazione
degli URL malformati/con credenziali è più rigorosa; i campi Desktop prima
ignorati ora vengono validati. Le nuove API strutturali rifiutano i dati che
richiederebbero riparazioni implicite, mentre l'import conserva gli avvisi e le
politiche storiche. I vecchi pacchetti già esportati restano autonomi.

Limiti espliciti: Desktop non ha renderer, template, editor visuale o export
completo; nessun dropdown, nesting arbitrario o drag-and-drop. L'ordine dei
gruppi è modificabile via API; l'interfaccia Mobile ne consente creazione,
assegnazione delle voci e scioglimento. Nessuna trasformazione automatica
Desktop → Mobile. WebKit/Safari e dispositivi fisici non verificati.

Per M5.2 sono pronti modello e operazioni condivisi, gruppi e regioni,
azioni/callback, selezione della route, profilo Desktop con responsive,
material binding, descrittori Base/Avanzato e persistenza nel medesimo
documento. Restano da implementare e verificare il renderer Desktop dedicato,
la voce del registro/runtime, il template e i controlli del suo Builder.
