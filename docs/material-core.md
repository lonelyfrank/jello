# Material Core (Fase 1 · M1)

Da laboratorio Glass a architettura multi-materiale, senza toccare il motore Glass. Questa pagina
raccoglie le decisioni, le API e i limiti noti; il modello ottico e i parametri di Glass restano in
[Modello del materiale](material-model.md).

Jello non è un page builder: i materiali servono a costruire **componenti UI con un materiale
caratteristico**. Niente React, WordPress, backend o AI in questa milestone, e nessuna dipendenza nuova.

## Cosa c’era già e cosa è cambiato

| Richiesta | Stato prima | In M1 |
| --- | --- | --- |
| Registro tipizzato dei materiali | `MaterialRegistry` con la sola Glass (schema, preset, backend, export) | Esteso: capacità, stati, interazioni, controlli dell’editor, validazione dei parametri, hook `customize`, renderer dichiarato, **controllo di coerenza** (`validateDefinition`) |
| Descrittori dei parametri | Solo Glass, chiavi e stadi fissi in `core/params.ts` | Tipi e funzioni **generici** in `core/descriptors.ts`; `params.ts` li specializza e li riesporta, API invariata |
| Glass come primo materiale | Registrata | Invariata (stessi 24 parametri, stessi preset, stesso runtime `0.2.0` nei suoi documenti) |
| Solid | — | Famiglia autonoma (`model/solid.ts`, `runtime/solid-group.ts`, `runtime/solid.css`) |
| Jelly | «Gel», famiglia pianificata | Rinominata **Jelly**; il contratto è la definizione + la regola di registrazione, nessuna implementazione |
| Preset Cable/BT | Già fuori dalla libreria e dalle demo | Nulla da rimuovere; vedi [Preset](#preset) per ciò che resta |
| Component Definition | Solo `jello-component` (Bottom Navigation) | Nuovo schema `jello-component-definition` v1 con i quattro tipi |

## Livelli

```
 core/descriptors.ts     tipi di descrittore · checkValue · checkKeys · defaultsOf        (generico)
        │
 core/params.ts          tabella Glass (24 chiavi)          model/solid.ts   tabella Solid (12 + 6 per stato)
        │                                                          │
 model/glass.ts, document.ts  documento Glass               model/solid.ts   documento Solid, stati, resolveSolid
        └──────────────┬───────────────────────────────────────────┘
                 model/registry.ts     MaterialDefinition · MATERIALS · validateDefinition · controlGroups
                       │
                 model/migrate.ts      parseMaterial (per famiglia) · parseGlassMaterial (solo Glass)
                       │
                 runtime/materials.ts  createMaterialGroup (sovraccarichi per famiglia) · materialRuntime
                       ├── glass-group.ts   GlassGroup  (SVG / CSS, motore esistente)
                       └── solid-group.ts   SolidGroup  (variabili CSS, nessun filtro)
                 components/definition.ts   struttura · contenuti · materiale · stati · interazioni
```

Il modello (`src/model`, `src/components`) resta puro, senza DOM; il DOM sta solo in `src/runtime`.
I confini sono controllati da `tests/unit/boundaries.test.ts`.

## Descrittori generici

`core/descriptors.ts` contiene ciò che prima era dentro `params.ts` e non dipendeva da Glass:

- `NumberDescriptor`, `EnumDescriptor`, `ColorDescriptor` (e l’unione `Descriptor`), parametrizzati
  da chiave, stadio (`affects`) e gruppo. Con i parametri predefiniti sono stringhe qualsiasi;
  `params.ts` li fissa su chiavi, stadi e gruppi di Glass (`ParamDescriptor` è lo stesso tipo di prima).
- `checkValue`, `onStep`, `parseNumberInput`: invariati, riesportati da `params.ts`.
- `defaultsOf(tabella)` e `checkKeys(tabella, valori, { scope, partial, elsewhere })`: la politica
  comune di validazione, prima duplicata in `checkSection` di Glass. Valore non valido → errore
  (il documento è rifiutato per intero); chiave assente → valore iniziale (avviso, o niente con
  `partial`); chiave sconosciuta → ignorata (avviso). I colori sono normalizzati in minuscolo.
  `checkSection` di Glass ora delega a `checkKeys` e produce gli stessi messaggi di prima.

Non è stato aggiunto un tipo booleano né descrittori «compositi»: nessuna famiglia ne ha bisogno oggi.

## Registro dei materiali

Una `MaterialDefinition` dichiara:

| Campo | Contenuto |
| --- | --- |
| `id`, `name`, `version`, `description`, `document` | identità, versione delle sezioni della famiglia, formato `jello-material` v2 |
| `params`, `groups` | tabella dei parametri e gruppi dell’editor, in ordine (`controlGroups(def)` li deriva) |
| `stateParams`, `states` | chiavi sovrascrivibili per stato e stati resi (`default` è sempre il primo) |
| `interactions`, `features` | `press`, `hover`, `drag` · `backdrop`, `refraction`, `border`, `shadow`, `elevation`, `states`, `press`, `drag`, `transitions` (+ `physics`, `deformation`, `bubbles` riservate a Jelly) |
| `defaults()`, `create()`, `validateParams()`, `customize()` | valori iniziali, documento nuovo, validazione dei parametri piatti, applicazione di parametri e override a un documento |
| `accent` | parametri e override di stato propri della famiglia per una componente che chiede enfasi (un Button Primary), con una nota: la componente chiede, la famiglia decide ([Component Engine](component-engine.md#material-binding)) |
| `parse()`, `serialize()` | lettura atomica e scrittura con ordine delle chiavi stabile |
| `presets` | preset inclusi della famiglia |
| `capabilities`, `fallbacks` | backend con requisiti e catena di fallback (vuoti per Solid: è solo CSS) |
| `renderer` | id del renderer; `runtime/materials.ts` lo lega allo stesso id |
| `export` | modulo, entry, CSS e `minRuntime` della famiglia |

`MaterialRegistry.register` rifiuta: un id già registrato, una famiglia non `available`, una
definizione che non supera `validateDefinition` (gruppi non dichiarati, valori iniziali non validi,
interazioni senza la capacità corrispondente, preset di un’altra famiglia o che non rileggono se
stessi, `create()` che non rilegge se stesso, `customize()` che con i valori iniziali cambia il
documento, renderer mancante…). I messaggi elencano tutti i problemi.

`tests/unit/registry.test.ts` verifica anche che **ogni definizione abbia un runtime con lo stesso
id di renderer e viceversa**, quindi non si può registrare un materiale che nessuno sa disegnare.

### Aggiungere una famiglia (checklist, vale per Jelly)

1. `FamilyInfo` in `families.ts` (`status: 'available'`, `version`, `editor`).
2. Un file `model/<famiglia>.ts` con tabella dei parametri, sezioni, tipo del documento, `create…`,
   `validate…Document`, preset; il tipo entra nell’unione `MaterialDocument` (`document.ts`) e
   `parseMaterial` lo instrada per `family`.
3. Una `MaterialDefinition` registrata in `registry.ts`; deve passare `validateDefinition`.
4. Un gruppo in `runtime/<famiglia>-group.ts` e una voce in `RUNTIMES` (`runtime/materials.ts`) con
   lo stesso id di renderer, più un sovraccarico di `createMaterialGroup`.
5. Un minimo di runtime in `FAMILY_MIN_RUNTIME` (`version.ts`) e test come quelli di Solid.
6. `accent` (che cosa fa la famiglia per un Button Primary): `validateDefinition` lo richiede e controlla.
   Le componenti non cambiano: passano da `MaterialBinding` e dal registro (`COMPONENTS.materials` elenca il preset iniziale di ogni famiglia).

## Glass: cosa è stato preservato

Nessun file del motore (`src/core/context.ts`, `surface.ts`, `geometry.ts`, `renderer/*`,
`src/runtime/glass-group.ts` salvo la firma dei tipi) è stato riscritto. Invariati:
`GlassContext`, `GlassSurface`, `createGlassGroup`, `engineParams`, `bindPress`/`bindDrag`,
`createSceneView`, `BottomNavigation`, i 24 parametri, i 5 preset, i fallback, le ottimizzazioni e
le interazioni. `tests/unit/registry.test.ts` («Glass compatibility» e «public runtime API»)
controlla parametri, preset, ordine, versione minima e simboli esportati.

Cambiamenti **di tipo** che chi usa le API deve conoscere:

- `MaterialDocument` è ora l’unione `GlassDocument | SolidDocument`. Il codice che accede a
  `quality`, `source`, `target` o alle sezioni di Glass usa `GlassDocument` (il laboratorio, il
  runtime Glass, l’export, la sincronizzazione, i progetti).
- `parseMaterial` / `parseMaterialText` restituiscono l’unione. Per i chiamanti che gestiscono solo
  Glass esistono `parseGlassMaterial` / `parseGlassMaterialText` / `onlyGlass`: un documento valido
  di un’altra famiglia è rifiutato con un motivo, mai applicato a metà.
- `MaterialDefinition.params` è una lista di `Descriptor` generici; `MATERIALS.preset(id)` restituisce
  `{ doc: MaterialDocument, approximation, note }`.
- `bindPress` accetta qualunque superficie con `host` e `setPressed` (`PressTarget`); `GlassSurface` la soddisfa.
- `createMaterialGroup` ha un sovraccarico per famiglia: con un documento Glass restituisce `MaterialGroup`
  come prima, con uno Solid un `SolidGroup`.

I documenti Glass continuano a dichiarare `runtime.min = 0.2.0` (`FAMILY_MIN_RUNTIME.glass`): i file
scritti oggi si aprono ancora in un runtime 0.2.0 e le esportazioni esistenti non cambiano.

## Solid

Materiale autonomo, **non** una variante opaca di Glass: nessun filtro SVG, nessuna mappa di
displacement, nessun `backdrop-filter`, nessun canvas (un test lo verifica sul sorgente). Si dipinge
con una sola superficie CSS e poche variabili.

### Documento

`jello-material` v2 con `family: 'solid'`, `familyVersion: 1`, `runtime.min: 0.3.0`. Sezioni:
`material`, `geometry`, `behavior`, `states`, `meta`. Non ha `quality`, `source` né `target`: non ha
backend da scegliere né fallback.

### Parametri

| Chiave | Sezione · gruppo | Intervallo / valori | Iniziale | Note |
| --- | --- | --- | --- | --- |
| `fill` | material · Superficie | `#rrggbb` | `#f1f3f5` | colore di riempimento |
| `foreground` | material · Superficie | `#rrggbb` | `#111827` | testo e icone; il contrasto è a carico di chi sceglie i valori |
| `finish` | material · Superficie | `flat` / `soft` | `flat` | `soft` aggiunge una sfumatura appena percettibile **sopra** il colore, così il colore resta animabile |
| `borderColor` | material · Bordo | `#rrggbb` | `#d0d5dd` | |
| `borderWidth` | material · Bordo | 0 – 8 px, passo 0,5 | 1 | il bordo è interno: non cambia le dimensioni dell’elemento |
| `elevation` | material · Ombra ed elevazione | 0 – 5, passo 1 | 1 | livello; decide scostamento e sfocatura (ombra a due strati) |
| `shadowColor` | material · Ombra ed elevazione | `#rrggbb` | `#101828` | |
| `shadowOpacity` | material · Ombra ed elevazione | 0 – 1, passo 0,01 | 0,18 | |
| `shape` | geometry · Forma | `capsule` / `rounded` | `rounded` | `capsule`: metà del lato corto |
| `radius` | geometry · Forma | 0 – 120 px | 12 | per `rounded` |
| `duration` | behavior · Transizioni | 0 – 600 ms, passo 10 | 140 | 0 = istantanee |
| `easing` | behavior · Transizioni | `standard` / `emphasized` / `linear` | `standard` | |

La dimensione non è un parametro: viene dal layout dell’elemento ospite (come Glass con `sizing: 'element'`).

### Stati

`default`, `hover`, `pressed`, `active` (selezionato/corrente), `disabled`. `default` è il materiale;
gli altri sovrascrivono solo le chiavi che dichiarano:

| Chiave di stato | Intervallo | Note |
| --- | --- | --- |
| `fill`, `foreground`, `borderColor` | come il materiale | |
| `elevation` | 0 – 5 | |
| `scale` | 0,9 – 1,1 | scala la **superficie**, mai il contenuto; ignorata con movimento ridotto |
| `opacity` | 0,2 – 1 | su tutto l’elemento, contenuto compreso |

Composizione (`resolveSolid`, l’unico punto che trasforma documento e stato in valori): materiale →
`active` → `hover` → `pressed` → `disabled`, ognuno sostituisce solo le sue chiavi. Un elemento
`disabled` ignora `hover` e `pressed` ma mantiene l’aspetto `active`. Lo stato dominante mostrato in
`data-jello-state` è `disabled` > `pressed` > `hover` > `active` > `default`. I valori iniziali dei
preset mantengono un contrasto testo/colore ≥ 4,5:1 in ogni stato (verificato dai test).

### Renderer

```ts
const group = createMaterialGroup({ material: solidDoc });             // SolidGroup
const surface = group.attach(button, { interaction: 'interactive' });  // hover + press da puntatore e tastiera
surface.setActive(true);      // stati persistenti: li imposta l’host
surface.setDisabled(true);    // aria-disabled / disabled restano compito dell’host
group.setMaterial(next);      // → { changed: ['material.fill', …], stages: ['surface'], surfaces: 1 }
group.destroy();
```

Contratto DOM: l’host riceve la classe `jello-solid-host`, l’attributo `data-jello-state` e le variabili
`--jsolid-*`; un `span.jello-solid` (aria-hidden, senza eventi) è il primo figlio e dipinge colore,
bordo, ombra e scala. Il contenuto dell’host non è mai scalato né filtrato. `destroy()` rimuove
strato, classe, attributo e variabili. Con `interaction: 'none'` (predefinito) è l’host a pilotare
gli stati con `setHovered`, `setPressed`, `setActive`, `setDisabled`.

Non c’è ciclo di animazione, osservatore, sospensione né misura del layout: un cambio di stato è
qualche scrittura di variabili CSS (e nessuna se nulla è cambiato; `surface.writes` lo rende
verificabile) e le transizioni sono del browser.

### Accessibilità e transizioni

- Si animano solo colore, bordo, ombra, opacità e `transform`; mai proprietà di layout.
- `prefers-reduced-motion: reduce`: la scala non viene applicata e le transizioni di colore sono
  limitate a 80 ms. `group.status.motionReduced` riflette la preferenza.
- `forced-colors: active`: bordo sempre visibile (almeno 1 px, anche con `borderWidth` 0) e in colore di sistema, riempimento e ombra sostituiti dal browser, stato disabilitato distinguibile. Verificato nel browser sugli stili calcolati.
- Focus: un anello di 2 px a 2 px di distanza solo con `:focus-visible` (non al clic), nel colore del contenuto (leggibile sul riempimento per costruzione; ≥ 3:1 verificato). Specificità zero: un host che stila il proprio focus vince. `--jsolid-focus` lo ricolora quando la pagina dietro lo richiede. Il contrasto dell’anello con lo sfondo della *pagina* non è controllabile da Solid.
- Contrasto: i preset mantengono ≥ 4,5:1 tra contenuto e riempimento in default, hover, pressed e active, misurato sugli stili calcolati dal browser oltre che dal modello.
- `color-mix()`: l’ombra lo usa dove esiste; altrimenti (rilevato una volta per gruppo, forzabile con `colorMix: false`) è scritta come `rgba()` equivalente, livello per livello, e non sparisce.

## Jelly: il contratto

Jelly è `planned`: elencata (`FAMILIES`, con `planned: ['physics', 'deformation', 'bubbles']`),
mostrata come «in sviluppo», **non registrata**, non leggibile (`parseMaterial` risponde «non è ancora
disponibile»), senza runtime. Cosa serve per aggiungerla è la checklist sopra; cosa le è riservato:

- tre capacità (`physics`, `deformation`, `bubbles`) già nel tipo `MaterialFeature`;
- una propria sezione `material`, senza ereditare né l’ottica di Glass né i parametri di Solid;
- lo stesso `renderer` id e lo stesso `validateDefinition` di ogni altra famiglia.

Non esiste alcuna fisica, bolla o deformazione nel codice.

## Preset

Solid ne include quattro, originali: `solid-neutral`, `solid-dark`, `solid-accent`, `solid-outline`.
Glass ne ha cinque, invariati. Nessun preset descrive un altro progetto.

I vecchi `cable` e `bt` (e il template `bt-darts`) sopravvivono solo in `src/migration/legacy.ts`, un
modulo **isolato**: serve ad aprire URL e progetti salvati che li nominano, come bozza di un preset generico
con un avviso (vedi [Preset rimossi](material-model.md#preset-rimossi)). Non è esportato dal runtime, non
è raggiungibile da modello, exporter, stage o anteprima, e non compare in nessuna libreria, demo, nuovo
progetto o export (tutto verificato da `tests/unit/boundaries.test.ts`). Dettagli e regressioni in
[Component Definition](component-definition.md#dati-legacy).

## Inspector del materiale

Il registro espone già, per ogni famiglia, ciò che serve a generare i controlli: descrittori (tipo, unità,
intervallo, passo, default, gruppo, stadio, descrizione), gruppi nell'ordine di visualizzazione, chiavi
sovrascrivibili per stato, `read` e `customize`. [`src/model/inspector.ts`](../src/model/inspector.ts) li
assembla in dati puri, uguali per ogni famiglia:

```ts
const model = inspectorModel(MATERIALS.get(doc.family)!, doc);
model.groups[0].controls[0];   // { key, group, kind: 'slider' | 'select' | 'color', label, description, stage,
                               //   default, value, unit?, min?, max?, step?, options? }
model.states;                  // [{ state: 'hover', controls: [{ …, state, overridden }] }, …]  (vuoto per Glass)
applyControl(def, doc, { key: 'elevation', state: 'hover' }, 3);   // → { ok: true, doc } | { ok: false, error }
```

Glass e Solid usano lo stesso contratto, con renderer e parametri specializzati. I test
(`tests/unit/inspector.test.ts`) verificano che ogni parametro compaia una volta sola, che ogni
controllo abbia tutto ciò che serve, che **ogni controllo di ogni famiglia** (e ogni override di stato di
Solid) si possa cambiare e che il documento riletto contenga esattamente quel valore e nient'altro, e che i
valori non validi, le chiavi sconosciute e i documenti di un'altra famiglia siano rifiutati con un motivo.
`ParamField` (il campo del pannello Glass) accetta ora il descrittore generico: lo stesso componente
disegna i controlli di qualunque famiglia, quindi Solid non richiede un secondo pannello.

Non ne fa parte, perché dipende da ciò che c'è a schermo: quali controlli *si applicano* in questo momento
(`applicability` del laboratorio) e le note per backend (`supportReport` di Glass). Restano del
laboratorio e dell'host.

## Component Definition

Il formato canonico delle componenti è `jello-component-definition`: vedi
[Component Definition](component-definition.md) (schema, tipi, conversione dai formati precedenti,
cambiamenti incompatibili, API per M2).

## Versioni

`RUNTIME_VERSION` passa a **0.3.0** (`package.json` incluso). I record di verifica raster in
`verification/*.json` sono legati alla versione del runtime (`findVerification`), quindi vanno
rigenerati con la suite E2E: vedi [Compatibilità](compatibility.md).

## Limiti noti

- **Il Material Lab non modifica Solid** (da M2 sì il Component Builder). Importare un file Solid nel
  Material Lab, in un progetto `.jello` o dal relay è rifiutato con un motivo; la libreria personale contiene solo
  Glass. In una componente Solid si modificano parametri e stati con lo stesso pannello di Glass
  ([Component Engine](component-engine.md#inspector-condiviso)).
- **Export:** il pacchetto del solo materiale (`material-runtime`, `material-css`) è di Glass; la componente
  si esporta con Glass o Solid, e il JSON del materiale con qualunque famiglia.
- **`SolidGroup` non è un `MaterialGroup`.** Condivide ciclo di vita e stato di base
  (`BaseMaterialGroup`, `MaterialSurface`) ma non i tipi di Glass (backend, sorgente). Le componenti non lo sanno:
  passano da `MaterialBinding` (`runtime/surface-binding.ts`), che sceglie il gruppo della famiglia.
- **Component Definition:** Button e Mobile Navbar hanno renderer ed editor; vedi [Problemi aperti](component-definition.md#problemi-aperti).
- **Contrasto:** Solid non impone il rapporto colore/testo; i preset lo rispettano, i valori scelti
  dall’utente no per costruzione.
- **WebKit** non è stato eseguito: la verifica ha coperto Chromium, Firefox e il viewport Pixel 7 emulato (`test:e2e:local`).
