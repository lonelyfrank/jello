# M6.4.2 — Problemi e correzioni

Registro finale. Gli ID M642-00…16 sono quelli di `audit-baseline.md` (riprodotti **prima** di toccare il codice); M642-17…21 sono emersi durante l'implementazione, con lo stesso metodo (riproduzione nel browser o test che fallisce prima della correzione). Nessun problema è stato inventato per giustificare una modifica: ogni riga ha un test o una prova citata.

Priorità: **P0** bloccante · **P1** importante · **P2** rifinitura. Stato: **Corretto** · **Rinviato** (decisione esplicita, vedi motivo) · **Documentato** (non è un difetto, è una proprietà da conoscere).

**Nessun P0 trovato.** Nessuna perdita di dati, nessuna corruzione di documenti, nessun export non funzionante, nessun problema di sicurezza.

## Riepilogo

| Priorità | Trovati | Corretti | Parzialmente | Rinviati |
|---|---|---|---|---|
| P0 | 0 | 0 | 0 | 0 |
| P1 | 11 (+1 introdotto e corretto in M6.4.2: M642-22) | 12 | 0 | 0 |
| P2 | 11 | 8 | 1 (M642-13) | 2 (M642-14, M642-15) |

## P1

| ID | Area | Problema | Correzione | Test (nuovo) | Commit |
|---|---|---|---|---|---|
| M642-00 | Jello lab · `workbench.ts` | Un conflitto sulla bozza sostituiva il conflitto sulla copia: persa la via d'uscita "salva come copia" | Già scritta dall'utente nei commit locali non pushati di `m641`; portata con `cherry-pick` | `jelly-integrity.test.ts` (2 test × memory/IndexedDB; **falliscono su `origin/main`**) | `a2d421f`, `a3b9be7` |
| M642-01 | Home | La tile «Jello» diceva "In sviluppo / presto" ed era inerte, con Jello β funzionante nella rail | Tile «Jello β» con tag β, apre il Jello Lab; stato bloccato spiegato come per le altre | `m642-studio › the Jello tile is the experimental family…` | `c62bcbd` |
| M642-02 | Rail, Home | Senza progetto 7 aree su 10 erano `disabled` senza ragione; non focalizzabili | `aria-disabled` + `aria-describedby` verso «Serve un progetto: crealo o importalo dalla Home»; nota visibile nella Home; il click non fa nulla | `m642-studio › one h1; areas that need a project say so…` | `c62bcbd` |
| M642-03 | Kit nuovo progetto | `KIT_PRESETS` copiava la configurazione diagnostica «Refraction Test» tra i materiali personali di ogni nuovo progetto (visibile in Library con la diagnostica spenta) | Rimossa dal kit e dai chip del wizard. I progetti esistenti **non** sono modificati | `m642-quality.test.ts`; `m642-studio › the kit creates no diagnostic configuration…`; `projects.spec` aggiornato (4→3 materiali) | `c62bcbd` |
| M642-04 | Home · Material Gallery | Mostrava Refraction Test come 2° preset, ometteva 3 preset Solid su 4, etichetta `glass · preset Jello`, testo "Jelly… renderer in sviluppo" | 8 preset non diagnostici, etichetta «Famiglia · trattamento» dal catalogo, testo corretto | `m642-studio › the Material Gallery shows the 8…` | `c62bcbd` |
| M642-05 | Jello lab, Builder | «Base: Jelly Soft», «Ripristina «Jelly Soft»», didascalie del confronto «Jelly Candy», «Prova con Jelly», «Prova Jelly», messaggi d'errore «Documento Jelly» accanto a «Jello · Soft» | `presetLabel()` (nome del catalogo) e «Jello» nei testi per l'utente. Il nome **persistito** resta «Jelly Soft» (verificato) | `m642-studio › Jello vocabulary` (×2) | `c62bcbd`, `41f97c3` |
| M642-12 | Builder · raggio px | `aria-labelledby` puntava a un id inesistente: il campo si chiamava solo «px» | La `<label>` ha l'id atteso | `m642-studio › the px radius field has an accessible name…` + nessun `aria-labelledby` pendente in tutta la pagina | `c62bcbd` |
| M642-17 | Material Lab | **Il ↺ di un parametro e «Ripristina iniziali» riportavano ai default generici di famiglia** (blur 2) invece che ai valori della base (Frosted: 14). Il Jello lab già tornava alla base | ↺ → valore della base (preset incluso, o preset da cui la copia personale deriva: `meta.basedOn`); nuovo «Ripristina «Glass · Frosted»»; «Valori di base Glass» mantiene i default di famiglia; il tooltip dice il valore di destinazione | `m642-studio › reset goes back to the base…` (×3: Glass, Solid, copia personale) | `2c535d1` |
| M642-18 | Studio, aree sperimentali | **Se un chunk lazy di Jello non si carica (offline, richiesta bloccata, deploy datato) l'intero Studio si svuotava**: `#app` vuoto, rail sparita, nessuna via d'uscita; nessun error boundary in `src/` | `ExperimentalBoundary`: il guasto resta nel Jello Lab / nell'anteprima della card / nella prova del Builder, spiega cosa è successo, non tocca progetto né autosave; «Riprova» ricarica senza reload | `m642-resilience.spec` (3 test × Chromium/Firefox) | `7c35a07` |
| M642-19 | **Runtime pubblico** · `createSceneView` | `loaded ??= import(...)` memorizzava per sempre una promessa rifiutata: dopo un errore di rete transitorio ogni chiamata falliva fino al reload | Un caricamento fallito non è ricordato: la chiamata successiva ritenta | `scene-loader.test.ts` (**fallisce senza la correzione**: `expected true to be false`) | `7c35a07` |
| M642-20 | Stage DOM · scene | **Le scene «Jello Dark», «Jello Light», «Gradient», «Checker», «Contrast» (voci di «Sfondo di prova») disegnavano una pagina bianca vuota**: la regola base `.scene` (una classe, più in basso) sovrascriveva per ordine di sorgente i loro `background` | Selettori `.scene.scene-*`; `min-height` delle scene Jello come previsto | `m642-studio › test backgrounds really are what their name says` (Chromium + Firefox) | `bd6838b` |

| M642-22 | Material Lab · campi numerici | **Regressione introdotta da M642-17 durante questa milestone**: il descrittore con il valore-base era un oggetto nuovo a ogni render e `NumberField` risincronizza il testo quando cambia `d`: un valore digitato (anche non valido) veniva cancellato da un re-render del pannello. Trovata dalla verifica finale completa (test esistente `navbar.spec:348` instabile su `mobile-emulated`), non dai test scritti per M642-17 | Descrittori memoizzati (`useMemo` su `[base]`) in Glass e Solid | `m642-studio › typing survives a re-render` — **fallisce sulla build con il difetto** (`Expected: "abc" · Received: "14"`), passa dopo; `navbar.spec:348` 8/8 su phone e desktop | (commit finale) |

M642-20 è stato scoperto dalla matrice di screenshot, non dai test: la regressione visiva ha trovato un difetto che nessuna asserzione DOM vedeva (il confronto `m642-compare` contro `origin/main` mostra le scene cambiate al 96–98 % dei pixel, mentre `text`, `photo` e `solid` sono **identiche**).

## P2

| ID | Problema | Stato | Dove / perché |
|---|---|---|---|
| M642-06 | «Template e preset inclusi» (Home) elencava la diagnostica | Corretto | `m642-studio › Home «Template»…` |
| M642-07 | Badge «Diagnostica» della Library sempre 0 | Corretto | `m642-studio › Library: no Refraction Test…` |
| M642-08 | Con la famiglia Jello: «Buttons 0», «Navigation 0», «Le mie creazioni 0», «Preferiti 0» | Corretto | categorie ridotte a «Tutti» e «Materiali»; una categoria non più esistente ripiega su «Tutti» |
| M642-09 | Due `<h1>` al primo avvio | Corretto | `HomeEmpty` usa `<h2>`; verificato in 6 viewport (`m642-a11y`) |
| M642-10 | `FamilyInfo.editor` dice `false` per Solid e nessuno lo legge | Corretto | valore reso vero; commento chiarito; `m642-quality.test.ts` |
| M642-11 | `aria-pressed` + `aria-current` sui pulsanti della rail | Corretto | solo `aria-current="page"` |
| M642-13 | Controlli numerici del Builder meno completi di quelli del Material Lab | **Parzialmente corretto**; resto **rinviato** | Corretti: messaggio con l'intervallo ("serve un numero da 0 a 120 px. Non applicato."), regione `aria-live` sempre montata. **Rinviati**: ripristino per singolo campo, frecce ↑/↓. Richiedono di decidere cosa significhi «base» per una proprietà di componente (oggi c'è già «Ripristina materiale»); sono nuova UI, non un controllo ingannevole |
| M642-14 | Ciclo di import `definition` ↔ `navbar-desktop` ↔ `navbar-structure` | **Rinviato** | Nessun malfunzionamento: gli usi sono dentro funzioni. Rischio di un refactor > beneficio; il grafo è rieseguibile (`docs/m642/tools/import-graph.mjs`) |
| M642-15 | `raster.spec.ts` riscrive `verification/*.json` (campo `date`) a ogni esecuzione | **Rinviato** | È un registro volontario ("verificato in questo browser, questo giorno"): va aggiornato solo quando la suite raster passa. Prima di ogni commit i file sono stati ripristinati (`git checkout verification/`) |
| M642-16 | `CreateDialog` deduceva «Glass» da «non è Solid» | Corretto | `familyLabel()` |
| M642-21 | Nessun modo di **ripristinare il layout** (larghezze, pannelli chiusi, scheda dell'Inspector, zoom): richiesto da §4.1 | Corretto | Impostazioni → «Layout dello Studio» → «Ripristina il layout» (`resetLayoutPreferences`: non tocca area corrente né «Avanzato: diagnostica»); `m642-quality.test.ts` + `m642-studio › layout (§4.1)` |

## Documentato (non sono difetti)

- **O-1 · Solid `finish: soft` è quasi invisibile su fondi chiari.** È il 12 % di bianco sul riempimento: su `#f1f3f5` sono < 2/255 per canale (misurato). Su fondi scuri o saturi (Dark, Accent Blue) si vede. La descrizione dichiara «appena percettibile». Il test del controllo usa quindi Solid · Dark.
- **O-2 · Solid hover di Neutral è sottile**: fill `#f1f3f5 → #e7eaee` (≈ −10/255) più elevazione 2.
- **O-3 · Jello Soft e Clear sono meccanicamente identici** (stessi `responseMs`, `dampingRatio`, `maxDeformation`…): differiscono solo per i parametri ottici. Il rimbalzo di Soft dopo il rilascio è 0,0027 (≈ 0,1 px a 44 px): «risposta morbida» è un ritorno liscio, non un rimbalzo percepibile. Vedi `material-quality.md`, proposta di tuning (non applicata).
- **O-4 · Le copie del kit hanno lo stesso nome dei preset inclusi** («Glass · Default» compare due volte nella Library, distinte da «Incluso»/«Personale»). Il mandato (§8.1) chiede di non duplicare senza motivo: la motivazione è che la copia personale è del progetto ed è modificabile; l'etichetta di origine la distingue. Non modificato.
- **O-5 · Il README del pacchetto Jello non è nella lista hash del manifest**: per costruzione (il README cita il manifest; il manifest non può contenere l'hash di un file che dipende da lui, né di sé stesso). Lo script di verifica lo dichiara.

## File modificati (src)

26 file, +271 −87 rispetto a `origin/main`: `src/lab/app/{BuilderJellyTrial,CreateDialog,ExperimentalBoundary(nuovo),FieldControl,Flows,Home,ParamField,Properties,StudioLibrary,StudioNav}.tsx`, `src/lab/experimental/jelly/{JellyDiagnostics,JellyInspector,JellyLibrary,JellyPreview,package,repository,workbench}.ts(x)`, `src/lab/{material-base(nuovo),projects,session,studio.css}.ts`, `src/model/families.ts`, `src/runtime/scene.ts`, `src/stage/stage.css`. Nessun formato persistito, nessuno schema, nessuna versione toccati.
