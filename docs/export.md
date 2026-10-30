# Esportazione

Il dialog **Esporta…** (intestazione, in entrambe le modalità) chiede *cosa* esportare e mostra file
e dipendenze prima di scaricare:

| Scelta | Adapter | Risultato |
| --- | --- | --- |
| Solo materiale | `material-runtime`, `material-css` | pacchetto del materiale (sotto, §2) |
| Componente + materiale | `component-react`, `component-vanilla` | React + TypeScript (§3) oppure HTML/CSS/JS (§4), solo nel Component Builder |
| Configurazione JSON | `material-json`, `component-json` | il documento `jello-material` o `jello-component-definition` |

Gli adapter (`src/export/adapters.ts`) hanno tutti la stessa interfaccia — `describe(req)` (nome,
file, dipendenze, note) e `build(req)` (file) — e sono puri: nessun DOM, nessuno stato del
laboratorio. Il builder non conosce i formati: Web Components, plugin Figma, Canva
Apps, CLI e server MCP saranno nuovi adapter sugli stessi documenti (non implementati in questa
fase).

I pulsanti storici in *Proprietà → Importa ed esporta* restano.

M5.1 estende il runtime e i wrapper esistenti, senza aggiungere formati:
[Navbar Architecture](navbar-architecture.md). Gruppi, ID, SVG, azioni e
responsive viaggiano in `component.json`; React espone `onAction(id, event)`
con `NavbarActionEvent`, Vanilla accetta lo stesso callback in `mount(options)`.
Le azioni `navigate` sono link nativi; `consumer` riporta il nome dell'azione,
`select` mantiene `onChange/onReselect`. `interactions.events.action` personalizza
il CustomEvent (default `jello-action`). I pacchetti prodotti prima restano
autonomi. Desktop non è esportabile finché non esiste il suo renderer.

## 1. Preset JSON

Il solo documento `jello-material` v2 («Mostra JSON», «Scarica preset»). Serve a riaprirlo nel
laboratorio o in un progetto che ha già il runtime. «v1 (precedente)» scrive il formato
`jello-glass` v1 con i soli parametri ed elenca ciò che v1 non può rappresentare (id, nome, qualità,
sorgente, destinazione, note).

## 2. Pacchetto per un altro progetto

«Pacchetto con runtime (.zip)»:

```
jello-<id>/
  material.json          definizione (jello-material v2); URL di asset relativi a questo file
  index.js · index.d.ts  modulo installabile: `material` tipizzato e createGroup({ source })
  package.json           @jello-export/<id>-material (npm install ./jello-<id>)
  runtime/jello.js       runtime costruito (ESM) — lo stesso usato dall'anteprima
  runtime/jello.css      CSS del materiale e dei fallback di accessibilità
  runtime/chunks/*.js    backend WebGL2, caricato solo da createSceneView
  runtime/types/         dichiarazioni TypeScript (entry: types/runtime/index.d.ts)
  runtime/package.json   @jello/runtime, installabile con npm install ./runtime
  assets/                immagini referenziate dal materiale (scena WebGL2)
  example/index.html     esempio minimo (+ main.js), nessun build necessario
  jello-manifest.json    requisiti, fallback, livelli di supporto, file con SHA-256
  README.md              uso, sorgente da fornire, requisiti, parametri
```

- Il runtime arriva da `dist-lib/` (`npm run build:lib`); il laboratorio lo serve in `runtime/`
  (plugin in `vite.config.ts`) e lo legge da lì: nessun percorso privato (`src/...`) e nessuna
  source map finisce nel pacchetto (verificato in `tests/unit/export.test.ts`).
- Il manifest dice quali backend possono servire il materiale, cosa richiede ciascuno e quali
  parametri sono **ignorati** o **approssimati** (stessa tabella di `src/model/support.ts`).
- **Sorgente SVG**: il consumatore dichiara una GlassSource DOM opaca e mette le superfici sopra,
  non dentro. **Sorgente WebGL2**: il consumatore fornisce una texture (pattern, immagine della
  stessa origine o con CORS, canvas). WebGL2 non legge il DOM.

«Solo CSS (resa ridotta)»: `jello-material.css` con le stesse variabili che il backend CSS scrive a
runtime, markup d’esempio e manifest con `reducedRendering`. Nessuna rifrazione, nessuna
pressione; lo dice il manifest, il README e il messaggio nel laboratorio.

## 3. Componente React + TypeScript

Vale per ogni componente registrata ([Component Engine](component-engine.md)): Mobile Navbar e Button, con
materiale Glass o Solid. Gli esempi sotto sono della Mobile Navbar; il Button ha un involucro analogo
(`<NomeButton>`: props `label`/figlio, `disabled`, `onPress`, `onHover`, `onFocus`, `sourceRef`, `backend`,
`className`; tipo `NomeVariant`) che monta `createButton` del runtime. Con Solid non serve `sourceRef`, il
manifest dichiara `backend: none` e il README elenca le proprietà della definizione senza effetto con quel
materiale (anche negli avvisi dell'export). Il pacchetto con runtime del solo materiale supporta anche Solid (§5); il CSS statico è solo Glass.

```
jello-<nome>-react/
  package.json          @jello-export/<nome>: ESM, tipi, peer react/react-dom ≥ 18, ./style.css
  index.js              <NomeNavigation> (ESM compilato, senza JSX) + JelloBottomNavigation + config
  index.d.ts            props, unione degli id delle tab (NomeTabId), tipo della configurazione
  src/<Nome>.tsx        lo stesso componente come sorgente TSX, per chi lo copia nel progetto
  component.json        jello-component (struttura, stati, interazioni, breakpoint, materiale)
  material.json         il materiale applicato, da solo
  runtime/              runtime Jello costruito: renderer della componente e del materiale, CSS, tipi
  example/App.tsx       integrazione minima
  README.md · jello-manifest.json   props, eventi, tab, proprietà; file con SHA-256
```

```tsx
import { BottomNavigation, type BottomNavigationTabId } from '@jello-export/bottom-navigation';
import '@jello-export/bottom-navigation/style.css';

const [tab, setTab] = useState<BottomNavigationTabId>('home');
<main ref={content}>…</main>   {/* GlassSource: dietro la barra, non la contiene */}
<BottomNavigation sourceRef={content} activeTab={tab} onChange={setTab} onReselect={…} />
```

- Il componente è un involucro sottile del `BottomNavigation` del runtime: **lo stesso codice**
  che gira nell’anteprima del laboratorio (stesso `jello.js`, verificato byte per byte in
  `tests/e2e/react-consumer.spec.ts`). Non importa nulla di Jello Studio né un router.
- Controllato (`activeTab` + `onChange`) o non controllato (`defaultActiveTab`); `onTabPress`,
  `onReselect`; `sourceRef`, `scrollerRef`, `anchor`, `backend`, `className`, `aria-label`.
- React possiede solo un contenitore `display: contents` senza figli React: la `<nav>` vive lì
  dentro, quindi StrictMode, ri-render e smontaggio non lasciano nodi, listener o lenti.
- Il nome del pacchetto viene dal nome della componente («Bottom Navigation» →
  `@jello-export/bottom-navigation`, «La mia app» → `@jello-export/la-mia-app`, componente
  `LaMiaAppNavigation`, tipo `LaMiaAppTabId`).

### Progetto esterno di prova

`examples/react-consumer/` è un’app Vite + React + TypeScript indipendente (proprio
`package.json`, propri `node_modules`): `npm run consumer:prepare` esporta con l’adapter del
laboratorio la demo Bottom Navigation modificata come nel flusso del builder (quarta tab, icona
SVG, altezza), lo installa con `npm install ./vendor/…`, esegue `tsc --noEmit` (tipi del pacchetto e
sorgente TSX, con `noUncheckedSideEffectImports`) e `vite build`. I test e2e lo servono su :4176.

## Da riga di comando

```sh
npm run example:prepare                                   # preset "navbar" → examples/navbar/jello/
node scripts/prepare-example.mjs --material mio.json --out /tmp/pkg --zip /tmp/pkg.zip
node scripts/prepare-example.mjs --builtin satin --kind css-only --out /tmp/css
```

Lo script usa lo stesso `buildPackage` del laboratorio (caricato con `runnerImport` di Vite).

```sh
npm run consumer:prepare                                          # componente React → examples/react-consumer
node scripts/prepare-consumer.mjs --component mia.jello-component.json
```

## Verifiche

`tests/e2e/export.spec.ts` scarica il pacchetto dal laboratorio, lo serve da un’altra origine e:

- controlla contenuto, manifest e che `material.json` sia identico al documento aperto;
- confronta l’esempio DOM del pacchetto con `preview.html?fixture=dom` (stesso markup, CSS,
  materiale, backend, 480×320, DPR 1): differenza media < 0,5 livelli su 255;
- fa lo stesso per l’esempio WebGL2 a `t = 0` con `preview.html?fixture=scene`;
- apre l’esempio solo CSS e verifica il `backdrop-filter` applicato.

Il confronto vale a parità di backend: lo stesso JSON su un backend diverso ha una resa diversa e
non viene confrontato.

## 4. Componente Vanilla (M4.1)

`component-vanilla` esporta Button e Mobile Navbar con Glass o Solid. Nessun peer React, nessuna build nel consumatore: servire la cartella via HTTP e aprire `example/index.html`.

- `component.json` e `material.json`: definizioni canoniche complete.
- `index.js`, `index.d.ts`, `package.json`: `mount({ container, source?, ...options })` restituisce l’istanza del runtime condiviso; `update(config)`, `unmount()`, `mount()` e `destroy()` mantengono il lifecycle originale.
- `runtime/`: stessi byte costruiti da `build:lib`, CSS con namespace Jello, dichiarazioni e chunk; nessun renderer generato.
- `example/`, README e manifest: istruzioni, dipendenze incluse, compatibilità, limitazioni e hash SHA-256.

Gli eventi e i callback rimangono quelli runtime: `onPress/onHover/onFocus` per Button, `onChange/onTabPress/onReselect` per Navbar. Le definizioni conservano i breakpoint; il container deve avere una larghezza. La navbar accetta `anchor: 'container'` per una cornice locale; i link Button usano la semantica nativa del browser. Gli esempi mostrano anche destroy/mount ripetuti.

Glass rifrange una sorgente DOM opaca separata dal container; senza sorgente usa CSS. Il renderer DOM non legge texture WebGL2: questo limite è dichiarato nel manifest e nel README. Solid non richiede sorgenti. Le preferenze di movimento/trasparenza e i fallback restano quelli del runtime; non viene appiattito il componente in markup statico.

`npm run vanilla:prepare` genera quattro consumatori indipendenti e verifica i tipi pubblici. `npm run vanilla:serve` li serve su :4177. I test `vanilla-consumer.spec.ts` confrontano contenuto, stile effettivo del contenuto e superficie con lo Studio, verificano eventi, tastiera, viewport da 320 px, preferenze e cleanup. I byte JS/CSS sono confrontati con `dist-lib`.

## 5. Materiale Solid autonomo

`material-runtime` include anche Solid: documento, `createGroup()`, runtime, CSS, tipi, esempio e manifest. `group.attach(host, { interaction: 'interactive' })` conserva hover e pressione; active e disabled si impostano dalla superficie. La semantica HTML e disabled/aria-disabled appartengono all’host. `group.destroy()` rilascia strati, variabili e listener. Non si offre uno stylesheet statico Solid che perda gli override di stato senza avviso.
