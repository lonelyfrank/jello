# M5.3 — audit iniziale (31 ottobre 2026)

Branch: `main`, checkout inizialmente pulito.

| Area | Già disponibile | Lacuna utente |
| --- | --- | --- |
| Contratto / struttura | `navbarItems`, `navbarGroups`, regioni derivate, operazioni immutabili validate M5.1 | Brand/action non aggiungibili; nomi/ordine gruppi senza UI |
| Desktop renderer | M5.2: Glass/Solid, brand, regioni, gruppi piatti, link/consumer, tastiera, breakpoint, overflow, lifecycle | Nessun renderer nuovo necessario |
| Builder | Librerie ufficiali/personali, inspector Base/Avanzato, picker, materiali, salvataggio | `navbar` e `root` iniziali riconoscono solo Mobile; Desktop mostra nodi disabilitati |
| Inspector | Controlli Mobile e Button completi; Desktop solo selettore tecnico/stato | Root/brand/item/action/group Desktop non modificabili visivamente |
| Sessione | `tabsOf` e preview conoscono Desktop | `isNavbar` abilita operazioni, contenuto e breakpoint soltanto Mobile; selezione gruppi assente |
| Canvas | Stage condiviso e overlay con `elementFor` / `nodeAt`, modalità separate | Gruppi logici senza rettangolo; brand/item già selezionabili tecnicamente |
| Export | Adapter, ZIP, hash, manifest, runtime e tipi, wrapper React/Vanilla Mobile e Button | Registro Desktop solo JSON; wrapper Vanilla assume BottomNavigation; React assume Mobile |
| Persistenza | IndexedDB v4, definizione v1, progetti .jello, materiale collegato, migrazioni | Verificare il flusso Desktop senza cambiare schema o database |
| Design | `studio.css`, token, Inter, tre colonne e pannelli responsive | Riutilizzare i componenti esistenti, nessuna pagina/pannello/Stage parallelo |

File esaminati: Builder.tsx, session.ts, ExportDialog.tsx, StudioLibrary.tsx, Preview.tsx, studio.css, navbar-contract.ts, navbar-structure.ts, navbar-desktop.ts, registry.ts, desktop-navigation.ts, adapters.ts, react.ts, vanilla.ts, studio-redesign.md, desktop-navbar-renderer.md.

In Builder.tsx i vincoli Mobile sono: rilevamento `navbar` nella sidebar; `navbarView` come sorgente dell’albero e selezione; ramo alternativo Desktop con nodi disabilitati; toolbar di struttura legata a `root`; `root`/`tab` nell’Inspector e ramo `desktop-preview`; descrittori/root/breakpoint Mobile negli editor esistenti. La vista Mobile resta adatta ai suoi controlli di presentazione, ma non deve ricostruire una struttura Desktop (convertirebbe brand/action in item).

Implementazione progressiva: operazioni canoniche minime mancanti; albero comune con regioni Desktop e selezione gruppi; inspector contestuale negli stessi pannelli; wrapper Desktop sul runtime esistente; abilitazione registry; consumatori indipendenti e test/persistenza. Semantica Desktop navigation, gruppi logici senza dropdown. Nessuna conversione Desktop/Mobile.
