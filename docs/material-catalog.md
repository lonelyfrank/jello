# Catalogo dei materiali (M6.4.1)

Il catalogo (`src/model/catalog/`) è il vocabolario della Library: dice **come si chiama** un materiale, **a quale famiglia e trattamento appartiene**, **quali effetti usa davvero** e **per cosa è pensato**. Non è un formato persistito: nessun documento `.jello`, nessun `jello-material`, nessun record IndexedDB lo contiene.

## Cinque concetti, non uno

| Concetto | Significato | Esempi |
|---|---|---|
| **Famiglia** (*material family*) | Il motore di rendering: decide quali proprietà esistono. Id tecnico stabile. | `glass`, `solid`, `jelly` (nome visualizzato **Jello**) |
| **Trattamento** (*surface treatment*) | Un trattamento visivo dentro una famiglia, con una definizione scritta. | Frosted, Refractive, Matte, Outlined |
| **Preset** | Combinazione concreta e validata di parametri: id stabile + nome visualizzato + variante. | `satin` → «Glass · Frosted» |
| **Effetto** | Proprietà che il renderer implementa davvero. | Backdrop blur, Edge refraction, Elastic deformation |
| **Configurazione diagnostica** | Preset creato per misurare o verificare, non per i designer. | `optics` → «Refraction Test» |

*Navbar*, *Button* ecc. sono **componenti**, non materiali: per questo `navbar` si chiama «Glass · Subtle» (destinazione d’uso: `navigation`, `toolbar`, `overlay`).

## Identità e presentazione

**Il nome visualizzato non è un identificatore.** Gli id restano quelli storici e sono ciò che i documenti referenziano (`material.preset`, `meta.basedOn`, id di materiale):

| Id | Nome precedente (≤ M6.4) | Nome (M6.4.1) | Famiglia | Trattamento · variante | Tipo |
|---|---|---|---|---|---|
| `jello` | Jello · iniziale | Glass · Default | glass | Default | materiale |
| `satin` | Satinato | Glass · Frosted | glass | Frosted | materiale |
| `deep` | Lente marcata | Glass · Refractive | glass | Refractive | materiale |
| `navbar` | Jello · navbar | Glass · Subtle | glass | Subtle | materiale |
| `optics` | Ottica nuda | Refraction Test | glass | Isolated refraction | **diagnostica** |
| `solid-neutral` | Solid · neutro | Solid · Matte | solid | Matte · Neutral | materiale |
| `solid-dark` | Solid · scuro | Solid · Dark | solid | Matte · Dark | materiale |
| `solid-accent` | Solid · accento | Solid · Accent Blue | solid | Soft · Accent Blue | materiale |
| `solid-outline` | Solid · contorno | Solid · Outlined | solid | Outlined | materiale |
| `jelly-soft` | Jelly Soft | Jello · Soft | jelly | Gel · Soft | sperimentale |
| `jelly-clear` | Jelly Clear | Jello · Clear | jelly | Gel · Clear | sperimentale |
| `jelly-candy` | Jelly Candy | Jello · Candy | jelly | Gel · Candy | sperimentale |
| `jelly-dense` | Jelly Dense | Jello · Dense | jelly | Gel · Dense | sperimentale |

Il nome sta in **un solo punto**: `src/model/catalog/names.ts`. `core/presets.ts` e `model/solid.ts` lo leggono da lì (quindi anche il documento del preset porta il nome del catalogo); le viste chiedono il resto al catalogo tramite `src/lab/app/catalog-ui.ts`. Il catalogo completo (descrizioni, capacità…) è solo lab: il runtime esportabile raggiunge soltanto `names.ts`.

I documenti sperimentali Jello **non** sono stati rinominati: il loro `name` persistito resta «Jelly Soft»… (è un dato, e `docs/examples/jelly/*.json` lo riporta). Il nome «Jello · Soft» è presentazione, data dal catalogo (`presetLabel`) solo a un preset non modificato; un materiale personale conserva sempre il nome scelto dall’utente.

### Compatibilità delle revisioni (importante)

`materialRevision(doc)` (`src/components/templates.ts`) è un hash di contenuto **che includeva il nome**. Un componente legato a un preset memorizza quella revisione; dopo una semplice rinomina avrebbe letto «il preset è cambiato» (`outdated`). `revisionName()` (in `names.ts`) fa sì che per i preset incorporati si continui a calcolare l’hash con il nome pre‑M6.4.1: le nove revisioni sono identiche a quelle di M6.4 (test `catalog.test.ts`, valori ottenuti dal commit `8e077bd`). Un materiale personale è hashato con il nome che ha.

## Effetti e capacità

Un preset elenca solo gli effetti che **usa**, non quelli che la famiglia potrebbe fare. Per Glass e Solid l’elenco dichiarato è confrontato (`validateCatalog`) con quello derivato dai parametri del documento (`usedEffects`): ad esempio `satin` ha `refraction = 0`, quindi non dichiara `edge-refraction`; `optics` dichiara solo la rifrazione (blur, tinta, luce e ombra sono a zero); `solid-outline` non dichiara l’ombra (elevazione 0). Per Jello il confronto è nel test, contro i documenti sperimentali.

| Effetto | Glass | Solid | Jello (β) | Note |
|---|---|---|---|---|
| Backdrop blur | sì (SVG/CSS) | no | **no** | Jello non legge lo sfondo |
| Edge refraction | sì, solo SVG (e WebGL2 nelle scene) | no | **no** | il runtime Jello dichiara `unsupported: refraction` |
| Tint | sì | no (ha un colore di riempimento) | sì | |
| Highlight | sì | no | sì (stilizzato) | |
| Shadow | sì | sì | sì | |
| Elevation | no | sì | sì | convenzione Solid |
| Border | no | sì | no | |
| State styles | no | sì | sì | hover / pressed / active / disabled |
| Press feedback | sì | sì | sì | |
| Drag motion | sì | no | no | |
| Elastic deformation | no | no | sì | oscillatore a un grado di libertà |
| Internal bubbles | no | no | sì, solo SVG | statiche, decorative |

> L’esempio della specifica indicava per Jello «Refraction: non volumetrica». Dal codice risulta che Jello **non ha alcuna rifrazione** (nemmeno approssimata): la matrice sopra è quella derivata dal codice.

Non sono mai dichiarati: simulazione volumetrica 3D, conservazione del volume, ray tracing, fluidodinamica, dispersione fisica, scattering fisico. «Scattering» e «Absorption» in Jello sono parametri normalizzati di un modello di attenuazione stilizzato (le loro descrizioni lo dicono).

## Disponibilità

- `available`: Glass e Solid, nelle librerie produttive.
- `experimental`: i quattro preset Jello. **Non è uno stato produttivo**: la famiglia resta `planned` in `FAMILIES`, non è nel registry, non è esportabile nel formato stabile, i preset sono *candidati non approvati visivamente* e i valori numerici non sono stati toccati in M6.4.1.

## Vista della Library

Una sola fonte di dati, viste filtrate:

- **Component Library**: categorie Buttons e Navigation.
- **Material Library**: categoria Materiali, famiglie Glass / Solid / **Jello · sperimentale** (la carta Jello usa il renderer reale, caricato con `import()` solo quando si sceglie il filtro; si apre nel Jello Lab, mai nell’editor stabile).
- **Personale**: «Le mie creazioni» e «Preferiti».
- **Diagnostica**: visibile solo con *Avanzato: diagnostica* (preferenza dello Studio); nella barra del Material Lab compare in un gruppo separato.

«Incluso» (non più «Jello») indica l’origine «preset fornito con lo Studio»: «Jello» è ora una famiglia e il prodotto.

## Validazione

`validateCatalog()` controlla: id univoci e presenti in `names.ts`, nome non vuoto né duplicato e uguale al nome del documento, famiglia nota, trattamento definito, descrizione e destinazione d’uso presenti, disponibilità coerente con lo stato della famiglia, ogni effetto nel vocabolario, esistente nella famiglia e supportato dalle sue `features`, capacità uguali agli effetti usati, ogni preset registrato presente nel catalogo. Una famiglia sconosciuta non diventa mai Glass o Solid (`familyLabel` → «Famiglia sconosciuta»).

## Aggiungere una famiglia o un preset

1. Famiglia: voce in `FAMILIES`, documento, `MaterialDefinition`, binding runtime (invariato).
2. Nome in `names.ts`, voce in `CATALOG` con trattamento (definito in `TREATMENTS`), descrizione e capacità.
3. `npx vitest run tests/unit/catalog.test.ts`: fallisce se il nome, il trattamento o una capacità non corrispondono al preset.
