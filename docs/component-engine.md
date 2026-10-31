# Component Engine (Fase 1 · M2)

Da una componente (la Mobile Navbar) con un materiale (Glass) a un motore che costruisce componenti
indipendenti dal materiale. Questa pagina raccoglie le decisioni, le API, i test, le
incompatibilità e le attività residue. Il formato è [Component Definition](component-definition.md), i
materiali sono [Material Core](material-core.md): qui c'è ciò che li lega.

Questa pagina documenta M2. Studio React e completamento M3.1/M4.1 sono descritti nel [report Studio](studio-completion.md); Jelly, backend, account, AI e WordPress restano fuori ambito.

## Navbar Architecture (M5.1)

Il [Navbar Structure Engine](navbar-architecture.md) introduce operazioni pure e
validate sulla definizione canonica per entrambe le navbar: voci, identità, gruppi,
visibilità, disponibilità e azioni serializzabili. Riutilizza slot, icone,
descrittori, materiali e breakpoint. [Audit del codice](navbar-audit.md).
Il Builder Mobile usa queste operazioni; `BnRoot` resta la vista del suo renderer.
Desktop ha un profilo completo e validato, senza ereditare il posizionamento
inferiore. Da M5.2 è registrata in `COMPONENTS` con renderer dedicato, anteprima
nello stesso Stage; da M5.3 dispone di Builder visuale e capability JSON/React/Vanilla. [Desktop Renderer](desktop-navbar-renderer.md).

## Che cosa c'è

| Richiesta | Dove |
| --- | --- |
| Registro tipizzato dei componenti | [`src/components/registry.ts`](../src/components/registry.ts): `COMPONENTS`, `ComponentSpec`, `validateComponentSpec` |
| Button / CTA | [`src/components/button.ts`](../src/components/button.ts) (modello) · [`src/runtime/button.ts`](../src/runtime/button.ts) + `button.css` (renderer) |
| Legame col materiale | `MaterialDefinition.accent` ([registro dei materiali](../src/model/registry.ts)) · [`bindComponentMaterial`, `switchMaterialFamily`](../src/components/templates.ts) · [`MaterialBinding`](../src/runtime/surface-binding.ts) |
| Mobile Navbar con Solid | [`bottom-navigation.ts`](../src/runtime/bottom-navigation.ts) · `navbarPresentation` ([`navbar.ts`](../src/components/navbar.ts)) |
| Inspector condiviso | `inspectorModel`, `applyControl` e `ParamField` invariati; un solo pannello materiale in [`Builder.tsx`](../src/lab/app/Builder.tsx) |
| Proprietà non supportate | `BUTTON_UNSUPPORTED`, `NAVBAR_UNSUPPORTED`, `unsupportedProperties(def)` |
| Runtime ed export | [`src/runtime/components.ts`](../src/runtime/components.ts) · [`src/export/react.ts`](../src/export/react.ts), [`react-button.ts`](../src/export/react-button.ts), [`adapters.ts`](../src/export/adapters.ts) |

## Component Registry

```ts
COMPONENTS.list();                    // [button, mobile-navbar, desktop-navbar]            (registrati = disponibili)
COMPONENTS.planned();                 // [input]            (schema sì, implementazione no)
const spec = COMPONENTS.get('button');
spec.fields;                          // descrittori delle proprietà: percorso, tipo, unità, intervallo, default, sezione dell'inspector
spec.create();                        // una definizione nuova, valida, con i valori iniziali
spec.setField(def, 'layout.size', 'lg');   // → definizione | null (valore rifiutato, nulla cambia)
spec.states; spec.interactions;       // stati supportati · trigger → evento DOM predefinito
spec.materials;                       // { glass: { preset: 'jello' }, solid: { preset: 'solid-neutral' } }
spec.unsupported('solid');            // proprietà senza effetto con quella famiglia, con il motivo
spec.renderer.id; spec.export;        // renderer del runtime · formati, famiglie, eventi, note
```

`register` rifiuta, con tutti i motivi insieme (come il registro dei materiali), una voce con: un id già
registrato, un tipo che lo schema dichiara non implementato, un renderer non dichiarato, stati diversi da
quelli del tipo, una famiglia registrata senza preset iniziale o con un preset inesistente, una proprietà
«non supportata» che non è descritta, un `create()` che non rilegge se stesso senza avvisi, un valore iniziale
che `setField` rifiuta, `defaults()` diverso dai descrittori, nomi di evento non validi.

**Desktop Navbar** usa `DesktopNavigation` e `MaterialBinding`: tre regioni,
azioni select/navigate/consumer, tastiera, breakpoint, overflow e lifecycle.
Il Builder visuale e gli adapter React/Vanilla M5.3 montano lo stesso renderer.
[Consegna M5.3](navbar-m53-delivery.md). **Input** resta pianificato: il documento si legge, ma le
proprietà prive di renderer sono ignorate con un avviso.

Il runtime lega ogni voce al proprio renderer come fa per i materiali:
[`createComponent({ container, config, source? })`](../src/runtime/components.ts) sceglie la classe dal
`type`; `tests/unit/component-registry.test.ts` verifica che ogni voce abbia un runtime con lo stesso id e
viceversa.

## Button / CTA

Struttura `button` → `icon?` · `label`. Contenuto: testo (1–60 caratteri), icona (inclusa o SVG ripulito),
`root.href`, `root.value`, `root.disabled`.

| Gruppo | Proprietà (percorsi canonici) |
| --- | --- |
| Layout | `layout.size` (sm 36 · md 44 · lg 52 px) · `widthMode` (hug · fill · fixed) + `width` · `paddingX` · `paddingY` · `gap` · `radius` (px o capsula) · `align` (allineamento del contenuto) · `iconPosition` (start · end) |
| Aspetto | `style.variant` (primary · secondary · ghost) · `style.colors.{primary,secondary,ghost}` |
| Tipografia | `style.typography.{fontFamily,fontSize,fontWeight,letterSpacing}` · `style.icon.{size,strokeWidth}` |
| Stati | `states.hover.style.background` · `states.pressed.style.background` · `states.focus.style.{color,width,offset}` · `states.disabled.style.opacity` |
| Interazioni | `interactions.behavior.{semantics,pressFeedback}` · `interactions.events.{press,hover,focus}` |
| Responsive | `responsive.breakpoints[]` con sostituzioni di `layout.*` (size, widthMode, width, paddingX, paddingY, gap, align, iconPosition), `style.typography.fontSize`, `style.icon.size` |

I percorsi sono quelli del documento: leggere e scrivere una proprietà è `getPath` / `setPath` sulla
definizione, senza una vista intermedia (la Mobile Navbar conserva la sua vista `BnRoot`, vedi sotto).

**Elemento.** `semantics: 'action'` (predefinito) rende un `<button type="button">` che riporta la pressione
(`jello-press`, `onPress`); `'link'` rende un `<a href>` — richiede `content.root.href`, altrimenti la
definizione è rifiutata. Il componente **non naviga mai**: un'azione non ha una destinazione, un collegamento
lo segue il browser. Nell'anteprima del Builder i collegamenti sono inerti (`inertLinks`): la pressione è
riportata, l'editor non cambia pagina. Disabilitato: un `<button disabled>`; un collegamento perde `href`,
prende `role="link"`, `aria-disabled="true"` e `tabindex="-1"`. Nome accessibile: il testo; l'icona è
`aria-hidden`. Tastiera: Invio e Spazio attivano il pulsante, solo Invio il collegamento (come il browser).

**Varianti.** *Secondary* mostra il materiale **così com'è** (lo stesso documento: `resolveDefinitionMaterial`
restituisce la base per identità). *Primary* chiede alla famiglia il suo **accento** (`accent`, sotto). *Ghost*
mostra la superficie solo con hover, pressione e focus (`data-surface="rest" | "shown"`; il colore del
contenuto a riposo è `style.colors.ghost`, perché senza superficie legge sulla pagina).

**Stati.** Hover, premuto e disabilitato sono del materiale dove lo rende (Solid) e della componente dove no
(Glass: un velo `::after` e l'opacità); il focus è sempre della componente (anello con `:focus-visible`,
`outline` che vince sull'anello a specificità zero di `solid.css`). Anteprima senza input:
`previewState('root', 'hover' | 'pressed' | 'focus')`.

**Responsive.** Le soglie si valutano sulla larghezza del contenitore del pulsante
(`layoutParent().clientWidth`, saltando i wrapper `display: contents` come quello del componente React),
ricalcolata a ogni `ResizeObserver` e `resize`. Con larghezza non misurabile (nascosto) nessuna soglia vale.
Vince la più stretta tra quelle che coincidono. Con `widthMode: 'fill'` il pulsante segue il contenitore.

## Material Binding

Tre pezzi, nessuno dei quali disegna un materiale:

1. **`MaterialDefinition.accent`** — ogni famiglia dichiara che cosa fa per una componente che chiede enfasi:
   parametri e override di stato **suoi** (Glass: tinta blu profonda opaca; Solid: i valori del preset
   «accento» senza la forma) più una nota. La componente non conosce le chiavi di nessuna famiglia:
   `resolveDefinitionMaterial` applica `def.customize(base, def.accent)` se `style.variant === 'primary'`,
   poi `material.params`, poi gli override di stato. `validateDefinition` controlla l'accento di ogni famiglia
   (parametri validi, stati che la famiglia rende). Il contrasto del contenuto bianco sull'accento è
   verificato (≥ 4,5:1: Glass anche su sfondo bianco e nero, Solid in ogni stato).
2. **`bindComponentMaterial(def, binding)` / `switchMaterialFamily(def, famiglia)`** — sostituiscono il
   materiale e **conservano** struttura, contenuti, layout, responsive, stile, stile di ogni stato e
   interazioni. Ciò che appartiene al materiale precedente — `material.params` e `states.<s>.material`, chiavi di
   quella famiglia — si conserva se la famiglia resta la stessa e resta valido, si scarta se cambia, e il
   risultato elenca che cosa (`dropped`). Una famiglia che il tipo non supporta è rifiutata con un errore.
3. **`MaterialBinding`** (runtime) — crea il gruppo giusto (`createMaterialGroup`), dà alla componente una
   `BoundSurface` stabile (`setPressed`, `setHovered`, `setActive`, `setDisabled`, `setRadius`) e, se la
   famiglia cambia in `setMaterial`, sostituisce il gruppo e riattacca ogni superficie ripristinandone lo
   stato. Un gruppo Glass condiviso (quello dello stage del laboratorio) è usato finché il materiale è Glass e
   non è toccato altrimenti. `GlassSurface.destroy()` ora non lascia sull'ospite `data-jello-path`,
   `data-jello-sizing` né `--jello-host-radius`: cambiare materiale non lascia residui.

Solid non è Glass con la rifrazione spenta: non ha filtro SVG, mappa, `backdrop-filter` né canvas, e lo
verificano sia il test sul sorgente (M1) sia i test nel browser di M2 (`filter` e `backdrop-filter` calcolati
`none` sullo strato).

### Chi disegna che cosa

| | Glass | Solid |
| --- | --- | --- |
| Superficie | `.jello-surface` (SVG o CSS) | `.jello-solid` (variabili CSS) |
| Colore del contenuto | della componente (`style.colors.*`, `appearance.foreground`) | del materiale (`foreground`) |
| Hover / premuto / disabilitato | premuto: il materiale (luce, scala); hover e disabilitato: la componente | il materiale |
| Focus | la componente | la componente |
| Raggio | `layout.radius` → superficie | `layout.radius` → superficie (il parametro `radius` di Solid non è usato dalle componenti) |

## Proprietà non supportate: segnalate, non ignorate

Una proprietà descritta che una famiglia non può rendere è **dichiarata** in `BUTTON_UNSUPPORTED` /
`NAVBAR_UNSUPPORTED` con il motivo e dove si cambia la stessa cosa, ed è:

- **non scritta**: `buttonPresentation` e `navbarPresentation` (puri, senza DOM) restituiscono gli attributi e
  le variabili CSS che il renderer scrive; quelle non supportate non ci sono;
- **mostrata** nell'inspector (nota `data-unsupported` sotto il controllo e `#cmpUnsupportedList` nel pannello
  materiale);
- **riportata** da `status.unsupported` del componente montato, nell'avviso e nel README dell'export, nel
  manifest (`component.unsupported`) e nelle note del dialogo di esportazione.

| Componente | Famiglia | Senza effetto |
| --- | --- | --- |
| Button | Solid | `style.colors.primary`, `style.colors.secondary`, `states.{hover,pressed}.style.background`, `states.disabled.style.opacity` |
| Mobile Navbar | Solid | `style.appearance.foreground`, `style.appearance.indicator.color`, `style.appearance.textShadow`, `interactions.behavior.pressFeedback` |
| Button, Mobile Navbar | Glass | nessuna |

Il test `tests/unit/button.test.ts` / `component-registry.test.ts` percorre **ogni** proprietà descritta, la
cambia in un valore valido e controlla che ciò che il renderer scrive cambi **se e solo se** la proprietà non
è nell'elenco: l'elenco non può né nascondere una proprietà che non funziona né dichiarare ignorata una che
funziona. Le sole proprietà escluse sono quelle di comportamento (nomi degli eventi, `pressFeedback`,
`wheelForward`, `reselect`), verificate nel browser.

Altre cose che prima sparivano e ora producono un avviso alla lettura: `states.<s>.style` e
`interactions.behavior` di un tipo senza tabella delle proprietà; chiavi sconosciute in `layout`, `style`,
`states.<s>.style`, `interactions.behavior`, `responsive` del Button (come già per la navbar).

## Mobile Navbar con Solid

La navbar usa `MaterialBinding`: stessi tab, stato attivo (`aria-current` / `aria-selected`), tab
disabilitate, icone, testi, tastiera (frecce, Home, Fine, Invio, Spazio), overflow e breakpoint. Con Solid:

- il contenuto delle tab è `--jsolid-fg` (parametro `foreground` del materiale: contrasto garantito dai
  preset); il colore della tab attiva resta `states.active.color`, scelto da chi usa il componente (con
  `solid-dark` il valore iniziale `#0a54bd` non contrasta: è a carico di chi sceglie i valori);
- l'indicatore è tinto con il colore della tab attiva (14 %), così si vede su qualunque riempimento;
- la barra non «si abbassa» alla pressione: il feedback è lo sfondo della tab premuta;
- nessun alone di testo.

`BnRoot` resta la **vista interna** del renderer e degli exporter: derivata, in sola lettura, memorizzata per
identità, mai salvata né scambiata. Non è stata sostituita: sarebbe stato un refactor senza beneficio per M2.

Trovato e corretto durante M2: il `focusout` terminava la pressione anche quando il focus passava a un'altra
tab della stessa barra (clic su una tab con il focus su un'altra: lo stato premuto lampeggiava e spariva). Ora
solo il focus che esce dalla barra la termina.

## Inspector condiviso

Un solo pannello materiale (`MaterialPanel`) per ogni famiglia, costruito da `inspectorModel(def, doc)`:
famiglia (select), preset della famiglia, controlli per gruppo (`ParamField`, lo stesso componente di Glass e
Solid), override per stato (per le famiglie che li hanno: id `param-<stato>-<chiave>`), ripristino, note di
collegamento al preset, rendering limits e proprietà senza effetto. Un controllo modificato va tramite
`applyControl` (validazione, valori non validi e chiavi sconosciute rifiutati con il motivo) e viene
memorizzato **come override della componente** — `material.params` o `states.<s>.material` — sopra il
materiale collegato: il preset e l'accento della variante restano ciò che sono e «Ripristina» toglie gli
override. `bindingState(binding, preset, overridden)` considera un override locale come modifica
(`modified` / `diverged`).

Per una componente sono nascosti i controlli che non usa: il gruppo `shape` di ogni famiglia (dimensione e
forma vengono dal layout) e, per Glass, la fisica del trascinamento (solo `pressScale`, `pressRefraction`,
`pressLight`). Il cambio materiale è nel pannello (`#cmpFamily`, `#cmpMaterial`) e nella colonna sinistra
(«Materiali»: tocca una famiglia per disegnare la componente con essa). La barra laterale e l'inspector non
sono ancora il layout a tre colonne di M3.

## Runtime ed export

`createComponent` / `mountComponent` ([`runtime/components.ts`](../src/runtime/components.ts)) sono l'unico
modo in cui l'anteprima dello stage e i wrapper esportati creano una componente. L'export React ha un wrapper
per tipo (`react.ts` per la navbar, `react-button.ts` per il Button) che **monta il renderer del runtime**
(`createBottomNavigation`, `createButton`) e lascia a React una sola scatola `display: contents`: non esiste
una seconda implementazione del renderer per l'export. Il pacchetto contiene `component.json` (la
definizione che salva il laboratorio, byte per byte), `material.json` (il materiale risolto, di qualunque
famiglia), il runtime, sorgente TSX e tipi, esempio, README e manifest.

- Props del Button: `label` · figlio testuale, `disabled`, `onPress`, `onHover`, `onFocus`, `sourceRef`
  (GlassSource, solo Glass), `backend`, `className`, `config`. Tipo `…Variant`.
- Il manifest e il README includono la famiglia, i backend (nessuno per Solid: è solo CSS) e le proprietà
  senza effetto.
- Gli adapter `material-runtime` e `material-css` restano di Glass e dicono perché rifiutano Solid; il JSON
  del materiale e della componente accettano ogni famiglia.
- Il formato è serializzato con ordine fisso anche per `content` (nell'ordine della struttura), quindi una
  definizione si legge allo stesso modo comunque sia stata modificata.

## Stabilità

**`builder.spec.ts › a material customised in the Material Lab…`.** Due cause, entrambe corrette:

1. un difetto del prodotto, riprodotto da un test unitario deterministico (`tests/unit/autosave.test.ts`):
   `Autosaver.flush()`, chiamato mentre una scrittura del timer era in corso, ritornava al termine di
   *quella* scrittura, fatta dallo stato precedente. Chi aspettava `flush()` (il test, la chiusura della
   pagina) poteva ricaricare il vecchio stato. Ora `flush()` attende le scritture in corso e ne esegue una
   nuova dello stato attuale;
2. due letture senza attesa in un test dopo un clic che completa in modo asincrono (il pulsante «Usa nella
   componente» salva, poi applica il materiale, poi cambia area). Ora le letture sono `expect.poll` sulla
   condizione, non sul tempo. Nessun timeout aggiunto.

## API (riepilogo)

| Serve a | API |
| --- | --- |
| Registro | `COMPONENTS`, `ComponentSpec`, `componentSpec(id)`, `validateComponentSpec`, `unsupportedProperties(def)` |
| Button (modello) | `BUTTON_FIELDS`, `resolveButton(def, larghezza)`, `buttonPresentation(props, famiglia)`, `setButtonField`, `setButtonText`, `setButtonIcon`, `setButtonLink`, `setButtonDisabled`, `setButtonValue`, `addButtonBreakpoint`, `updateButtonBreakpoint`, `removeButtonBreakpoint` |
| Legame | `bindComponentMaterial`, `switchMaterialFamily`, `hasMaterialOverrides`, `bindingState(…, overridden)`, `MaterialDefinition.accent` |
| Runtime | `JelloButton` / `createButton`, `createComponent` / `mountComponent` / `componentRuntime`, `MaterialBinding` / `BoundSurface`, tipo `ComponentInstance` |
| Navbar | `navbarPresentation(vista, famiglia, …)`, `NAVBAR_UNSUPPORTED` |
| Lab | `session.setComponentControl`, `setComponentFamily`, `applyMaterialPreset`, `setButton*`, `window.__jello.builder.{setControl,setFamily,applyPreset}` |

## Incompatibilità

- **`bindingState(binding, preset)`** ha un terzo parametro facoltativo (`overridden`); senza, risponde come prima.
- **`MaterialGroup` / `BottomNavigation`**: `glassSurface` e `materialGroup` valgono `null` quando il materiale non è
  Glass; `status.material` è `MaterialStatusBase` (con i campi di Glass quando c'è un gruppo Glass). Nuovo
  `materialSurface` (qualunque famiglia). `PreviewState` è ora in `runtime/component-types`.
- **`Stage.showComponent`** / **`PreviewController.showComponent`** prendono qualunque definizione e restituiscono
  un `ComponentInstance`.
- **`MaterialDefinition.accent`** è obbligatorio: una famiglia nuova (Jelly) deve dichiararlo.
- **Le modifiche ai parametri del materiale in una componente** sono ora salvate come `material.params` /
  `states.<s>.material` invece di essere incorporate nel documento del materiale: i file scritti prima si leggono
  come sempre (hanno un `document`); i file nuovi hanno `document` (copia del preset) e `params`.
- **Template:** il Builder offre `mobile-navbar` e `button`; un test che contava un solo template è stato aggiornato.
- **Il consumer di prova** (`examples/react-consumer`) installa tre pacchetti (navbar, un Button Glass, un
  Button Solid collegamento); `scripts/prepare-consumer.mjs` riscrive `tsconfig.json` con le loro sorgenti.

## Attività residue

- **Colori e contrasto**: con Solid, il colore della tab attiva e i colori di stato della navbar restano scelti da chi
  usa il componente; non c'è un controllo di contrasto nell'inspector.
- **Il Button non ha badge, stato di caricamento, gruppo o variante «destructive»**: non erano richiesti.
- **Glass senza `source`** (CSS): nessuna rifrazione, come per la navbar; il Button lo dice in `status`.
- **WebKit** non è stato eseguito (vedi [Compatibilità](compatibility.md)).
- **Jelly** deve fornire `accent` e un renderer nella `RUNTIMES` di `materials.ts` e nel `surface-binding`
  (la checklist di Material Core è aggiornata).
- Desktop editor/export completati in M5.3; Input resta pianificato.
