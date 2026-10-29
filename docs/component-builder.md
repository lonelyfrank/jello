# Component Builder e componenti

Jello ha due modalità di lavoro, scelte nell’intestazione e condivise da un unico motore di anteprima:

- **Material Lab**: il laboratorio dei materiali di sempre (libreria, parametri, renderer,
  diagnostica, import/export). Invariato.
- **Component Builder**: configura una componente UI che *usa* un materiale, la salva nella libreria
  personale e la esporta.

Le due modalità usano lo stesso `PreviewController`, lo stesso stage (sorgente, scene di prova,
formati), lo stesso `GlassGroup` e lo stesso filtro SVG: il builder monta la componente al posto
dell’oggetto dimostrativo, non crea un secondo renderer (`tests/e2e/builder.spec.ts` lo verifica:
un solo filtro, una sola superficie dopo cambi ripetuti di modalità).

## Flusso

1. **Component Builder** → *Componenti → Bottom Navigation · BT Darts* (template).
2. *Struttura* (colonna sinistra): seleziona la radice o una tab; **+ Tab**, ←/→ per riordinare,
   **Duplica**, **Elimina** (non l’ultima).
3. Inspector (destra), contestuale all’elemento selezionato, in sezioni richiudibili:
   Struttura · Layout · Aspetto · Tipografia · Materiale · Stati · Interazioni · Responsive. Le
   proprietà senza effetto nella configurazione attuale non vengono mostrate (es. «Larghezza fissa»
   solo con larghezza fissa, raggio e allineamento non per la barra agganciata).
4. Tab: etichetta, id stabile (sola lettura), valore libero, icona inclusa o **SVG caricato**,
   dimensioni e tipografia proprie (o ereditate), disabilitata, tab iniziale, *Anteprima stato*
   (hover, premuta, focus senza interagire).
5. *Materiali → Glass* (o la sezione Materiale): preset di partenza, parametri, limiti del rendering
   sul percorso in uso, **Salva come preset personale** (finisce nella libreria materiali, visibile
   anche nel Material Lab), **Ripristina valori del preset**.
6. **Salva nella libreria**: il template diventa una componente personale (IndexedDB, salvataggio
   automatico da lì in poi). Si riapre dalla libreria o dall’URL `?workspace=builder&component=<id>`.
7. **Esporta…** → *Componente + materiale* (React + TypeScript), *Solo materiale*, *Configurazione
   JSON*. Il dialog mostra file e dipendenze prima di scaricare.

Anteprima: **Interagisci** (le tab rispondono come nell’app) o **Seleziona** (un clic seleziona
l’elemento; un contorno lo evidenzia sullo stage, fuori dalla componente, mai esportato). Formati
Desktop, Tablet (768 px), Telefono (390 px), personalizzato; sfondo di prova dal menu *Sfondo*;
tema e movimento ridotto restano quelli dell’ambiente.

I template sono di sola lettura come i preset inclusi: le modifiche restano una bozza del progetto
(sopravvive al ricaricamento) finché non si salva. Le componenti personali si rinominano,
duplicano, eliminano, importano ed esportano in JSON dalla *Mia libreria*.

## BottomNavigation

Componente generica estratta dalla navbar dimostrativa. La navbar del Material Lab **è** ora il
template BT Darts di questa componente (`src/stage/navbar.ts` è un adattatore che conserva classi
e colori del tema del laboratorio): un solo codice per la demo, il builder e l’export, coperto dai
18 test e2e della navbar che già esistevano.

```
nav.jello-bnav               una superficie di materiale per tutta la barra
  span.jello-surface         dal MaterialGroup
  div.jello-bnav-track       scorre in orizzontale in overflow
    span.jello-bnav-indicator  strato visivo, non una seconda lente
    button.jello-bnav-tab × n  icona + etichetta, mai filtrate né scalate
```

- **Materiale**: la componente chiede un `MaterialGroup` (`src/runtime/materials.ts`) e non
  importa mai il renderer Glass (verificato in `tests/unit/boundaries.test.ts`). Senza GlassSource il
  gruppo usa il backend CSS e lo dice in `status.reasons`.
- **Selezione e pressione** separate: selezione persistente (`aria-current` o `aria-selected`),
  pressione transitoria (`data-pressed`, luce di contatto); uscire dalla tab prima di rilasciare
  non seleziona.
- **Modello controllato** (`controlled: true` / prop React `activeTab`) e **non controllato**
  (`defaultActiveTab`).
- **Eventi** dichiarativi: `change`, `press`, `reselect` come callback e come `CustomEvent` DOM
  con nomi configurabili; dettaglio `{ tabId, previous, value, index, trigger }`. Nessun router.
- **Semantica**: `navigation` (landmark `nav`, `aria-current="page"`) o `tabs` (`tablist`,
  `aria-selected`, focus a rotazione). Frecce, Home, Fine spostano il focus; Spazio/Invio attivano.
  Le etichette nascoste restano il nome accessibile. Tab disabilitate: `aria-disabled`, restano
  raggiungibili.
- **Overflow**: nessun limite al numero di tab. Sotto `minTabWidth` (≥ 44 px) le tab scorrono
  (`scroll`) o perdono l’etichetta (`compress`).
- **Responsive**: breakpoint sulla larghezza del contenitore (finestra per l’ancoraggio
  `viewport`), applicati dal più largo al più stretto (`resolveRoot`, puro).
- **Accessibilità e preferenze**: focus sempre visibile; `prefers-reduced-motion` (e il movimento
  ridotto del laboratorio) azzera le transizioni e la scala; trasparenza ridotta, contrasto alto e
  colori forzati passano dal materiale (superficie opaca) e dal CSS della componente.
- **Risorse**: `unmount()` rilascia superficie (la lente esce dal filtro), listener e observer;
  `destroy()` anche il DOM e il gruppo, se creato dalla componente.

## Documento `jello-component`

Lo stesso formato per builder, libreria, export e — in futuro — CLI, server MCP e agenti AI.

```jsonc
{
  "format": "jello-component", "schemaVersion": 1,
  "type": "bottom-navigation", "typeVersion": 1,
  "id": "bt-darts", "name": "BT Darts", "runtime": { "min": "0.2.0" },
  "material": { "family": "glass", "preset": "navbar", "document": { /* jello-material v2 completo */ } },
  "root": {
    "kind": "bottom-navigation", "id": "root", "label": "Navigazione principale",
    "semantics": "navigation", "defaultTab": "home",
    "layout": {…}, "appearance": {…}, "typography": {…}, "icon": {…},
    "states": { "active": {…}, "hover": {…}, "pressed": {…}, "focus": {…}, "disabled": {…} },
    "interactions": { "pressFeedback": true, "wheelForward": true, "reselect": "event",
                      "events": { "change": "jello-change", "press": "jello-press", "reselect": "jello-reselect" } },
    "motion": {…},
    "responsive": { "overflow": "scroll", "minTabWidth": 56, "breakpoints": [ { "id": "compact", "maxWidth": 360, "overrides": { "layout.labels": "active" } } ] },
    "children": [ { "kind": "tab", "id": "home", "label": "Home", "icon": { "kind": "builtin", "name": "home" },
                    "value": null, "disabled": false, "style": { "iconSize": null, "fontSize": null, "fontWeight": null, "letterSpacing": null } } ]
  },
  "meta": { "createdAt": null, "updatedAt": null, "basedOn": "bt-darts", "notes": "" }
}
```

- **Una tabella di descrittori** (`BN_FIELDS`, `src/components/bottom-navigation/model.ts`) dà
  per ogni proprietà percorso, sezione dell’inspector, etichetta, unità, intervallo, passo e default:
  validazione, controlli dell’editor e README dell’export sono generati da lì.
- **Il materiale viaggia dentro la componente**: riaprire o esportare dà lo stesso risultato anche
  se il preset di origine cambia o viene eliminato; `material.preset` conserva il legame.
- **Nessuna funzione nel JSON**: le interazioni sono nomi di eventi e valori delle tab.
- **Validazione** (Zod per involucro, tab e breakpoint; descrittori per le proprietà): atomica,
  con tutti i motivi. Valore mancante → default + avviso; sconosciuto → ignorato + avviso; non valido
  → documento rifiutato. Id delle tab unici, `defaultTab` esistente, SVG ripuliti di nuovo.
- **Migrazioni**: `ENVELOPE_MIGRATIONS` (per `schemaVersion`) e `TYPE_MIGRATIONS` (per
  `typeVersion` di ogni tipo) sono catene di passi `n → n+1`; versioni più recenti rifiutate con un
  messaggio. Oggi la versione 1 è l’unica pubblicata, quindi le tabelle sono vuote; il materiale
  incluso usa le migrazioni esistenti (un `jello-glass` v1 dentro una componente viene migrato).
  Una versione 2 aggiungerà il passo e un test che legge un documento v1 salvato.
- **Persistenza**: IndexedDB versione 3 aggiunge lo store `components`; i dati delle versioni 1–2
  restano. Ogni componente letta viene rivalidata; quelle illeggibili sono elencate, non scartate in
  silenzio.

## Icone SVG caricate

`src/components/icons.ts`: l’SVG non viene mai inserito come markup. È analizzato in un albero di
elementi ammessi (`g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`) e
attributi ammessi (geometria e presentazione, valori controllati), poi riscritto; il renderer crea i
nodi con `createElementNS`. Rifiutati con motivo: script, attributi `on*`, `href`/`xlink:href`,
`style`, `url(…)`, entità, DOCTYPE, CDATA, `foreignObject`, `image`, `use`, testo, file > 16 KB.
Il tipo di disegno (tratto o riempimento) è rilevato e applicato con `currentColor`.

## Registri

- `src/model/registry.ts` — **materiali**: id, nome, versione, schema dei parametri, default, preset,
  backend con requisiti, catena di fallback, informazioni per l’export. Registrato: Glass. Gel/Jelly
  è una famiglia *pianificata*: mostrata come «in sviluppo», non registrabile.
- `src/runtime/materials.ts` — runtime dei materiali per famiglia (`createMaterialGroup`).
- `src/components/registry.ts` — **tipi di componente**: Bottom Navigation disponibile; Desktop
  Navbar, Floating Dock, Flyout Menu elencati come «in arrivo», senza implementazioni fittizie.

## Limiti attuali

- Un solo tipo di componente (Bottom Navigation) e un solo materiale (Glass).
- Nessun drag-and-drop nella struttura: riordino con ←/→ (accessibile da tastiera).
- Il builder non ha il confronto A/B né la scena WebGL2 (la componente è DOM).
- La barra *agganciata* usa raggio 0: la lente ha un raggio unico, non solo gli angoli superiori.
- Badge, sottomenu e tab con link (`<a href>`) non sono ancora previsti dallo schema.
