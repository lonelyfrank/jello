# M5.1 — audit iniziale

Audit del codice locale e delle guide Component Definition, Component Engine,
Component Builder, Material Core, Export e Compatibilità (30 ottobre 2026).

| Area | Evidenza e decisione |
| --- | --- |
| Formato e validazione | `definition.ts`: documento canonico v1, ruoli/slot, ID globali, contenuti separati, validazione atomica. Estendere questi contratti, senza altro documento o versione. |
| Registri | `COMPONENTS` registra Button e Mobile; Desktop è pianificata. `MATERIALS` risolve Glass/Solid. Mantenerli unici e non registrare un renderer inesistente. |
| Mobile | `navbar.ts`: `BnRoot` è una vista derivata; ID già indipendenti da etichetta e valore, valori ripetibili, SVG sanificati. Riutilizzare icone, descrittori, breakpoint e presentazione. |
| Limite strutturale | `addTab`/`duplicateTab`/`moveTab` lavorano sulla vista; `applyNavbarView` ricostruisce contenuti e slot. Mancano operazioni sulla definizione, gruppi, visibilità e azioni esplicite. |
| Renderer | `BottomNavigation`: geometria inferiore, indicatore, pressione, selezione, focus, overflow. Queste parti restano Mobile; Desktop non ne eredita il posizionamento. |
| Layout e responsive | Descrittori e override a `maxWidth`, precedenza alle soglie più strette. Estendere proprietà, non introdurre soglie né conversioni automatiche. |
| Inspector e Builder | Un pannello materiale, campi per sezione e Base/Avanzato. Il livello è oggi deciso nel frontend; servono metadati riutilizzabili nei descrittori, non un secondo Inspector. `LabSession` deve usare le operazioni canoniche. |
| Runtime/export | React è un wrapper del medesimo runtime DOM; Vanilla usa `createComponent`. Aggiungere le azioni al runtime e ai callback del wrapper, mantenendo API e pacchetti. |
| Migrazioni | `migration/component-v1.ts` converte i formati precedenti, `legacy.ts` isola nomi/URL storici. Nessuna conversione necessaria per i documenti v1 validi; assenza di azione significa selezione come prima. |
| Persistenza | repository IndexedDB, importer e pacchetti progetto passano già dal parser canonico. Non servono altri store né formati. Verificare round-trip e materiali personali. |
| Protezioni esistenti | Test definition/components/registry/material/inspector, migration con tre fixture reali, storage/project, React/Vanilla export e boundary runtime. E2E builder, navbar, solid, projects e consumer coprono struttura, eventi, tastiera, materiali, riapertura ed export. |

API da preservare: `ComponentDefinition`, parser/serializer, `BnRoot`/`BnTab`,
`navbarView`/`applyNavbarView`/`editNavbar`, operazioni `*Tab`, `BottomNavigation`
e relativi eventi/callback, `createComponent`, template, binding materiali e
generatori React/Vanilla. Le API storiche della vista mantengono la propria
politica (no-op/clamp); le nuove operazioni canoniche segnalano errori espliciti.

Baseline: 345 test superati nella sandbox, 3 non eseguiti per `listen EPERM`
del relay. Riesecuzione con accesso alle porte locali: **348/348 superati**.
