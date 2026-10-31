# Jelly Material — RFC sperimentale M6.1

Data: 31 ottobre 2026. Checkout di partenza: `main`,
`6ce08f74670ba0e1353d217b2768a43fe96c08a4`, pulito.
Stato: **modello candidato implementato; nessun renderer, solver o editor Jelly**.
Consegna e verifiche: [report M6.1](jelly-m61-delivery.md).

## Decisione e confine pubblico

Jelly è una famiglia autonoma. Il candidato usa `jello-material` schema 2 e
`familyVersion: 1`, con sezioni proprie; non eredita Glass o Solid.
Il formato canonico delle componenti resta `jello-component-definition` v1.
Non è emersa un'incompatibilità che richieda di cambiare questi involucri:
le sezioni specifiche sono già discriminate da `family` e il binding contiene
un documento materiale, senza incorporare i suoi parametri nello schema componente.

In M6.1 l'unico ingresso è l'import esplicito da
[`src/model/experimental/jelly.ts`](../src/model/experimental/jelly.ts):
`createExperimentalJellyDocument`, `checkJellyParams`, `parseExperimentalJelly`,
`parseExperimentalJellyText`, `serializeExperimentalJelly`,
`resolveExperimentalJelly`. I [preset candidati](../src/model/experimental/jelly-presets.ts)
non sono `MaterialDefinition` né preset della libreria.

`MaterialDocument`, `parseMaterial`, `MATERIALS`, `RUNTIMES`, entry pubbliche,
Studio ed exporter restano invariati. `FAMILIES.jelly` resta `planned`, versione
pubblica 0, `editor: false`. Nessun renderer vuoto, capability inventata o
indebolimento di `validateDefinition`. Un JSON candidato viene rifiutato dal
parser produttivo con «Jelly non è ancora disponibile».

`runtime.min: 0.3.0` nei candidati indica **soltanto il floor del tooling
sperimentale corrente**: non esiste un runtime pubblico capace di renderizzarli.
`JELLY_EXPERIMENTAL_MIN_RUNTIME` è separato da `FAMILY_MIN_RUNTIME`, che non cambia.
In M6.4 il primo runtime realmente pubblicabile assegnerà il proprio minimo
Jelly prima dell'attivazione; Glass rimarrà 0.2.0 e Solid 0.3.0. Nessuna promessa
di poter importare i candidati con un runtime produttivo 0.3.0.

L'attivazione pubblica avverrà atomicamente in M6.4, dopo renderer e solver reali:
unione dei documenti, dispatch del parser, definizione, runtime, binding,
componenti, Studio, persistenza ed export nella stessa integrazione verificata.
In M6.2 una fixture privata importerà il candidato direttamente, senza
introdurlo nei flussi utente. I candidati non sono una versione Jelly pubblicata:
nessuna migrazione fittizia da Jelly 0, nessuna conversione Glass/Solid → Jelly.
Prima della pubblicazione si possono ancora correggere le decisioni sperimentali;
dopo, cambi incompatibili richiederanno familyVersion e una migrazione esplicita.

## Audit locale e mappa delle integrazioni

Letti package/lock, configurazioni TS/Vite/Vitest/Playwright, script di build e
consumer, documentazione Material Core/compatibilità/consegna M5.3 e i moduli
elencati sotto. Nessun `AGENTS.md` applicabile trovato negli antenati o nel repo.
Il lockfile v3 riporta ancora la versione radice 0.1.0 contro package/runtime
0.3.0: discrepanza preesistente, non corretta da questa fase e nessuna dipendenza
aggiunta. Baseline eseguita prima delle modifiche: typecheck, 411 test unitari,
build lib/tipi/Studio superati; dettagli ambientali nel report.

La ricerca dei consumatori ha confermato l'invariante registry/runtime nei test,
non un controllo runtime dentro `validateDefinition` che possa disegnare un materiale.
Il binding attuale conserva `active`, `disabled`, `hovered`, **non pressed/punto**
quando ricrea una famiglia: M6.4 dovrà decidere e testare il rilascio della pressione
durante il cambio, senza mantenere un solver precedente.

| File / simbolo | Responsabilità attuale | Modifica prevista e fase | Rischio concreto | Verifica |
| --- | --- | --- | --- | --- |
| `model/experimental/jelly.ts`, `jelly-presets.ts` | Nuovo contratto isolato | M6.1: dati, descrittori, parsing, resolver aspetto, candidati | Attivazione accidentale | Test Jelly, grafo entry e compilazione senza DOM |
| `core/descriptors.ts`: `Descriptor`, `checkKeys`, `defaultsOf` | Contratto condiviso | Riutilizzato in M6.1; nessuna modifica | Validazione divergente o nuovi tipi incompatibili | Default/passi/tipi/intervalli e regressione inspector |
| `model/families.ts`: `FAMILIES`, `FamilyId` | Jelly già planned | M6.4: status/version/editor insieme al runtime | UI prematura | Jelly resta planned in M6.1; parità registry/runtime in M6.4 |
| `model/document.ts`: `MaterialDocument`, `serializeMaterial`, `checkFamily` | Involucro v2; serializer binario Solid/altrimenti Glass | M6.4: unione e dispatch esaustivi | Perdita di sezioni Jelly | Round-trip di tutte le famiglie, versioni future |
| `model/migrate.ts`: `parseMaterial`, `onlyGlass` | Parser pubblico, migrazione Glass v1 | M6.4: ramo Jelly esplicito; oggi non Solid passa a Glass dopo checkFamily | Accettazione parziale o migrazione involontaria | `model`, `migration`, `registry`, Jelly rifiutata ora |
| `model/registry.ts`: `MaterialRegistry`, `validateDefinition`, `MaterialDefinition` | Disponibilità, parametri, accento, capability e export | M6.4: vera definizione Jelly, accento e preset verificati | Renderer assente, parametri senza effetto | `registry`, tutti i preset/controlli; parità con runtime |
| `model/version.ts`, `index.ts`, `runtime/index.ts` | Minimi per famiglia, API pubblica | M6.4: minimo Jelly reale, export tipizzati | Rompere vecchi documenti o includere esperimenti | Minimi Glass/Solid, API e bundle boundary |
| `model/solid.ts`, `glass.ts`, `quality.ts`, `support.ts` | Tabelle, resolver, profili/capability Glass | Invariati M6.1; riuso convenzioni ombra, geometria, stati | Riutilizzare impropriamente profili Glass | `solid`, `model`, `params`, `inspector` |
| `runtime/material-types.ts`: `BaseMaterialGroup`, `MaterialSurface` | Lifecycle comune | M6.4: JellyGroup/Surface conformi, stato runtime esteso | Ereditarietà artificiale da Glass | Typecheck, lifecycle e status |
| `runtime/materials.ts`: `RUNTIMES`, `createMaterialGroup` | Glass/Solid e overload | M6.4: overload e dispatch Jelly tipizzati | Cast di Jelly come Glass/Solid | Registry ↔ runtime, nessun gruppo fantoccio |
| `runtime/surface-binding.ts`: `MaterialBinding`, `BoundSurface`, `make/open/close` | Ricrea gruppi, stato e ownership; Solid/altrimenti Glass | M6.4: superficie Jelly, switch esaustivo e cleanup | Leak del solver o gruppo condiviso distrutto | Glass → Jelly → Solid → Glass, hover/active/disabled, pressione interrotta |
| `runtime/glass-group.ts`, `solid-group.ts`, `webgl2/scene-view.ts` | Backend esistenti e sorgenti controllate | Invariati; riferimento per lifecycle M6.2–4 | Assumere una texture DOM implicita | Regressione Glass/Solid; sorgenti/fallback Jelly separati |
| Futuri `runtime/jelly-group.ts`, superficie SVG e solver puro | Nessuna implementazione corrente | M6.2: ottica; M6.3: solver; M6.4: API pubblica | Costi, qualità, instabilità | Gate visivo, determinismo e stabilità descritti sotto |
| `components/definition.ts`: `DefinitionMaterial`, parser, `resolveDefinitionMaterial` | Materiale tramite registry nel formato componente v1 | M6.4: accetta Jelly registrata, override descritti | Mutare struttura o perdere override | `definition`, componenti/stati/round-trip |
| `components/registry.ts`, `button.ts`, `navbar.ts`, `navbar-desktop.ts` | Famiglie e preset iniziali per componente, presentazione/supporto | M6.4: preset Jelly e report proprietà supportate | Look Glass applicato a Jelly; feedback doppio | Matrice 3 componenti × 3 famiglie, struttura e responsive |
| `runtime/button.ts`, `bottom-navigation.ts`, `desktop-navigation.ts` | Semantica input, superfici e focus | M6.4: feedback Jelly tramite binding; feedback navbar oggi Glass-only | Click duplicato, deformazioni contenitore/indicatore sovrapposte | Tastiera/touch/cancel/disabled/focus, Start/Main/End e overflow |
| `model/inspector.ts`: `inspectorModel`, `applyControl` | Inspector generato | M6.4: riuso; aggiornamento atomico per vincoli incrociati | Modificare min senza validare max; slider inefficace | Parametri cambiati uno per uno e patch invalidi senza applicazione |
| `lab/app/Properties.tsx`, `Builder.tsx`, `Library.tsx`, `applicability.ts` | Pannelli e scelte disponibili | M6.4: riuso controlli; Properties è Solid/altrimenti Glass, sample Library analogo | Pannello Glass su Jelly | E2E Lab/Builder, Base/Avanzato e controlli non supportati |
| `lab/session.ts`, `stage/controller.ts`, `stage/components.ts` | Preview, cambio famiglia, export/URL | M6.4: percorso Jelly senza scene Glass implicite | Stage ripiega su preset Glass o non mostra la famiglia | Stage Button/navbar e confronto consumer |
| `lab/projects.ts`, `lab/storage/repository.ts`, `autosave.ts`, `project/{document,importer,package}.ts` | Materiali personali, progetti, IndexedDB v4 e `.jello` | Invariati ora; M6.4 sfrutta il parser esteso, nessun nuovo DB salvo necessità dimostrata | Seed perso, draft o asset non riaperti | `storage`, `autosave`, `project`, duplicazione e riapertura; mai scrivere per frame |
| `export/adapters.ts`: `materialRequirements`, `materialRuntimeAdapter` | Piani e package: non Glass descritto Solid; non Solid inviato a build Glass | M6.4: dispatch esplicito e requisiti Jelly | Pacchetto errato pur con ZIP valido | Manifest e consumer reale, rifiuto backend non supportati |
| `export/package.ts`: `buildPackage`, `model-deps.ts` | Pacchetto Glass con runtime, asset e CSS ridotto | M6.4: entry Jelly autonoma nello stesso sistema | Perdita asset o promessa CSS equivalente | Estrazione, installazione e build; manifest effetti mancanti |
| `export/react.ts`, `react-button.ts`, `react-desktop.ts` | Wrapper, README, manifest: non Glass assume assenza backend/source o look Solid | M6.4: requisiti/capability per famiglia, wrapper sottile | Fisica diversa nei template | Consumer React indipendente per tutti i componenti; byte runtime identici |
| `export/vanilla.ts`: `buildVanillaPackage`, `buildSolidPackage` | Consumer DOM; manifest non Glass = CSS Solid | M6.4: materiale Jelly e capability vere | Import React o descrizione fallback falsa | Consumer HTTP e tipi, nessun React |
| `vite.lib.config.ts`, `tsconfig.lib.json`, `scripts/finalize-lib.mjs`, `prepare-{consumer,vanilla,example}.mjs` | Bundle, tipi, CSS, lazy chunk e manifest | M6.4: includere moduli Jelly e asset reali | Chunk/shader assenti dal pacchetto | Build e runtime estratto, boundary e SHA-256 |
| `tests/unit/{registry,boundaries,inspector,migration,definition,export,vanilla-export,desktop-builder-export}.test.ts` | Invarianti e compatibilità | Ora regressione; M6.4 estensione delle matrici senza skip | Allentare i contratti per far passare Jelly | Suite completa e gate per fase |

Questa mappa include i rami binari trovati, non li modifica anticipatamente.
Prima dell'attivazione ripetere `rg -n 'family ===|family !==' src` e controllare
anche stage, sessione, thumbnail, report e template: un `else` valido per due
famiglie non è un dispatch per tre. Usare switch esaustivi e narrowing, non `any`.

## Catalogo persistito

La fonte eseguibile per tipo, default, range, passo, gruppo e invalidazione è
`JELLY_PARAMS`. Tutti i numeri sono finiti. Il passo è una granularità UI, non
un vincolo d'importazione, come Glass/Solid; `seed` richiede inoltre un intero.
I toggle usano enum `enabled/disabled`, poiché `Descriptor` e Inspector già
supportano select e non booleani. Nessun nuovo framework di validazione.

Nelle tabelle `S` = CSS statico e SVG, `V` = solo SVG; sono **capacità progettate**,
non backend esistenti. `S≈` = approssimazione con gradienti. WebGL2 è rinviato e
non è una scelta accettata dal candidato. `O` = override di stato consentito.
Ogni riga indica un codice di invalidazione/costo/accessibilità definito subito dopo.

| Percorso | Tipo/unità | Default | Range o valori; passo | Significato | Stato | Backend | Effetto |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `material.tint` | colore hex RGB | `#b8a2e8` | `#rrggbb` | corpo e bordo derivato | O | S | A |
| `material.foreground` | colore hex RGB | `#211735` | `#rrggbb` | testo/icone, contratto foreground | O | S | F |
| `material.bodyOpacity` | numero, alpha | 0.82 | 0–1; .01 | compositing solo superficie | O | S | A |
| `material.highlightStrength` | numero, artistico | .35 | 0–1; .01 | intensità riflesso | O | S | A |
| `material.roughness` | numero, artistico | .55 | 0–1; .01 | ampiezza/diffusione riflesso | — | S≈ | A |
| `material.thickness` | numero, frazione lato corto | .35 | 0–1; .01 | volume apparente | — | S≈ | A |
| `material.transmission` | numero, quota | .55 | 0–1; .01 | sfondo non deviato attraverso il corpo | — | S≈ | A |
| `material.absorption` | numero, coeff. normalizzato | 1.2 | 0–4; .01 | attenuazione per profondità | — | S≈ | A |
| `material.scattering` | numero, artistico | .25 | 0–1; .01 | velatura interna | — | S≈ | A |
| `material.edgeFalloff` | numero, esponente | 1.5 | .5–4; .05 | densità del perimetro | — | S≈ | A |
| `material.elevation` | numero, livello | 1 | 0–5; 1 | convenzione ombra Solid | — | S | H |
| `material.shadowColor` | colore hex RGB | `#241838` | `#rrggbb` | colore ombra | — | S | H |
| `material.shadowOpacity` | numero, alpha | .18 | 0–1; .01 | intensità ombra | O | S | H |
| `geometry.shape` | enum | rounded | rounded/capsule | forma predefinita | — | S | G |
| `geometry.radius` | numero, px CSS | 16 | 0–120; 1 | raggio rounded predefinito | — | S | G |
| `bubbles.enabled` | enum | enabled | enabled/disabled | inclusioni statiche | — | V | B |
| `bubbles.seed` | numero, uint32 | 10631 | 0–4294967295; 1 | distribuzione persistente | — | V | B |
| `bubbles.density` | numero, bolle/10000 px² CSS | 2 | 0–20; .1 | densità prima del cap tecnico | — | V | B |
| `bubbles.radiusMin` | numero, px CSS | 1 | .5–12; .5 | raggio minimo prima della profondità | — | V | B |
| `bubbles.radiusMax` | numero, px CSS | 3 | .5–12; .5 | raggio massimo prima della profondità | — | V | B |
| `bubbles.depthMin` | numero normalizzato | .15 | 0–1; .01 | 0 davanti, 1 dietro | — | V | B |
| `bubbles.depthMax` | numero normalizzato | .85 | 0–1; .01 | stessa convenzione | — | V | B |
| `bubbles.opacity` | numero, alpha | .35 | 0–1; .01 | contrasto prima dell'attenuazione | — | V | I |
| `behavior.responseMs` | numero, ms | 360 | 80–1200; 10 | periodo naturale non smorzato | — | V | M |
| `behavior.dampingRatio` | numero, rapporto ζ | .65 | .15–2; .01 | smorzamento relativo al critico | — | V | M |
| `behavior.maxDeformation` | numero, frazione lato corto | .06 | 0–.15; .005 | massimo spostamento decorativo | — | V | M |
| `behavior.press` | enum | enabled | enabled/disabled | feedback press | — | V / CSS statico | M |
| `behavior.hover` | enum | enabled | enabled/disabled | applica override hover di aspetto | — | S | A |
| `behavior.pressStrength` | numero, rapporto | .65 | 0–1; .01 | ampiezza target/maxDeformation | — | V | M |
| `behavior.releaseImpulse` | numero, rapporto | .15 | 0–1; .01 | impulso di velocità al rilascio | — | V | M |
| `quality.profile` | enum | auto | auto/high/medium/low/static | preferenza utente | — | S | P |
| `target.backend` | enum | auto | auto/svg/css | preferenza, distinta dall'effettivo | — | S | P |
| `target.fallback` | enum | css | css/opaque | fine catena di degradazione | — | S | P |

Per tutte le proprietà, reduced motion non riscrive il documento. Gestione per codice:

| Codice | Dipendenze e invalidazione prevista | Costo atteso e dipendenze | Reduced motion, fallback e trasparenza |
| --- | --- | --- | --- |
| A | `surface`: aggiorna gradienti/aspetto; volume dipende da silhouette/lato corto | costante per superficie; gradienti, senza nuove inclusioni; nessuna garanzia di costo misurata | RM mantiene valori statici; CSS approssima volume; opaco forza alpha 1/trasmissione 0 a runtime, senza alterare il salvato |
| F | `surface`: colore del contenuto stabile | scrittura colore, nessun mesh/layout | RM invariato; opaco sceglie coppia leggibile; forced-colors usa colori di sistema |
| H | `surface`: ombra dalla tabella di elevazione Solid | blur/area possono costare; elevazione 0 elimina ombra | RM statica; opaco mantiene ombra se disponibile; forced-colors la elimina |
| G | `geometry`: clip/silhouette e riproiezione inclusioni | dipende dalla misura host; resize aggiorna geometria, non seed | RM identico; CSS usa stesso raggio; capsule ignora radius |
| B | `inclusions`: distribuzione/proiezione deterministica | cresce con densità × area, entro cap superficie/gruppo; disabled elimina inclusioni | RM conserva bolle ferme; CSS/opaco le omette con motivo esplicito |
| I | `surface`: aggiorna contrasto delle inclusioni esistenti | O(numero bolle); non cambia distribuzione | RM invariato; CSS/opaco senza bolle, controllo dichiarato non supportato |
| M | `motion`: aggiorna coefficienti/target, conserva velocità, applica limiti | un solver per superficie attiva; nessun lavoro idle | RM/static/CSS/opaco disattivano deformazione e impulso, mantengono override pressed leggibile; niente drift |
| P | `pipeline`: ricalcola backend effettivo e budget runtime | può ricreare risorse del gruppo; profilo non cambia seed | RM forza moto statico indipendentemente da qualità; fallback e adattamento non riscrivono preferenze |

Gli override `states.{hover,pressed,active,disabled}` ammettono soltanto le cinque
chiavi `O`, stessi tipi/range/default dei descrittori base. Un override assente
eredita il materiale, non il default della tabella. Composizione: base → active
→ hover → pressed → disabled. Disabled ignora hover e pressed, conservando active.
Disabilitare hover/press esclude i relativi override. Tutti gli stati iniziali sono
vuoti: i look accessibili dei candidati vanno progettati e verificati in M6.2–4.
Il resolver implementato risolve soltanto l'aspetto, non il solver.

L'involucro ha id (pattern comune, max 64), name (1–80), format/schema/family/version,
runtime.min x.y.z, e meta (date stringa/null, basedOn stringa/null, notes max 4000).
Sono identità/tooling, senza override, effetti visivi o invalidazioni GPU.
`material`, `geometry`, `bubbles`, `behavior` sono sezioni obbligatorie; campi
interni mancanti usano i default con warning. `quality` e `target` assenti usano i
default con warning; `states` assente dà stati vuoti con warning, `meta` assente
i default comuni. Null, array e tipi errati non equivalgono a un campo assente.

## Ottica, geometria e alternative

Proposta matematica per M6.2, **non ancora eseguita dal modello**: una coordinata
interna `u` vale 0 al bordo e 1 nel nucleo della silhouette; `e=(1-u)^edgeFalloff`,
percorso normalizzato `L=1+e`. Trasmissione locale
`T=transmission × exp(-absorption × thickness × L) × (1-scattering)`.
Compositing del corpo: `Cbody=(1-T)×Ctint + T×Cbackground`, quindi
`Cout=bodyOpacity×Cbody + (1-bodyOpacity)×Cbackground`, prima di highlight/ombra.
Per CSS/SVG senza sorgente campionata si ottiene questa miscela tramite alpha
locale/gradienti; non si legge né si devia uno sfondo DOM. Thickness normalizza
anche gli indizi di bordo rispetto al lato corto. Scattering e roughness sono
controlli artistici, non coefficienti fisici calibrati. L'esponenziale definisce
una relazione effettiva nel progetto del renderer, non una simulazione ottica.
Nessun millimetro, indice di rifrazione o conservazione del volume dichiarato.

**bodyOpacity è alpha di compositing; transmission è la quota di sfondo prima
dell'attenuazione interna**. Testo e icone restano fuori dallo strato decorativo.
Nessun edgeTint indipendente: inizialmente si deriva dalla tinta e dall'attenuazione.
Nessuna saturazione duplicata. RefractionStrength non è persistito: CSS/SVG
non hanno un contratto di sorgente deformabile verificato; esporlo ora creerebbe
un controllo senza effetto. Niente drift, count artistico, posizioni manuali,
drag nuovo, massa/stiffness/damping equivalenti o settle time persistito.

Dimensioni: soltanto il layout host. Radius esplicito del binding/componente
vince sul default del materiale; capsule usa `min(width,height)/2`; rounded
clampa il raggio effettivo allo stesso limite. Questa risoluzione appartiene
al runtime. Il documento non duplica width, height o il border-radius effettivo.
Un cambio host aggiorna silhouette/proiezione, non l'identità delle bolle.

Scartati: Jelly come Glass colorato, trasformazione dell'intero host, simulatore
volumetrico pesante, secondo Inspector, libreria fisica, catture DOM per frame,
tre renderer completi prima di avere una fixture, renderer vuoto per il registry.

## Validazione e serializzazione

Zod mini controlla solo l'involucro come Solid/Glass; i parametri passano da
`checkKeys`/`checkValue`. La sola validazione specifica aggiuntiva è uint32 seed,
`radiusMin <= radiusMax`, `depthMin <= depthMax`, dopo aver applicato i default.
Qualsiasi errore rifiuta l'intero documento, senza mutare input o restituire doc.
Colori normalizzati in minuscolo. Chiavi sconosciute ignorate con warning nelle
sezioni, stati, involucro, runtime e meta. Campi effimeri non sono conservati.
Schema/family future rifiutati con messaggio leggibile; versioni mai pubblicate
non migrate. Runtime futuro o stringa versione invalida rifiutati.

`checkJellyParams({…}, {partial:true})` valida solo i valori presenti: non può
verificare una coppia se metà manca. Un futuro editor deve fondere il patch con
il documento e chiamare la validazione completa **prima** di applicarlo.
Questo è particolarmente rilevante per `applyControl`, oggi basato su checkValue
per singola chiave; va esteso con validazione atomica condivisa in M6.4.

Il serializer dedicato rivalida, ricostruisce sezioni/override in ordine dei
descrittori e scrive JSON con indentazione 2. Non serializza NaN come null.
Ordine d'ingresso arbitrario produce gli stessi byte; i valori riconosciuti
sopravvivono a round-trip, quelli sconosciuti sono intenzionalmente rimossi.
Default restituiti come oggetti nuovi, niente Date.now o random implicito.

Esempi generati, non copiati manualmente:
[Soft](examples/jelly/jelly-soft.json), [Clear](examples/jelly/jelly-clear.json),
[Candy](examples/jelly/jelly-candy.json), [Dense](examples/jelly/jelly-dense.json).
`node scripts/jelly-examples.mjs` rigenera;
`node scripts/jelly-examples.mjs --check` confronta con il serializer.
I preset hanno descrizioni, seed fissi distinti e `visuallyVerified: false`.
Nessuna promessa di contrasto su sfondi arbitrari. La modalità opaca futura
userà un corpo `#b8a2e8`/contenuto `#211735` o colori di sistema, con contrasto
misurato nel browser su testo/focus/stati, prima di dichiararla leggibile.

## M6.2 — Piano renderer e capability

Percorso primario proposto: SVG inline per silhouette, gradienti, clip, bolle e
deformazione dei soli strati decorativi; CSS statico affidabile come fallback.
Nessun filtro SVG che presupponga una cattura DOM. Il gate statico decide se il
percorso è sufficiente; WebGL2 richiederà una motivazione di fedeltà e costo,
prima di essere implementato o aggiunto alle preferenze del documento.

Matrice progettata; oggi ogni riga ha stato **non implementata**:

| Backend effettivo | Profilo ottico | Moto | Capacità ottiche | Sorgente disponibile | Ragione di degradazione |
| --- | --- | --- | --- | --- | --- |
| SVG | high/medium/low da auto o preferenza | attivo in M6.3 | volume stilizzato, highlight, inclusioni in profondità; nessuna rifrazione | DOM soltanto visibile per compositing, mai texture | rifrazione non prevista per questo backend |
| SVG | medium, preferenza static | statico | stesse capacità medium e bolle ferme | come sopra | scelta static, nessuna perdita ottica aggiuntiva |
| SVG | profilo ottico scelto | statico | come sopra | come sopra | reduced motion, offscreen o documento nascosto |
| CSS | high/medium/low (costo ridotto) | statico | tinta/gradienti/bordo/highlight/ombra; volume approssimato, senza bolle e rifrazione | nessuna texture richiesta | richiesta CSS, SVG indisponibile o budget di gruppo |
| CSS opaco / colori di sistema | qualsiasi | statico | corpo e stato leggibile; niente inclusioni/rifrazione/trasparenza | irrilevante | reduced transparency manuale/rilevata, forced-colors o fallback opaque |
| WebGL2 futuro | da definire con misure | da definire | solo capacità provate, possibile rifrazione texture | pattern/image/canvas esplicito valido | non selezionabile nel candidato M6.1 |
| WebGL2 futuro senza texture valida | da definire | indipendente dalla sorgente | mantenere corpo/inclusioni, perdere rifrazione | mancante/incompatibile | diagnostica del motivo; nessuna cattura DOM |

Lo status runtime futuro conterrà separatamente backend richiesto/effettivo,
profilo richiesto/ottico effettivo, moto attivo/statico, sorgente e motivi.
Nessuna diagnostica o misura hardware nel JSON artistico. Low riduce inclusioni
e complessità, non semantica. Static disattiva il moto senza imporre qualità low.

Se WebGL2 diventa necessario: riusare il contratto texture controllato di Glass,
con pattern deterministico, immagini caricate prima dell'uso e canvas esplicito.
Immagini remote solo con CORS valido; fallimenti di fetch/upload/context loss
devono produrre fallback e motivi. Coordinate locali CSS → UV con matrice del
source rect, crop e DPR espliciti; invalidare a load/resize/scroll/source update,
aggiornare canvas soltanto su richiesta, rilasciare texture/listener al destroy.
Video e aggiornamenti continui richiedono un contratto separato; non impliciti.

Distribuzione M6.2 proposta: PRNG Mulberry32 con seed uint32, incluso zero,
definito in un modulo puro condiviso da preview/export. Candidati con indice
stabile, coordinate locali normalizzate e profondità determinate per indice;
nessun nuovo sort casuale a resize. Conteggio richiesto
`floor(density × widthCSS × heightCSS / 10000)`, poi cap tecnico e prefisso stabile
della sequenza; il cambio qualità elimina soltanto la coda. Reproiezione al
resize senza riseminare; esclusione fuori clip mantiene gli indici originali.
Con stessi seed, documento, dimensioni, profilo e tempo controllato: stessa
distribuzione, tolleranza di progetto 1e-6 nel modello e 0.5 px fra renderer.
Queste sono specifiche da testare in M6.2, non un PRNG implementato in M6.1.

Bolle: dimensione apparente `r × (1-0.35×depth)`, contrasto attenuato dalla
profondità/volume, bordo e piccolo riflesso, clip e occlusione del corpo.
Una fascia centrale a contrasto contenuto preserva il testo, senza cambiare i
numeri casuali. Bolle deformate insieme al corpo; nessun loop acquario.
Host semantico immobile, superficie decorativa `aria-hidden` e
`pointer-events:none`, contenuto/focus separati e stabili.

Gate fixture privata su un Button: chiaro `#fafafa`, scuro `#101828`, gradiente
lilla/ciano e pattern a scacchi 8 px; geometrie 240×64, 96×48, 180×56 capsule;
testo e icona, bolle on/off, CSS e sorgente assente. Acquisire e **ispezionare**
immagini reali, descrivendo silhouette, leggibilità e difetti; snapshot stabile
non basta. Validare la riconoscibilità da fermo prima delle navbar.

## M6.3 — Piano solver, input e lifecycle

Solver puro separato dal renderer, soluzione analitica a tratti dell'oscillatore:
`x'' + 2ζω0 x' + ω0²(x-target)=0`, `ω0=2π/(responseMs/1000)` in s⁻¹.
`x` è compressione normalizzata sul lato corto, riposo/target iniziale zero;
target press = `pressStrength × maxDeformation`.
Al press cambiare il target conservando velocità; nessun impulso addizionale
persistito. Al release target zero e
`v += -releaseImpulse × ω0 × maxDeformation` (frazione lato corto/s).
Gestire rami sotto/critico/sovrasmorzato e limite per ζ≈1 senza instabilità.
Clamp di |x| a maxDeformation e azzeramento della velocità verso l'esterno
al limite; input estremi sempre finiti. Settle proposto:
`|x-target| < 1e-4` e `|v| < 1e-3 s⁻¹`, poi snap al target e stop scheduling.
Niente massa/stiffness duplicati o tempo di assestamento indipendente.

Propagazione: un modo di compressione globale con deformazione spaziale pesata
verso il contatto e rigonfiamento laterale stilizzato. Nessuna onda locale con
ritardo di propagazione dichiarata; niente controllo waveSpeed. Il renderer
deformerà una silhouette campionata, non scala dell'intero componente. La
fixture M6.2 dovrà provare questa deformabilità prima di finalizzare il solver.
Punto press locale [0,1]² effimero, tastiera al centro. Aggiornamenti ripetuti
conservano inerzia, con reset controllato solo dopo sospensione/cancel/disable.

Policy input: un puntatore attivo per superficie; ignorare i successivi fino
al release/cancel. Riusare le azioni di Button/navbar, nessun click aggiunto.
Pointerleave senza pressione rimuove hover; se interrompe una pressione senza
capture annulla e torna a riposo; cancel/lostcapture/blur/disable annullano
senza impulso di release. Non catturare puntatori se interferisce con scroll
o link. Drag solo se già previsto dal contratto host; qui non aggiunto.
Mai animazione di posizione sul focus. Disabled e active distinti anche da fermi.

Un scheduler per gruppo con budget Stage; RAF solo mentre un solver cambia.
Offscreen/documento nascosto: fermare aggiornamenti, cancellare timestamp;
resume senza recuperare il grande delta. Resize riproietta lo stato normalizzato
e aggiorna il punto locale senza rigenerare il seed. Parametri in place quando
possibile, dopo validazione atomica. Destroy idempotente cancella RAF, observer,
listener, risorse SVG/GPU e callback; gruppo condiviso distrutto solo dal owner.

Reduced motion runtime: annulla rimbalzo/deformazione, mantiene stato statico;
variazioni della media query applicate subito. Reduced transparency: rilevamento
dove esiste e preferenza manuale alternativa. Forced-colors: colori di sistema,
bordo e focus visibile, selezione/disabled distinguibili senza movimento.
Preferenze accessibili appartengono a host/runtime, non ai parametri per frame.
Posizione/velocità/pointerId/timestamp/visibilità non toccano undo, JSON o IndexedDB.

Gate solver: stessa sequenza di input con 30/60/120 Hz e frame irregolari,
stesso tempo di osservazione, errore normalizzato proposto ≤1e-4; burst, pause
lunghe, estremi dei descrittori, resize, cambi parametri e destroy in animazione.
Assert su finitezza, clamp, dissipazione a target zero e nessuna callback dopo
destroy. Tolleranze da misurare, non risultati di questa fase.

## M6.4 — Piano componenti, Inspector, persistenza ed export

`JellyGroup` implementerà `BaseMaterialGroup`, `JellySurface` implementerà
`MaterialSurface`, senza estendere il `MaterialGroup` specifico di Glass.
Il binding manterrà una facciata stabile e preserverà hover/active/disabled
nel cambio famiglia, rilasciando prima la pressione e le risorse precedenti.
Stesso modulo runtime in Studio e pacchetti estratti.

Button: una superficie decorativa, nessun cambiamento di hitbox o contenuto.
Navbar: per la prima integrazione corpo contenitore statico, feedback dinamico
soltanto sulla superficie dell'elemento selezionato/indicatore; press su altra
voce aggiorna il target locale usando i contratti di selezione esistenti.
Nessuna deformazione contemporanea di contenitore e indicatore. Brand/action
mantengono feedback statico e semantica attuale; gruppi logici e regioni
Start/Main/End non diventano superfici elastiche. Niente propagazione fra voci,
dropdown, hamburger o conversione Desktop/Mobile. Ogni proprietà componente
senza effetto va riportata dal contratto `unsupported` e dall'Inspector.

Riutilizzare `inspectorModel`, `ParamField`, validazione condivisa e
`MaterialDefinition.read/customize`; nessun nuovo Lab/Builder. Base: preset,
tinta, bodyOpacity/transmission con nomi distinti, thickness, macro softness
→ responseMs e bounciness → dampingRatio, bolle/density e auto. Le macro non
persistono valori equivalenti nuovi. Avanzato: parametri canonici, ottica,
seed e dimensioni/profondità, interazioni, qualità e diagnostica separata.
CSS deve spiegare/ritirare i controlli delle bolle/deformazioni non supportate;
nessun controllo attivo senza effetto. Patch completi validati prima di commit.

Persistenza: stesso repository IndexedDB v4 e packaging `.jello`, nessun frame
salvato. Testare materiale personale, duplicazione, progetto/draft, import/export,
riapertura e undo/redo se disponibile. Seed identico salvo rigenerazione esplicita.
Riutilizzare migrazioni esistenti, senza cambiare documenti precedenti.

Export da integrare: JSON materiale, JSON componente, pacchetto materiale con
runtime, React/TS e Vanilla per Button/Mobile/Desktop. Includere runtime vero,
CSS, tipi, chunk e asset necessari, README e manifest di capability/fallback.
Wrapper React solo lifecycle; solver e PRNG mai duplicati nei template.
Vanilla non importa React. Nessuna promessa SSR senza prova dedicata.
Jelly CSS-only escluso dai target iniziali; se aggiunto, manifest con bolle,
rifrazione e fisica mancanti e volume approssimato, senza equivalenza al runtime.

Gate consumer: estrarre realmente ZIP, installare pacchetti nel consumer React
indipendente e servirli in quello Vanilla; build/typecheck e uso reale di tutti
i componenti. Confrontare byte runtime/CSS/tipi e risultato con Studio a pari
documento, host, seed, profilo, stato, sorgente e tempo controllato.
Verificare input, callback, link, disabled, responsive, cleanup e assenza React
in Vanilla. I nomi dei file dentro ZIP non dimostrano funzionamento.

## Budget iniziali e protocollo QA futuro

**Obiettivi da calibrare**, nessuna misura Jelly disponibile:

| Profilo ottico | DPR cap | Raster equivalente per gruppo | Bolle/superficie | Bolle/gruppo | Superfici in moto/gruppo |
| --- | --- | --- | --- | --- | --- |
| high | 2 | 2 Mpx | 24 | 96 | 8 |
| medium | 1.5 | 1 Mpx | 12 | 48 | 4 |
| low | 1 | .5 Mpx | 4 | 16 | 2 |
| static | come medium | come medium | 12 | 48 | 0 |

Per SVG il budget raster è una stima di area × DPR² dei layer compositati, non
una texture allocata dal modello. Auto parte da medium e scende per budget
misurato; il resto dei gruppi condivide un limite Stage iniziale di 2 Mpx,
96 bolle e 8 superfici animate. Low preserva tinta/volume statico; superare il
budget ferma moto o riduce inclusioni con motivi leggibili, mai cambia il JSON.
SVG resolution: silhouette iniziale 32 campioni high, 24 medium, 16 low;
misurare artefatti agli angoli prima di confermare questi numeri.

Bundle: obiettivo aggiunta lazy Jelly ≤25 kB gzip, nessuna dipendenza grafica;
nessun costo di caricamento Jelly per progetti Glass/Solid. A 60 Hz obiettivo
frame work mediano <4 ms, p95 <8 ms, zero long task >50 ms attribuibile al runtime,
zero RAF a riposo. Memoria: delta del gruppo <8 MiB e ritorno entro 1 MiB dalla
baseline dopo 100 mount/destroy; misure e GC dipendono dal browser, vanno annotate.

Protocollo riproducibile: build production, una scena Button, una navbar e una
mista (8 superfici), stessi seed e geometrie; 10 s warmup + 30 s input preregistrati
+ 30 s idle, 3 ripetizioni per profilo. Registrare browser/versione/OS/hardware,
viewport, DPR, dimensioni host/area, profilo richiesto/effettivo, backend, sorgente,
preferenze, trace/frame mediano/p95/long task/memoria e confronto scena senza Jelly.
Misurare su iGPU (target ThinkPad T14 Gen1), desktop e Android/WebView reali quando
disponibili; Pixel 7 emulato non vale come Pixel 7 Pro fisico. Nessun benchmark
fisico appropriato mentre esiste solo questo modello.

QA per fase: M6.1 schema/descrittori/default/stati/serializer/preset e regressioni;
M6.2 PRNG/resize/distribuzione, immagini ispezionate e fallback; M6.3 solver,
input/lifecycle/accessibilità e budget; M6.4 registry/binding/componenti/persistenza,
E2E e consumer estratti. Usare gli script reali `typecheck`, `test`, `build`,
`test:e2e:local`, `test:perf`, `verify` secondo la fase. Browser/dispositivi non
eseguiti vanno dichiarati tali. M6 completa soltanto dopo tutti questi gate.
