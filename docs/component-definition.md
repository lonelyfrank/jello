# Component Definition: il formato canonico

`jello-component-definition` v1 è **l'unico formato di componente** di Jello. Builder, libreria,
progetti `.jello`, export e runtime lo leggono e lo scrivono. Il vecchio `jello-component`
(tipo `bottom-navigation`) esiste solo come formato *in ingresso*: lo legge un importatore che lo
converte (vedi [Conversione](#conversione-dai-formati-precedenti)) e nessun altro punto
dell'applicazione lo conosce.

Codice: [`src/components/definition.ts`](../src/components/definition.ts) (schema, validazione,
tipi), [`navbar.ts`](../src/components/navbar.ts) (proprietà della Mobile Navbar),
[`templates.ts`](../src/components/templates.ts) (template, legame col materiale),
[`src/migration/`](../src/migration/) (importazione dei formati precedenti).

## Perché uno solo

Il Component Engine ([M2](component-engine.md)) renderizza Button, Mobile Navbar e Desktop Navbar (Input resta pianificato) dalla stessa descrizione. Due formati
avrebbero voluto dire due modelli da mantenere, due validatori e conversioni a ogni passaggio. Il
formato di M1 (`jello-component-definition`, ancora non rilasciato) è stato consolidato aggiungendo
ciò che `jello-component` portava e che il Builder usa davvero: layout, stile, stati di
componente, comportamento, breakpoint. Ora un file vecchio e uno nuovo, una volta letti, sono lo
stesso oggetto.

## Schema

```jsonc
{
  "format": "jello-component-definition", "schemaVersion": 1,
  "type": "mobile-navbar", "typeVersion": 1,
  "id": "mobile-navbar", "name": "Mobile Navbar", "runtime": { "min": "0.3.0" },

  // COMPONENTE: di che cosa è fatta (ruoli, nessun testo, nessuno stile)
  "structure": { "id": "root", "role": "navbar", "children": [
    { "id": "home", "role": "item", "children": [ { "id": "home-icon", "role": "icon" }, { "id": "home-label", "role": "label" } ] }
  ] },

  // CONTENUTO: che cosa dice e a che cosa punta, per id di nodo
  "content": {
    "root": { "text": "Navigazione principale" },
    "home": { "value": "/home", "disabled": false },
    "home-icon": { "icon": { "kind": "builtin", "name": "home" } },
    "home-label": { "text": "Home" }
  },

  // LAYOUT: dove e quanto grande; come cambia con la larghezza
  "layout": { "anchor": "viewport", "placement": "floating", "height": 64, "radius": "capsule" /* … */ },
  "responsive": { "overflow": "scroll", "minTabWidth": 56, "breakpoints": [ { "id": "compact", "maxWidth": 360, "overrides": { "layout.labels": "active" } } ] },

  // STILE: aspetto che non è del materiale
  "style": { "appearance": {…}, "typography": {…}, "icon": {…}, "motion": {…}, "items": { "home": { "iconSize": 26 } } },

  // MATERIALE E PARAMETRI
  "material": { "family": "glass", "preset": "navbar", "revision": "1a2b3c4d", "params": {}, "document": { /* jello-material v2 */ } },

  // STATI: che cosa cambia per stato (stile del componente e/o parametri del materiale)
  "states": { "hover": { "style": { "background": "#ffffff38" } }, "active": { "style": {…}, "material": { "fill": "#2563eb" } } },

  // INTERAZIONI: che cosa riporta all'applicazione (mai funzioni)
  "interactions": { "behavior": { "semantics": "navigation", "defaultItem": "home", "pressFeedback": true, "wheelForward": true, "reselect": "event" },
                    "events": { "change": "jello-change", "press": "jello-press", "reselect": "jello-reselect" } },

  "meta": { "createdAt": null, "updatedAt": null, "basedOn": "mobile-navbar", "notes": "" }
}
```

| Sezione | Contiene | Non contiene |
| --- | --- | --- |
| `structure` | albero di nodi `{ id, role, children? }`, validato dagli slot del tipo | testo, icone, stile, valori |
| `content` | per id: `text`, `icon` (incluse o SVG ripulito), `value`, `href`, `disabled`, `inputType`, `placeholder` | gerarchia |
| `layout`, `responsive` | proprietà descritte del tipo (intervalli, unità, default) e breakpoint con le loro sostituzioni | contenuti, colori del materiale |
| `style` | aspetto non materiale: colori del testo, tipografia, icone, indicatore, movimento, sostituzioni per voce | parametri del materiale |
| `material` | famiglia, preset, revisione, parametri, documento incluso | contenuti |
| `states` | per stato: `style` (componente) e `material` (override dei parametri della famiglia) | |
| `interactions` | `behavior` (interruttori del tipo) ed `events` (trigger → nome di evento DOM) | funzioni |

L'ordine delle chiavi, in `serializeDefinition`, è fisso: gli export sono leggibili in un diff.

### Tipi

Dichiarati in `DEFINITION_TYPES`. `button`, `mobile-navbar` e `desktop-navbar` hanno renderer
(`implemented: true`, registrati in `COMPONENTS`). Desktop offre anteprima tecnica;
editor completo e adapter React/Vanilla sono previsti per M5.3. `input` resta pianificato.

| Tipo | Radice | Slot | Stati | Trigger |
| --- | --- | --- | --- | --- |
| `button` | `button` (ammette `value`, `href`, `disabled`) | `label` 1, `icon` 0–1 | default, hover, pressed, focus, disabled | press, hover, focus |
| `mobile-navbar` | `navbar` | `item` 1–200 totali, anche dentro `group` a un livello (`icon`, `label` facoltativi) | + active | press, hover, focus, change, reselect, action |
| `desktop-navbar` | `navbar` | `brand` 0–1, `item` 1–200 totali anche raggruppati (etichetta o nome accessibile), `action` 0–4 | + active | press, hover, focus, change, reselect, action |
| `input` | `field` | `label` 0–1, `icon` 0–2, `control` 1, `helper` 0–1 | default, hover, focus, disabled | change, focus, submit |

`mobile-navbar` ammette da 1 a 200 voci (come `bottom-navigation`, che non aveva un massimo
pratico): un file valido prima non deve diventare non valido. Il nome accessibile della navbar è il
`text` della radice.

### Contenuti per ruolo

| Ruolo | Richiede | Ammette |
| --- | --- | --- |
| `navbar` | `text` (nome accessibile) | |
| `label`, `helper` | `text` | |
| `icon` | `icon` | |
| `group` | | `text` (etichetta opzionale) |
| `item`, `brand` | | `value`, `href`, `disabled`, `visible`, `action`, `iconPosition`, `accessibleLabel`, `description` |
| `action` | `value` | come `item` |
| `control` | `value` (nome del campo) | `inputType`, `placeholder`, `disabled` |

`value` è testo libero fino a 200 caratteri (una rotta, una chiave): l'identità di una voce è il suo
`id`, e due voci possono avere lo stesso `value`, come nel formato precedente. I `href` sono
percorsi (`/…`), ancore (`#…`) o URL http(s): niente `javascript:`.

### Proprietà della Mobile Navbar

Le proprietà descritte (`NAVBAR_FIELDS`, intervalli e default) hanno percorsi canonici:

| Percorso canonico | Nel vecchio formato |
| --- | --- |
| `layout.*`, `responsive.*` | `root.layout.*`, `root.responsive.*` |
| `style.appearance.*`, `style.typography.*`, `style.icon.*`, `style.motion.*` | `root.appearance.*`, `root.typography.*`, `root.icon.*`, `root.motion.*` |
| `states.<stato>.style.*` | `root.states.<stato>.*` |
| `interactions.behavior.{pressFeedback,wheelForward,reselect}` | `root.interactions.*` |
| `interactions.behavior.{semantics,defaultItem}` | `root.semantics`, `root.defaultTab` |
| `interactions.events.*` | `root.interactions.events.*` |
| `content.root.text` | `root.label` |
| `style.items.<id>.*` | `tab.style.*` |
| `responsive.breakpoints[].overrides` (chiavi canoniche, es. `style.typography.fontSize`) | stesse chiavi senza il prefisso `style.` / `states…style.` |

`definitionFields('mobile-navbar')` restituisce i descrittori con questi percorsi; è la tabella da cui
un Inspector del componente genera i controlli.

### Navbar Architecture (M5.1)

[Contratto e API completi](navbar-architecture.md). Il formato resta v1; struttura,
contenuti e materiali restano nelle stesse sezioni. I gruppi estendono l'albero con
un solo livello; le azioni sono `select`, `navigate` o `consumer`, senza callback
serializzati. Assenza di azione = selezione storica, anche nei documenti con `href`.
Visibilità/disabled e default sono persistenti; hover, focus e pressed appartengono
solo al runtime. `layout.icons`, `layout.distribution`, `layout.compact` sono
estensioni opzionali nei vecchi file. Il profilo Desktop ora valida layout,
regioni iniziali/finali, stile e responsive; da M5.2 il renderer dedicato li usa
nel runtime e nell'anteprima tecnica dello Stage.

`definitionFields(type, role)` prepara i controlli dei nodi nello stesso Inspector,
con `section`, `level` (Base/Avanzato) e `scope` (comune/Mobile/Desktop).

### Proprietà del Button

I percorsi del Button sono quelli del documento (`layout.size`, `style.variant`, `states.hover.style.background`,
`interactions.behavior.semantics`, `interactions.events.press`…): nessuna vista intermedia. Elenco, intervalli e
significato in [Component Engine](component-engine.md#button--cta); `definitionFields('button')` li restituisce.
`interactions.behavior.semantics: 'link'` richiede `content.root.href`.

## Materiale e parametri

`family` + `preset` + `params` descrivono il materiale **dal registro**: il preset incluso (o i
valori iniziali della famiglia) e i parametri cambiati sopra, validati dai descrittori della famiglia
scelta (`def.validateParams(…, { partial: true })`). La definizione non conosce le chiavi di nessuna
famiglia.

`document` (facoltativo) è un documento `jello-material` completo usato come base al posto del
preset: un materiale personale, o un preset modificato nella componente. Così la componente si
riapre ed esporta com'era anche se il preset cambia o viene eliminato; `revision` dice se il preset
si è mosso dopo (`bindingState`: collegato, modificato, da aggiornare, divergente, incluso).

`resolveDefinitionMaterial(definition)` produce il documento di materiale effettivo: documento incluso
(o preset, o valori iniziali) → `params` → `states.<s>.material`, tutto tramite `customize` del
registro. Se non c'è nulla da applicare restituisce la base *così com'è* (stessa identità), quindi i
confronti «il materiale è cambiato?» restano economici.

Il Builder modifica componenti con materiale Glass o Solid con lo stesso pannello. `style.variant: 'primary'`
(Button) chiede alla famiglia il suo **accento** (`MaterialDefinition.accent`) prima di applicare `params`:
l'ordine è documento incluso (o preset, o valori iniziali) → accento → `params` → `states.<s>.material`.
`glassMaterialOf` resta per chi gestisce solo Glass.

## Stati e compatibilità

Gli stati di una componente sono quelli del suo tipo (`default`, `hover`, `pressed`, `active`,
`focus`, `disabled`). `states.<s>.style` è lo stile del componente per quello stato;
`states.<s>.material` sovrascrive parametri del materiale e **richiede che il materiale renda quello
stato**: Solid rende hover, pressed, active e disabled; Glass rende solo la pressione. Uno stato che
il materiale non rende lo esprime lo stile del componente.

`materialCompatibility(tipo, famiglia)` lo dichiara per ogni coppia (stati resi dal materiale, stati
espressi dal componente, interazioni proprie del materiale, note). Oggi **tutte le coppie sono
compatibili**: i test lo verificano sulla matrice 4 tipi × 2 materiali.

## Vista derivata

Il renderer DOM e gli exporter leggono `navbarView(definition)`: la stessa informazione ordinata per
voce (`BnRoot`: tab con etichetta, icona, valore, stato, sovrascritture; sezioni; breakpoint). È
**derivata, in sola lettura, memorizzata per identità e mai salvata né scambiata**. Si modifica la
definizione:

- `setNavbarField(definition, percorsoCanonico, valore)` — una proprietà descritta, rifiutata se non valida;
- `editNavbar(definition, (vista) => …)` / `applyNavbarView(definition, vista)` — operazioni su voci e breakpoint
  (`addTab`, `moveTab`, `updateTab`, `addBreakpoint`…), riscritte nella definizione. Gli id degli
  slot esistenti si conservano; quelli nuovi derivano dall'id della voce (`<id>-icon`, `<id>-label`)
  e non collidono mai con altri id.

Applicare a una definizione la sua stessa vista non la cambia (test).

## Validazione

`parseDefinition` è atomica: restituisce tutti i motivi insieme o una definizione completa. Valore
mancante → default con avviso; sconosciuto → ignorato con avviso; non valido → rifiutata. Una
struttura rotta è riportata una volta sola (contenuti e proprietà che ne dipendono non si confrontano
con essa). Versioni più recenti (schema, tipo, runtime) sono rifiutate con un messaggio. SVG
personalizzati vengono ripuliti di nuovo a ogni lettura.

## Conversione dai formati precedenti

`importComponent(input)` / `importComponentText(text)` (in [`src/migration`](../src/migration/index.ts))
accettano la definizione canonica così com'è e convertono `jello-component` v1:

| Vecchio | Nuovo |
| --- | --- |
| `type: "bottom-navigation"` | `type: "mobile-navbar"` |
| `root.label` | `content.root.text` |
| `root.children[]` (tab) | `structure.children[]` voci; per ogni tab: nodo `icon` (se l'icona non è `none`) e nodo `label` (se l'etichetta non è vuota) |
| `tab.id` | id della voce, invariato |
| `tab.label` / `tab.icon` (incluso SVG) | `content.<id>-label.text` / `content.<id>-icon.icon`, byte per byte |
| `tab.value` / `tab.disabled` | `content.<id>.value` / `.disabled` |
| `tab.style` (non nullo) | `style.items.<id>` |
| `root.layout`, `appearance`, `typography`, `icon`, `motion`, `responsive` | `layout`, `style.*`, `responsive` |
| `root.states.*` | `states.*.style` |
| `root.interactions`, `semantics`, `defaultTab` | `interactions.behavior.*`, `interactions.events` |
| breakpoint: chiavi `typography.fontSize`, `icon.size` | `style.typography.fontSize`, `style.icon.size` (le altre invariate) |
| `material.{family,preset,revision,document}` | identico (`params: {}`) |
| `meta.basedOn: "bottom-navigation"` (o un template rimosso) | `"mobile-navbar"` |
| `runtime.min` | il runtime corrente (il formato richiede la 0.3.0) |

Il convertitore **riorganizza e basta**: il risultato passa da `parseDefinition`, la stessa validazione
di ogni file nuovo, quindi un vecchio file è accettato o rifiutato per gli stessi motivi (con percorsi
canonici). Il materiale incluso, se è un `jello-glass` v1, viene migrato come sempre.

Verifica: tre file reali scritti dalla versione precedente
([`tests/fixtures/legacy/`](../tests/fixtures/legacy/)) — il template, una componente molto
personalizzata (SVG, tab disabilitata, valori, stili per voce, breakpoint, eventi rinominati, materiale
personale) e una con id di un'altra applicazione. Per ognuno `navbarView(convertito)` coincide
**esattamente** con la `root` del file originale, il documento di materiale è identico e il risultato
sopravvive a serializza → leggi → serializza.

Dove entra: apertura del laboratorio (libreria in IndexedDB, bozza del progetto), importazione di file e
di pacchetti `.jello`. Una componente letta dallo storage è salvata in forma canonica al primo
salvataggio; nessuna migrazione del database è necessaria.

## Dati legacy

[`src/migration/legacy.ts`](../src/migration/legacy.ts) è un modulo di migrazione **isolato**: contiene
solo ciò che serve ad aprire dati già esistenti.

- preset `cable` e `bt` → bozza non salvata di `satin` / `navbar` con i parametri originali e un avviso;
- template `bt-darts` → `mobile-navbar` con avviso; `bottom-navigation` → `mobile-navbar` in silenzio
  (è lo stesso template, rinominato).

Non è elencato, selezionabile né esportato; **nessun nuovo progetto, componente o export usa quegli
identificativi**. Lo garantiscono i test sui confini (`tests/unit/boundaries.test.ts`): solo
`src/lab/` e gli importatori di progetto possono importarlo; runtime pubblico, modello, exporter,
stage, anteprima e libreria costruita non lo raggiungono né contengono quelle stringhe.

## Cambiamenti incompatibili

- **Formato:** `jello-component` non si scrive più. Le componenti salvate si leggono ancora; un file
  scritto da questa versione non si apre in una versione precedente.
- **API pubblica del runtime (`@jello/runtime`):** `ComponentDocument`, `parseComponent`,
  `parseComponentText`, `serializeComponent`, `createComponentDocument`, `withRoot`, `withRootField`,
  `COMPONENT_TYPES`, `componentType` non esistono più; al loro posto `ComponentDefinition`,
  `parseDefinition`, `parseDefinitionText`, `serializeDefinition`, `navbarView`, `applyNavbarView`,
  `setNavbarField`, `DEFINITION_TYPES`. `LEGACY_PRESETS`, `legacyPreset`, `LEGACY_TEMPLATES` non sono
  più esportati dal runtime (prima lo erano, con i parametri di Cable e BT).
- **`BottomNavigation` (la classe DOM)** non cambia nome né eventi; ora riceve una `ComponentDefinition`
  (`config`) invece di un `ComponentDocument`.
- **Template e nomi:** il template ufficiale è `mobile-navbar` («Mobile Navbar»). Un export nuovo si
  chiama `jello-mobile-navbar-react`, pacchetto `@jello-export/mobile-navbar`, componente
  `MobileNavbar`, tipo `MobileNavbarTabId`. I nomi derivano dal nome della componente: un export
  esistente non cambia, e una componente chiamata «Bottom Navigation» continua a produrre i nomi di
  prima.
- **`component.json` di un export** è la definizione canonica: chi legge `config.root.children` deve
  leggere `config.structure` e `config.content` (l'esempio `examples/react-consumer` mostra come).
- **Link:** `?component=bottom-navigation` e `?component=bt-darts` continuano ad aprire il template.
- **Eventi DOM e valori delle tab:** invariati (`jello-change`, `jello-press`, `jello-reselect`; `value`
  nell'evento).

## API

| Serve a | API |
| --- | --- |
| Leggere / scrivere una definizione | `parseDefinition`, `serializeDefinition`, `importComponent` (anche i vecchi formati) |
| Creare | `starterDefinition(tipo)`, `createNavbarDefinition`, `COMPONENT_TEMPLATES` |
| Sapere che cosa un tipo ammette | `DEFINITION_TYPES` (slot, stati, trigger, profilo), `definitionFields(tipo)` |
| Modificare le proprietà | `setNavbarField`, `getNavbarField`, `editNavbar` |
| Risolvere il materiale | `resolveDefinitionMaterial`, `glassMaterialOf`, `bindMaterial`, `bindingState` |
| Controllare materiale e tipo | `materialCompatibility(tipo, famiglia)` |
| Costruire un Inspector del materiale | `inspectorModel(def, doc)`, `applyControl(def, doc, bersaglio, valore)` ([Material Core](material-core.md#inspector-del-materiale)) |
| Rendere una componente | `createComponent({ container, config, source? })` (sceglie il renderer dal tipo); `BottomNavigation` e `JelloButton` direttamente |
| Registro dei componenti | `COMPONENTS`, `componentSpec(tipo)`, `unsupportedProperties(def)` ([Component Engine](component-engine.md)) |
| Cambiare materiale conservando il resto | `bindComponentMaterial`, `switchMaterialFamily` |

## Problemi aperti

- **Desktop Navbar** ha runtime, regioni, Glass/Solid e anteprima tecnica M5.2.
  Supporta navigation; tabs senza associazione pannelli sono rifiutate dal renderer.
  Editor completo e adapter React/Vanilla: M5.3. [Dettagli](desktop-navbar-renderer.md).
- **Input** ha lo schema ma non una tabella di proprietà né un renderer: `layout`, `style`,
  `responsive`, `states.<s>.style` e `interactions.behavior` vengono ignorati **con un avviso** (non più in
  silenzio). Per aggiungerli: una tabella di descrittori e un `profile` in `DEFINITION_TYPES`, il renderer in
  `runtime/components.ts` e una voce in `COMPONENTS`.
- **`BnRoot` come vista.** Il renderer e l'export React mantengono la vista Mobile
  derivata, mai salvata. Il Builder usa le operazioni canoniche condivise; le API
  precedenti della vista restano compatibili con gruppi e contenuti estesi. Il
  Button non ha una vista: legge i percorsi del documento.
- **Icone:** una definizione accetta icone incluse o SVG personalizzati; l'ordine tra icona ed etichetta nella
  struttura non determina la posizione (la decidono `layout.itemLayout` nella navbar e `layout.iconPosition` nel Button).
- **Nessuna migrazione tra versioni della definizione**: esiste solo la v1 (le tabelle di migrazione
  arriveranno con la v2, con un test che legge un documento v1 salvato).
- **Nome dei pacchetti esportati:** il cambio di nome del template cambia i nomi dei *nuovi* export
  (vedi sopra); non c'è un modo per chiedere i nomi precedenti se non rinominare la componente.
