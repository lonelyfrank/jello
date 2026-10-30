# Component Builder e componenti

Jello ha due modalità di lavoro, scelte nell’intestazione e condivise da un unico motore di anteprima:

- **Material Lab**: il laboratorio dei materiali di sempre (libreria, parametri, renderer,
  diagnostica, import/export), ora con Glass e Solid.
- **Component Builder**: configura una componente UI che *usa* un materiale, la salva nella libreria
  personale e la esporta.

Le due modalità usano lo stesso `PreviewController`, lo stesso stage (sorgente, scene di prova,
formati) e il runtime della famiglia scelta (GlassGroup o SolidGroup): il builder monta la componente al posto
dell’oggetto dimostrativo, non crea un secondo renderer (`tests/e2e/builder.spec.ts` lo verifica:
un solo filtro, una sola superficie dopo cambi ripetuti di modalità).

## Flusso

1. **Component Builder** → *Componenti → Template ufficiali Jello → Mobile Navbar*: la demo
   generica con tre tab (Home, Explore, Profile), tutta modificabile.
2. *Struttura* (colonna sinistra): seleziona la radice o una voce; **+ Tab**, ←/→ per riordinare,
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

## Materiali personalizzati nelle componenti

Ogni materiale della libreria — preset inclusi e materiali personali creati o modificati nel
Material Lab — si applica a una componente:

- dal **Material Lab**: *Usa nella componente* applica il materiale aperto alla componente aperta
  nel builder e passa al builder. Un preset incluso modificato ma non salvato diventa prima una
  copia personale («Salva e usa nella componente»), così la componente è legata a qualcosa che
  esiste nella libreria. Sotto il nome compare «Usato da N componenti».
- dal **builder**: menu *Materiale* nell’inspector, o *La mia libreria → Preset materiali salvati*.

Il materiale è **collegato** al preset (`material.preset` + `material.revision`, la revisione del
contenuto quando è stato applicato) e resta incluso nella componente:

| Stato | Quando | Cosa succede |
| --- | --- | --- |
| collegato | stesso contenuto del preset | le modifiche fatte nel Material Lab arrivano subito alla componente aperta; quelle salvate e chiuse si aggiornano al salvataggio automatico (o alla riapertura) |
| modificato | parametri cambiati nella componente | la componente tiene i suoi valori e non segue più il preset |
| preset cambiato | il preset è cambiato, la componente no | si allinea da sola |
| entrambi cambiati | modifiche in tutti e due | «Aggiorna dal preset» sostituisce i valori locali (scelta esplicita) |
| incluso | nessun preset, o preset eliminato | la componente usa la sua copia; export e riapertura non cambiano |

Nomi, parametri, qualità e backend contano per la revisione; id e date no. Eliminare un materiale
personale non rompe le componenti che lo usano: tengono la propria copia.

## BottomNavigation

Componente generica, definita da uno schema serializzabile senza valori legati a un progetto. La
navbar del Material Lab **è** il template ufficiale di questa componente (`src/stage/navbar.ts` è un
adattatore che conserva classi e colori del tema del laboratorio): un solo codice per la demo, il
builder e l’export, coperto dai test e2e della navbar.

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

## Documento della componente

Il builder, la libreria, i progetti, l'export e il runtime usano un solo formato:
`jello-component-definition`, descritto in [Component Definition](component-definition.md) (struttura,
contenuti, layout, materiale e parametri, stati, interazioni). Il vecchio `jello-component` (tipo
`bottom-navigation`) si può ancora aprire: viene convertito all'ingresso e salvato nella forma nuova.

In breve, per la Mobile Navbar (il tipo che il builder modifica oggi):

- **Una tabella di descrittori** (`BN_FIELDS`, [`src/components/navbar.ts`](../src/components/navbar.ts))
  dà per ogni proprietà percorso, sezione dell'inspector, etichetta, unità, intervallo, passo e
  default: validazione, controlli dell'editor e README dell'export sono generati da lì. I percorsi
  canonici sono in `NAVBAR_FIELDS` / `definitionFields('mobile-navbar')`.
- **Il materiale viaggia dentro la componente**: riaprire o esportare non dipende dalla libreria;
  `material.preset` e `material.revision` conservano il legame (sezione precedente). `revision` è
  facoltativo: un documento senza è considerato «modificato» e non segue il preset da solo.
- **Nessuna funzione nel JSON**: le interazioni sono nomi di eventi e valori delle voci.
- **Validazione atomica**, con tutti i motivi: valore mancante → default + avviso; sconosciuto →
  ignorato + avviso; non valido → rifiutato. Id delle voci unici, voce predefinita esistente, SVG
  ripuliti di nuovo.
- **Persistenza**: IndexedDB versione 3 ha lo store `components`; ogni componente letta viene
  rivalidata (e, se è nel formato precedente, convertita); quelle illeggibili sono elencate, non
  scartate in silenzio.

## Icone SVG caricate

`src/components/icons.ts`: l’SVG non viene mai inserito come markup. È analizzato in un albero di
elementi ammessi (`g`, `path`, `circle`, `ellipse`, `rect`, `line`, `polyline`, `polygon`) e
attributi ammessi (geometria e presentazione, valori controllati), poi riscritto; il renderer crea i
nodi con `createElementNS`. Rifiutati con motivo: script, attributi `on*`, `href`/`xlink:href`,
`style`, `url(…)`, entità, DOCTYPE, CDATA, `foreignObject`, `image`, `use`, testo, file > 16 KB.
Il tipo di disegno (tratto o riempimento) è rilevato e applicato con `currentColor`.

## Registri

- `src/model/registry.ts` — **materiali**: id, nome, versione, schema dei parametri, default, preset,
  backend con requisiti, catena di fallback, informazioni per l’export, capacità, stati e
  interazioni ([Material Core](material-core.md)). Registrati: Glass e Solid. Jelly è una famiglia
  *pianificata*: mostrata come «in sviluppo», non registrabile. Le componenti si disegnano con Glass o Solid:
  il cambio di materiale conserva contenuto, struttura, layout, stati e interazioni.
- `src/runtime/materials.ts` — runtime dei materiali per famiglia (`createMaterialGroup`).
- `src/components/registry.ts` — **componenti** (`COMPONENTS`): proprietà, valori iniziali, stati, interazioni,
  materiali compatibili, proprietà senza effetto per famiglia, renderer ed export ([Component Engine](component-engine.md)).
  Registrati: Button e Mobile Navbar. `DEFINITION_TYPES` (`definition.ts`) conserva lo schema anche di Desktop
  Navbar e Input, elencati come «in arrivo», senza implementazioni fittizie.
- `src/runtime/components.ts` — renderer dei componenti per tipo (`createComponent`).

## Libreria: ufficiale e personale

| | Dove | Modificabile |
| --- | --- | --- |
| **Template ufficiali Jello** | in codice (`COMPONENT_TEMPLATES`): *Mobile Navbar* e *Button* | no: le modifiche sono una bozza finché non si salvano |
| **Componenti salvate** | IndexedDB, store `components` | sì, salvataggio automatico |
| **Preset materiali personali** | IndexedDB, store `materials` | sì (Material Lab) |

Il template `bt-darts` della fase sperimentale non è più ufficiale, e `bottom-navigation` è il
vecchio nome di `mobile-navbar`. Un link o un progetto che nomina uno dei due apre *Mobile Navbar*
(per `bt-darts` con un avviso; per `bottom-navigation` in silenzio, è lo stesso template); una bozza non
salvata resta aperta, da salvare nella libreria. Le componenti personali che ne derivano — anche con id
`bt-darts`, se importate — restano componenti personali: non vengono cancellate né distribuite come
template. Le loro icone (`live`, `matrix`, `results`) restano nel set incluso per compatibilità. La
tabella è isolata in `src/migration/legacy.ts` ([Component Definition](component-definition.md#dati-legacy)).

## Limiti attuali

- Due tipi di componente con editor: Mobile Navbar e Button. Glass e Solid hanno entrambi un ciclo completo nel Material Lab e preset personali collegati.
- Nessun drag-and-drop nella struttura: riordino con ←/→ (accessibile da tastiera).
- Il builder non ha il confronto A/B né la scena WebGL2 (la componente è DOM).
- La barra *agganciata* usa raggio 0: la lente ha un raggio unico, non solo gli angoli superiori.
- Badge e sottomenu non sono previsti dallo schema; le tab della navbar non sono collegamenti (`<a href>`): il
  collegamento esiste nel Button (`semantics: 'link'`).

## Studio M3.1

La sinistra segue l’ordine Componenti, Materiali, Struttura, Libreria personale. Il wizard opzionale (Home o “Crea componente guidata”) propone Componente → Materiale → Personalizzazione, con anteprime dal runtime pubblico. I template sono generici.

La radice dell’Inspector ha sei sezioni: Contenuto, Layout, Aspetto (con tipografia), Materiale, Stati e interazioni, Responsive. Base mostra i controlli comuni; Avanzato rende accessibili le proprietà supportate e gli override del materiale. È un livello di presentazione, senza un secondo modello o perdita dei valori nascosti. Descrizioni, unità, intervalli, validazione e ripristino provengono dai descrittori. Le proprietà senza effetto sono segnalate con il motivo; forma e dimensioni del materiale sono controllate dal layout della componente.

Desktop, tablet, telefono e dimensioni personalizzate condividono lo stesso stage. Zoom 50–150%, ripristino, sfondo, Seleziona/Interagisci e simulazione degli stati supportati permettono di provare il componente. Button supporta Default/Hover/Pressed/Focus/Disabled; Navbar aggiunge Active sulla tab selezionata. Le simulazioni non modificano il documento.

Solid si salva anche dall’Inspector come preset personale. Le revisioni seguono le regole già usate da Glass: un collegamento senza override segue il preset; i valori locali restano protetti e “Aggiorna dal preset” rende esplicita la sostituzione. Il salvataggio allinea l’URL prima di dichiararsi concluso, per recuperare il lavoro anche con una ricarica immediata.

Le destinazioni sono React, Vanilla e JSON; il formato progetto `.jello` mantiene il lavoro dello Studio. Dettagli e limiti in [Export](export.md) e [report M3.1/M4.1](studio-completion.md).
