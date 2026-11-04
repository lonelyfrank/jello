# M6.4.3.A — Jello Visual Review: architettura e UX

> Il workspace serve a **decidere** con un occhio umano e con dati. Non promuove nulla: `visuallyVerified` resta `false`, i built-in non cambiano, nessuna decisione è presa dallo strumento (vedi §6).

## 1. Dove sta e come si apre

Vista del Jello Lab, non un'area nuova dello Studio (nessun percorso di navigazione fittizio): dalla toolbar dell'anteprima del Jello Lab, **«Visual Review»** (`#jl-open-review`). «Torna al Lab» (`#rv-back`) la chiude. È un chunk a parte (`ReviewWorkspace-*.js`, 51,7 kB / 17,2 kB gzip + 6,7 kB CSS), caricato con `import()` **solo alla prima apertura**, dentro l'`ExperimentalBoundary` esistente: se il chunk non si scarica, il Lab e lo Studio restano intatti e «Riprova» funziona (test E2E). All'avvio dello Studio e all'apertura del Jello Lab il chunk non viene richiesto (test E2E).

Scelta di integrazione: sottosezione del Jello Lab (la meno invasiva). Tocca il codice esistente solo in modo additivo:

| File | Modifica |
|---|---|
| `JellyMain.tsx` | stato `review`, import dinamico del workspace dentro `ExperimentalBoundary` |
| `JellyPreview.tsx` | prop opzionale `onOpenReview` + un pulsante |
| `JellyButton.tsx` | props opzionali `ariaLabel` (solo icona) e `renderExtra` (opzioni di rendering, es. `treatment`) |
| `bridge.ts` | `press(pressed, point?)` e `hover(hovered)`: le stesse chiamate che l'adattatore DOM fa sulla superficie, senza eventi DOM |
| `tests/unit/boundaries.test.ts` | una voce in più nell'elenco dei blocchi Studio importabili dai moduli sperimentali (`ExperimentalBoundary`): **modifica deliberata a un contratto esistente**, necessaria per riusare il boundary, non per aggirarlo |

Nuovi: `src/lab/experimental/jelly/review/` (`variants.ts`, `review-model.ts`, `decisions.ts`, `timeline.ts`, `sync.ts`, `ReviewWorkspace.tsx`, `ReviewStage.tsx`, `ReviewInspector.tsx`, `review.css`).

## 2. Cosa riusa e cosa non duplica

- **Un solo renderer.** Ogni superficie è `JellyButton` → `JellyBridge` → `ExperimentalJellySurface` su un vero `<button>`: testo, icona e hitbox appartengono al Button, non alla decorazione SVG (test E2E: la decorazione è `aria-hidden` e senza testo; la hitbox non cambia durante la deformazione). Anche le miniature dei preset nella colonna sinistra usano il renderer reale.
- **Nessuna logica ottica o di movimento nel frontend.** `variants.ts` deriva i documenti con `createExperimentalJellyDocument` (solo descrittori esistenti); i valori di moto mostrati nell'Inspector vengono da `motionMetrics()`, che chiama le stesse funzioni pure dell'oscillatore usate dalla superficie.
- **Varianti.** Derivate **in memoria** dai built-in (clonati). I valori candidati sono quelli di `tests/fixtures/jelly-m643/variants.ts`, ripetuti in `src/` perché `src/` non importa mai da `tests/`; il test `m643a-review.test.ts` verifica che producano documenti **uguali** (A/B1/B2/B3 × 4 preset, più la tinta normalizzata). Nessuna variante entra in Library, nell'archivio o nel registro.
- **Convenzioni UX dello Studio.** `Segmented`, `Switch`, `Ic`, chip, banner, livello Base/Avanzata (`useJellyView().level`, lo stesso dell'Inspector Jello), pannelli richiudibili, drawer su telefono.

## 3. Layout

**Desktop, tre colonne** (con tre pannelli richiudibili):

1. **Preset & Variants.** I quattro preset (miniatura reale + stato decisionale) e, per il preset scelto, A/B1/B2/B3 con identificatore, tipo di esperimento, trattamento di rendering, numero di parametri diversi da A («identica a …» quando lo è), stato «Non approvata». Provenienza e limitazioni nell'Inspector.
2. **Comparison Stage.** Modalità, viewport, sfondo, contenuto, stato, zoom CSS, movimento ridotto simulato, input sincronizzato, tinta normalizzata, «Prova rimbalzo», «Ripristina», diagnostica essenziale (dimensione, **DPR del browser**, numero di superfici, avviso di fallback CSS).
3. **Review Inspector** con otto sezioni (`<details>` nativi): Optical Identity · Material Body · Edge & Surface · Internal Bubbles · Motion & Elasticity · Accessibility · Performance · Review Decision. **Base**: criteri, riepiloghi, «cosa cambia rispetto ad A». **Avanzata**: tabelle A contro variante, trattamento, provenienza, misure di moto, stato live del renderer (backend, bolle, alpha/trasmissione effettivi, nodi, frame dello scheduler). Nessun controllo finto: l'Inspector non modifica documenti.

Quando l'area centrale è stretta, la griglia passa da 2×2 a 1×2 a una colonna (`auto-fit`, massimo due colonne) senza sovrapposizioni (test E2E su tre dimensioni × cinque sfondi, zoom 200 %).

**Telefono (≤ 900 px):** colonna unica con l'anteprima in posizione prioritaria, selezione preset/varianti compatta a due colonne, confronto sequenziale a una colonna, Inspector come drawer inferiore chiuso di default (`#rv-toggle-right` / «Chiudi»), nessuno scroll orizzontale (test E2E con `mobile-emulated`, che è **emulazione**, non un telefono).

## 4. Le tre modalità

| Modalità | Superfici | Input |
|---|---|---|
| **Affiancato** | A e la variante in discussione (solo A se è A) | indipendente o sincronizzato |
| **Quattro varianti** | 2×2: A·B1 / B2·B3, oppure — asse «Preset» — i quattro preset con la stessa variante (con «Tinta normalizzata» è la matrice di §9) | idem |
| **Movimento** | le quattro varianti con orologio manuale | Play · Pausa · Restart · Step · cursore · otto fasi |

Condizioni uguali per tutte le celle: dimensione, sfondo, contenuto, seed (quello del documento: invariato da A), stato forzato e DPR del browser. Il «DPR» mostrato è `window.devicePixelRatio` **reale**: la vista non lo emula (lo zoom 100/200 % è uno zoom CSS e lo dichiara); gli strumenti automatici lo impostano con `deviceScaleFactor` (DPR 1 e 2 nei test e negli screenshot).

### Input sincronizzato (`sync.ts`)
La cella con cui si interagisce mantiene il proprio adattatore di input reale; l'hub inoltra alle altre il **risultato semantico** (pressione con punto di contatto, rilascio, hover, annullamento) tramite `bridge.press/hover/reset`. Non ridistribuisce eventi nativi e non genera click: verificato in E2E (un `pointerdown` e un `click` nativi sulla sola cella premuta, **nessun** evento nativo sulle altre; stessa cosa con Spazio). Spegnere la sincronizzazione a metà gesto rilascia le altre celle.

### Timeline controllata (`timeline.ts`)
Le superfici accettano già un coordinatore con orologio iniettabile (lo usa l'harness M6.4.3). L'adattatore fornisce un `ManualClock` e riproduce pressione a 0 ms e rilascio a 600 ms; **ogni frame è disegnato dal renderer reale** con l'oscillatore reale: nessun secondo solver, nessun frame precalcolato. Tornare indietro **azzera le superfici e le riporta al tempo scelto riproducendo lo stesso input**, che è esattamente come ci erano arrivate: lo scrubber è deterministico (test E2E: stesso fotogramma a 300 ms prima e dopo aver visitato 100 e 900 ms). Limiti dichiarati:
- la posizione del cursore si ottiene per *replay* (fino a ~160 passi da 16 ms), non per salto;
- le celle sono `inert` (si pilotano dai controlli);
- il renderer sospende le superfici fuori schermo e le riprende a riposo: il workspace le riallinea al tempo corrente quando tornano visibili (`IntersectionObserver`); finché sono fuori vista mostrano il riposo;
- con movimento ridotto (simulato o di sistema) le superfici non si deformano e il workspace lo dice.

## 5. Condizioni di prova

Dimensioni 80×32, 160×44, 320×96 e personalizzata (48–480 × 24–160, bloccata ai limiti); sfondi Chiaro, Scuro, Gradiente, Testo (paragrafo reale dietro il Button), Strutturato; contenuti etichetta breve, etichetta lunga, icona + testo, solo icona (nome accessibile `aria-label`); stati Interattivo, Hover, Premuto, Attivo, Disabilitato.

## 6. Decisioni e report

Per preset: **Pending · Candidate Accepted · Needs Refinement · Rejected**, più variante scelta, motivazione, aspetti positivi, problemi visivi, correzioni richieste, limitazioni accettate, note tecniche e data (generata *al momento* della decisione). Regole (`decisions.ts`, con test):

- nessuno stato diverso da Pending viene mai assegnato da misure o test: l'unica porta è `setDecisionStatus`, chiamata da un click;
- serve una motivazione per qualunque stato diverso da Pending, e una variante per *Candidate Accepted*;
- tornare a Pending cancella la data; modificare un testo non cambia lo stato;
- lo stato di consegna (`TECHNICAL REVIEW READY` / `VISUAL REVIEW PARTIAL` / `VISUAL REVIEW COMPLETE`) è derivato dalle sole decisioni scritte.

**Persistenza.** Record separato e versionato (`jello-visual-review` v1) nel `localStorage` del browser alla chiave `jello-jelly-review-v1`, per vista: non tocca preset, materiali, bozze, libreria, IndexedDB né lo schema (test E2E «contracts»: nessun altro dato cambia; unico altro valore scritto è la preferenza Base/Avanzata già esistente). Un record illeggibile o più nuovo **non viene sovrascritto** finché l'utente non sceglie «Sostituisci il registro locale». Se lo storage non è disponibile, le decisioni restano in memoria e il pannello lo dice. Il `localStorage` non è un archivio affidabile: **il report esportato è la forma duratura**.

**Report** (JSON e Markdown, scaricati dal browser, `buildReport`): stato di consegna, condizioni di prova (modalità, dimensioni, sfondo, contenuto, stato, tinta normalizzata, movimento ridotto, sincronizzazione, DPR), per preset la decisione e, per variante, trattamento, numero di parametri cambiati, equivalenze e metriche di moto del modello; le superfici **effettivamente montate** con ciò che il renderer riporta (backend, opacità, moto, bolle, alpha e trasmissione effettivi); limiti; «NOT TESTED»; riferimenti. Branch e commit **non sono disponibili al runtime del browser**: il report lo dice (`null` + nota) invece di inventarli; il commit esaminato è in `verification.json`. Stesso input → stesso report (tranne `generatedAt`), test E2E e unitario.

## 7. Stati vuoti ed errori

| Situazione | Comportamento |
|---|---|
| Chunk non caricabile | banner dell'`ExperimentalBoundary`, «Riprova», resto dello Studio intatto |
| Backend CSS / SVG non disponibile | avviso nel palco («niente bolle né deformazione, il confronto di movimento non è significativo») e nell'Inspector |
| Documento di variante non valido | messaggio accanto alla cella; il Button resta nativo (comportamento del bridge) |
| Report non generabile | messaggio nel pannello decisioni |
| Registro locale illeggibile/più nuovo | banner e nessun salvataggio fino a scelta esplicita |
| «Nessun preset selezionato» | non può verificarsi: un preset è sempre selezionato (è il default Soft) |

## 8. Differenze rispetto al piano

- Le **varianti** nella colonna sinistra non hanno miniatura propria (solo i preset ne hanno una reale): quattro superfici in più sempre montate pesavano senza aggiungere informazione rispetto al palco.
- Il confronto **Clear contro Glass** non è nel workspace: il codice sperimentale non può importare il runtime produttivo (test di confine) e non intendo accoppiarli. Resta `NOT TESTED` (vedi `preset-evaluation.md`).
- I criteri E (§7 del brief) compaiono nell'Inspector come testo di riferimento; non c'è una soglia numerica universale.
- Branch/commit nel report: `null` con nota, per quanto sopra.
