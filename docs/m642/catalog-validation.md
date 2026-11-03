# M6.4.2 — Validazione del catalogo

Sorgenti: `src/model/catalog/{index,names,experimental-names}.ts`, `src/lab/app/catalog-ui.ts`. Verifica con il catalogo **reale** (non con elenchi scritti a mano nei test).

## 1. Contenuto effettivo

`validateCatalog()` → `[]` (nessun problema). 13 voci:

| `presetId` | Nome visualizzato | Famiglia / trattamento / variante | Tipo | Disponibilità |
|---|---|---|---|---|
| `jello` | Glass · Default | glass / default | material-preset | available |
| `satin` | Glass · Frosted | glass / frosted | material-preset | available |
| `deep` | Glass · Refractive | glass / refractive | material-preset | available |
| `navbar` | Glass · Subtle | glass / subtle | material-preset | available |
| `optics` | **Refraction Test** | glass / isolated-refraction | **diagnostic** | available |
| `solid-neutral` | Solid · Matte | solid / matte / Neutral | material-preset | available |
| `solid-dark` | Solid · Dark | solid / matte / Dark | material-preset | available |
| `solid-accent` | Solid · Accent Blue | solid / soft / Accent Blue | material-preset | available |
| `solid-outline` | Solid · Outlined | solid / outlined / Neutral | material-preset | available |
| `jelly-soft` | Jello · Soft | jelly / gel / Soft | material-preset | **experimental** |
| `jelly-clear` | Jello · Clear | jelly / gel / Clear | material-preset | experimental |
| `jelly-candy` | Jello · Candy | jelly / gel / Candy | material-preset | experimental |
| `jelly-dense` | Jello · Dense | jelly / gel / Dense | material-preset | experimental |

Coincide con i preset attesi dal mandato (§3.2). Gli ID tecnici (`jello`, `satin`, `deep`, `navbar`, `optics`, `solid-*`, `jelly-*`) non coincidono con i nomi: i nomi sono presentazione e vivono in un solo punto per famiglia (`names.ts` per Glass/Solid, caricato dal runtime esportabile; `experimental-names.ts` per Jello, raggiunto solo dal catalogo del laboratorio).

## 2. Le dieci garanzie del mandato (§3.3)

| # | Garanzia | Dove è dimostrata |
|---|---|---|
| 1 | ID univoci | `validateCatalog` («id duplicato»); `catalog.test.ts` |
| 2 | Ogni preset ha la famiglia corretta | `validateCatalog`: «nessun preset {famiglia} con questo id»; ogni preset registrato senza voce è un errore |
| 3 | Ogni trattamento è definito | `validateCatalog`: «trattamento «x» non definito per {famiglia}»; `TREATMENTS` ha una definizione per ogni parola |
| 4 | Nomi coerenti | `validateCatalog`: nome uguale a `names.ts`, nessun duplicato di etichetta |
| 5 | Descrizioni che non rivendicano effetti inesistenti | Le capacità dichiarate devono esistere nella famiglia (`EFFECTS.requires`) **e coincidere** con quelle ricavate dai parametri del preset (`usedEffects`), es. `optics` non dichiara `backdrop-blur` perché `blur = 0` |
| 6 | Le capacità dipendono dai parametri effettivi | idem (`sameSet(used, capabilities)`); per Jello i controlli sono in `catalog.test.ts` contro i documenti sperimentali |
| 7 | I diagnostici sono separati | `kind: 'diagnostic'`; la Library li mostra solo in «Avanzato: diagnostica» (`catalog-ui.isDiagnosticId`); **dopo M6.4.2 neppure kit, wizard, Home e Gallery li creano o li propongono** (M642-03/04/06) |
| 8 | I preset personali mantengono il loro nome | `presentItem` non sostituisce il nome di un materiale `origin: 'user'`; il nome «Glass · Default» di una copia del kit resta quello della copia |
| 9 | Cambiare un'etichetta non altera la revisione tecnica | `LEGACY_PRESET_NAMES` + `revisionName()`: l'hash di `material.revision` usa il nome pre-M6.4.1 per un preset incluso con il suo nome corrente; `catalog.test.ts` ricalcola la revisione con i nomi storici |
| 10 | I documenti storici restano importabili | `catalog.test.ts` (documenti con nomi storici «Satinato», «Lente marcata»…); `migration.test.ts`; `params-io.spec` («jello-glass v1 still available») |

Test del catalogo: `catalog.test.ts` (32). Aggiunti in M6.4.2: `m642-quality.test.ts` (3: il kit contiene solo preset del catalogo, disponibili e non diagnostici; `optics` non è nel kit ma resta diagnostico; ogni famiglia `available` è `editor: true`).

## 3. Etichette e terminologia (§3.4, §8.5)

| Etichetta | Regola | Stato |
|---|---|---|
| «Backdrop blur» | solo se `blur > 0` o `saturation ≠ 100` | `usedEffects` |
| «Edge refraction» | solo se `refraction ≠ 0` e `band > 0`; con backend CSS «non disponibile» (limite dichiarato) | `usedEffects`; `CSS_NO_REFRACTION` |
| «Elastic deformation» | definita «oscillatore a un grado di libertà, non una simulazione di fluido» | `EFFECTS` |
| «Internal bubbles» | «decorative, statiche, disegnate solo con il backend SVG»; mai «particelle fisiche» | `EFFECTS`; limiti Jello |
| «Elevation» | «livello visuale… nessun effetto sul layout»; solo Solid e Jello | `EFFECTS`, test `solid.test.ts` («never touches layout») |
| Fisica per Jello | nessuna dichiarazione di volume, ray tracing, fluidodinamica: i limiti Jello dicono «nessuna simulazione volumetrica o fluida» e «parametri stilizzati» | `CATALOG` |
| Famiglia sconosciuta | `familyLabel` → «Famiglia sconosciuta», mai «tutto ciò che non è Glass è Solid» | `catalog-ui.ts`; **corretto** in `CreateDialog` (M642-16) |

**Vocabolario in lingua**: «Jello» è il nome del prodotto/famiglia; `jelly` resta identificatore tecnico (famiglia nel documento, id dei preset, nome persistito «Jelly Soft»). In M6.4.2 sono stati uniformati a «Jello» tutti i testi **rivolti all'utente** che dicevano «Jelly» (M642-05). Quel che resta volutamente con «Jelly»: id e nomi persistiti, nome dei file di esportazione (`jelly.json`, `jello-jelly-*`), `manifest.material.name` («Jelly Candy»: è il documento), classi CSS (`.jelly-decoration`), il testo di esempio «Jelly» del Button dimostrativo, i commenti del codice.

Italiano/inglese: le istruzioni all'utente sono in italiano; i nomi tecnici di effetti e preset sono in inglese (`Backdrop blur`, `Frosted`) come nella documentazione. Non è stata trovata una funzione che mescoli le due lingue nella stessa frase di istruzione dopo le correzioni; rimane una scelta di prodotto la traduzione dei nomi di sezione («Appearance», «Volume & Light», «Motion & Physics» nel Jello lab, «Stati»).

## 4. Dove il catalogo non basta

- La Library mostra «Runtime CSS · anteprima» su ogni card di materiale e di componente (la Desktop Navbar dice «Builder · React / Vanilla / JSON»): descrive il backend di *anteprima*, non una capacità del materiale. Corretto ma facile da fraintendere; non modificato.
- Copie del kit con lo stesso nome del preset incluso (O-4 in `issues-and-fixes.md`).
