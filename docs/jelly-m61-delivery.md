# Consegna M6.1 — modello Jelly sperimentale

31 ottobre 2026. Branch `main`; commit di partenza
`6ce08f74670ba0e1353d217b2768a43fe96c08a4`. Checkout iniziale pulito.
Nessun commit, push, merge o pubblicazione eseguito.

**M6.1 completata. M6 nel suo insieme non è completata.**
Il risultato è un modello puro e verificato, senza renderer o fisica eseguibile.
Jelly resta planned, non registrata, non selezionabile come materiale funzionante,
non importabile dal parser pubblico e non esportabile tramite i flussi produttivi.

## Comportamento e file

| File | Risultato |
| --- | --- |
| [RFC](jelly-material-rfc.md) | Audit del checkout, mappa file/simbolo/responsabilità/fase/rischio/test, catalogo completo, scelte e alternative, matrice capability/fallback, piani renderer/solver/export e budget da calibrare |
| [jelly.ts](../src/model/experimental/jelly.ts) | Tipo sperimentale, 33 descrittori comuni, default/sezioni, validazione atomica e incrociata, parser testo/oggetto, serializer stabile, resolver puro dell'aspetto per stato |
| [jelly-presets.ts](../src/model/experimental/jelly-presets.ts) | Jelly Soft, Clear, Candy e Dense, descrizioni e seed fissi; candidati non verificati visivamente |
| [esempi JSON](examples/jelly/) | Quattro documenti prodotti dal serializer, non preset registrati |
| [jelly-examples.mjs](../scripts/jelly-examples.mjs) | Generazione e `--check` riproducibili tramite il module runner Vite già usato dai consumer |
| [jelly-model.test.ts](../tests/unit/jelly-model.test.ts) | 87 test su parametri, vincoli, envelope, stati, candidati, serializzazione, isolamento pubblico |
| [boundaries.test.ts](../tests/unit/boundaries.test.ts) | Un test aggiuntivo sul grafo puro e l'assenza degli esperimenti da modello/runtime/Studio/export; controlli esistenti conservati |
| [tsconfig.jelly-model.json](../tests/tsconfig.jelly-model.json) | Compilazione del modello e dei suoi import con la sola libreria ES2022 e senza tipi globali DOM/Node |

Nessuna modifica al codice di produzione preesistente, alle dipendenze o ai
formati pubblici. L'unico file preesistente modificato è il test dei confini,
con un controllo aggiuntivo; nessun test allentato, skip o timeout aggiunto.

## Decisioni

- Involucro materiale v2 e familyVersion candidata 1; componente canonica v1.
  Il modello resta fuori dal barrel e da `MaterialDocument` fino all'attivazione
  atomica M6.4 con un runtime reale. Nessun renderer fittizio.
- `Descriptor`, `checkKeys`, `checkValue`, `defaultsOf` condivisi: Zod mini solo
  per l'involucro. Toggle enum per non introdurre un tipo Inspector parallelo.
  Errori rifiutano tutto; campi mancanti prendono default, sconosciuti avvisano
  e vengono rimossi; seed uint32, coppie radius/depth ordinate.
- `runtime.min` sperimentale 0.3.0 indica il tooling corrente, non supporto Jelly
  del runtime pubblico. In M6.4 servirà assegnare il minimo del runtime reale.
  Nessun cambiamento ai minimi Glass 0.2.0 e Solid 0.3.0.
- Contratto motion compatto responseMs/dampingRatio/maxDeformation. In questa
  fase sono dati; il solver analitico proposto e la deformazione spaziale sono
  descritti nella RFC, senza dichiarare onde locali o volume conservato.
- SVG primario e CSS statico fallback proposti. Rifrazione, WebGL2 e drift
  rinviati: niente parametri senza un percorso di implementazione scelto.
  Nessun loop, PRNG, risorsa GPU o stato di input implementato anticipatamente.

## Verifiche eseguite

Ambiente di esecuzione: Linux x64, Node `v22.23.1`, TypeScript/Vite/Vitest dalle
dipendenze locali; runner unitario `node`. Date del report secondo il contesto
utente Europe/Rome; gli orari stampati dall'host non sono usati come date di consegna.

| Comando | Baseline prima delle modifiche | Risultato finale |
| --- | --- | --- |
| `git status --short`, `git branch --show-current`, `git rev-parse HEAD`, `git diff --stat` | main, commit sopra, nessuna modifica locale | Solo aggiunte M6.1 e un test boundary esteso |
| `npm run typecheck` | Superato | Superato, incluso nel build finale |
| `npm test` | **411/411**, 25 file, zero skip (fuori sandbox) | **499/499**, 26 file, zero skip, zero errori; inclusi Glass/Solid, registry, inspector, migrazioni, storage/IndexedDB simulata, progetti e export |
| `npm run build` | Superato: lib, dichiarazioni e Studio | Superato; stessi 144 moduli runtime e 236 Studio |
| `./node_modules/.bin/tsc -p tests/tsconfig.jelly-model.json` | Non applicabile | Superato senza DOM né tipi Node |
| `node scripts/jelly-examples.mjs` | Non applicabile | Generati quattro JSON dal serializer |
| `npm test -- tests/unit/jelly-model.test.ts tests/unit/boundaries.test.ts` | Non applicabile | **100/100**, due file, zero skip |
| `node scripts/jelly-examples.mjs --check` | Non applicabile | Quattro esempi identici al serializer |
| `sha256sum -c /tmp/jello-m61-production-baseline.sha256` | Hash salvati dalla build baseline | JS/CSS runtime e chunk principale Studio byte-identici dopo build finale |
| `git diff --check` | Checkout pulito | Superato |

La prima baseline `npm run typecheck && npm test` nel sandbox aveva superato
typecheck e 408 test, ma il setup del relay falliva con
`listen EPERM 127.0.0.1`: tre test non eseguiti e hook timeout. La riesecuzione
autorizzata fuori sandbox ha superato **tutti i 411 test prima delle modifiche**;
anche i 499 finali sono stati eseguiti con accesso a localhost. Nessuna modifica
ai test per aggirare il limite ambientale.

La build baseline e finale producono il medesimo avviso Vite sul chunk Studio
oltre 500 kB (630.53 kB prima e dopo). Il lockfile ha già una versione radice
0.1.0 diversa da package/runtime 0.3.0: anomalia preesistente documentata nella
RFC; non è stata aggiornata incidentalmente.

Hash verificati dalla build baseline e finale:

```text
9411d44c113d9b9bd2d4e18cf10f750c4bfed5946ab54aca40790e944a01bfd3  dist-lib/jello.js
5fb34366844700a325d8d6d0bd1a4432d10265cdb10519db10a50cabb758fa1a  dist-lib/jello.css
edc5bf59419f1016f4592aedf4bf7f3d88c422ad768186fca442071d7d1acfa2  dist/assets/lab-Bv_Q91HJ.js
```

Gli hash coprono questi tre artifact, non un confronto esaustivo di ogni file
generato. Il test del grafo verifica separatamente che gli esperimenti non siano
raggiunti dalle entry produttive. La compilazione ES2022 e i test nel runner
Node provano il confine dati senza affidarsi alla presenza di un browser.

Non eseguiti in M6.1: `test:e2e:local`, `test:perf`, `verify` completo,
WebKit/Safari, browser reali, consumer Jelly estratti, confronto visivo,
stabilità del solver, prestazioni, dispositivi fisici o Android WebView.
Il codice produttivo e gli artifact confrontati sono invariati; questa fase
richiede verifica dati/confini e regressione unitaria/build. Nessuna immagine
prodotta perché manca un renderer. I precedenti report E2E M5 non sono usati
come una nuova esecuzione o certificazione Jelly.

## Gate e limiti

| Gate M6.1 | Esito / evidenza |
| --- | --- |
| Modello importabile senza DOM | Soddisfatto: ES2022 senza tipi DOM/Node, unit test Node e grafo puro |
| Round-trip stabile e senza perdita dei campi riconosciuti | Soddisfatto: sezioni/stati/meta, colori, seed zero, ordine arbitrario, quattro candidati |
| Validazione incrociata | Soddisfatto: radius/depth min ≤ max anche dopo default, seed intero, errori atomici |
| Regressioni Glass/Solid | Soddisfatto per unitari e build; E2E non rieseguiti |
| Jelly non disponibile nella UI produttiva | Soddisfatto: planned/versione 0, nessun registry/runtime/preset pubblico; entry senza import sperimentali, chunk Studio identico |
| Formati esistenti conservati | Soddisfatto: nessuna modifica a schema, parser pubblico, serializer, minimi o DB |
| RFC, catalogo, esempi, candidati, piani e report | Consegnati e collegati sopra |

Non ci sono gate M6.1 aperti né decisioni bloccanti che richiedano input utente.
Restano rischi delle fasi successive: resa SVG ancora da valutare, nessun contrasto
dei candidati certificato, radius e budget di inclusioni da provare al resize,
patch dell'Inspector da validare contro il documento completo, binding binario
e stato pressed da gestire nel cambio famiglia, export con assunzioni non Glass
= Solid. Il floor runtime Jelly definitivo dipende dall'attivazione reale.

Prossimo passo preciso: **M6.2, fixture privata su un singolo Button** con
superficie SVG decorativa e fallback CSS statico, usando direttamente questo
modello. Implementare PRNG deterministico e distribuzione stabile, poi acquisire
e ispezionare la matrice di immagini indicata nella RFC prima di promuovere
backend, preset o parametri e prima di estendere alle navbar.
