# M6.4.1 — consegna

Branch `m641-material-library-integrity`, da `8e077bd` (M6.4). Nessun merge su `main`. Dettagli: [material-catalog.md](material-catalog.md), [jelly-m641-integrity.md](jelly-m641-integrity.md).

## Cosa cambia

| Area | Modifica |
|---|---|
| Catalogo | `src/model/catalog/` (`index.ts` lab‑only, `names.ts` + `experimental-names.ts` fonte unica dei nomi); validazione `validateCatalog()`; capacità = effetti usati, confrontati con i parametri |
| Nomi | Glass · Default/Frosted/Refractive/Subtle, Refraction Test (diagnostica), Solid · Matte/Dark/Accent Blue/Outlined, Jello · Soft/Clear/Candy/Dense. **Id invariati**, valori numerici invariati |
| Compatibilità | `materialRevision` continua a hashare i nomi pre‑M6.4.1 (`revisionName`): componenti legati a un preset restano `linked` |
| Library | card con famiglia · trattamento · disponibilità · descrizione · limiti; filtro «Jello · sperimentale» con anteprima reale caricata a richiesta; diagnostica solo in modalità avanzata; «Incluso» al posto di «Jello» come origine |
| Persistenza Jello | DB sperimentale v2: `rev` + compare‑and‑swap transazionale, store `jelly-quarantine`, inventario in sola lettura; `purgeOrphans` rimosso |
| Workbench | coda ordinata, guardie sul cambio progetto, modifiche conservate durante un salvataggio, bozza riprogrammata dopo un errore, conflitti multi‑scheda espliciti |
| Reconcile | rileva · classifica · esporta · quarantena reversibile; nessuna cancellazione |

Non toccati: formato `.jello`, `material.preset`, DB stabile, fisica M6.3, valori dei preset, UI mobile, dashboard.

## Verifica (questa macchina, 2026‑11‑03)

| Controllo | Esito |
|---|---|
| `tsc --noEmit` | verde |
| Vitest | 770/770 (da 664: +106 tra catalogo, boundary, integrità) |
| `npm run build` (lib + jelly + tsc + vite) | verde |
| E2E Chromium, suite intera | 285/285 (prima della correzione finale del workbench, §sotto) |
| E2E Firefox + mobile emulato, suite intera | 505 passati, 1 fallito (nuovo test di questa milestone, vedi §Difetti trovati), 64 saltati |
| E2E dopo la correzione finale: `jelly-studio` + `material-library` su Chromium, Firefox, mobile, ×2 | 124 passati, 8 saltati, 0 falliti |
| WebKit | **non eseguito** (dipendenze di sistema mancanti sull'host) |
| Boundary | verdi, con 5 verifiche nuove (catalogo e nomi sperimentali fuori dal runtime esportabile) |

Non rieseguita dopo l'ultima correzione: la suite intera su Firefox/mobile (rieseguite le spec del Jello Lab e della Library).

Build a confronto con M6.4: `dist-jelly` differisce solo per i nomi e note dei preset Glass e Solid (la libreria li include) e per la rinomina di simboli del minificatore (nessuna differenza di logica, verificato sulle stringhe); `dist-lib` differisce per i nuovi nomi, `revisionName` e `types/model/catalog/names.d.ts`. Nessun nome sperimentale nei bundle produttivi.

## Difetti trovati lungo il percorso

1. **M6.4 — confermati** (riprodotti su `8e077bd`): modifica persa durante un salvataggio, sovrascrittura silenziosa tra schede, bozza di B scritta con il documento di A, bozza non riprogrammata dopo un errore. Corretti.
2. **Rischio di compatibilità** (trovato leggendo il codice, non dall'app): la rinomina dei preset avrebbe fatto risultare `outdated` ogni componente legato. Corretto con `revisionName`, coperto da un test che fallisce senza.
3. **Nel mio primo codice**: un conflitto di bozza sostituiva il conflitto sulla copia, togliendo il pulsante «Salva come nuova copia». Trovato da un E2E su Firefox (instabile in suite, passava da solo), riprodotto con un test unitario che fallisce sul codice precedente, corretto: il conflitto sulla copia ha la precedenza.
4. Il messaggio d'errore del parser (`family: "jelly" (Jello) non è ancora disponibile…`) ora cita sia id sia nome.

## Problemi residui

| P | Problema | Impatto / riproducibilità | Proposta |
|---|---|---|---|
| P2 | Nessuna cancellazione definitiva della quarantena | i record orfani si accumulano (poca roba) | cancellazione della sola quarantena, dopo esportazione, in M6.5 |
| P2 | Bozza memorizzata illeggibile: conservata ma mai ripulita | un avviso resta finché non la si risolve a mano | azione «sostituisci bozza» con conferma |
| P2 | Una sola bozza per progetto: due schede su documenti diversi si segnalano conflitti di bozza | solo con due schede sullo stesso progetto | bozza per documento |
| P3 | Conflitto sulla prova del Builder entro 400 ms dall'uscita dal componente non mostrato | raro | tenere una coda per componente |
| P3 | Verifica+quarantena non atomiche tra i due database | finestra di ms, azione reversibile | accettato |
| P3 | Anteprima Jello della Library: una istanza del renderer per card | 4 card, nessun problema misurato | coordinatore condiviso |
| P3 | Nessun segnale tra schede (BroadcastChannel): i conflitti emergono al salvataggio | solo UX | segnale non vincolante |
| P3 | Preset Jello non approvati visivamente (valori M6.2) | invariato per scelta | milestone di calibrazione |

Nomi nella documentazione storica (`docs/jelly-m6*-delivery.md`, `material-model.md`, fixture legacy): lasciati com'erano, sono atti storici; `material-model.md` elenca ancora i nomi di M5.

## Decisione: **PARTIAL**

Tutti i criteri di accettazione sono soddisfatti e verificati tranne: WebKit non eseguibile sull'host; suite intera su Firefox/mobile non rieseguita dopo l'ultima correzione; nessun controllo visivo dell'aspetto delle nuove card (verificato per struttura e contenuto, non con screenshot).
