# Jello — readiness visiva e di rendering per M6.5 (aggiornamento di M6.4.3)

Aggiorna le righe di `docs/m642/jello-m65-readiness.md` che M6.4.3 tocca; le altre restano com'erano. **Valutazione, non promozione**: il registro produttivo non è stato modificato, Jello resta `planned`. Classi: `READY` · `PARTIAL` · `BLOCKED` · `NOT TESTED`.

| # | Requisito (numerazione M6.4.2) | M6.4.2 | Ora | Evidenza e cosa manca |
|---|---|---|---|---|
| 1 | Qualità percettiva dei quattro preset | PARTIAL | **PARTIAL — VISUAL APPROVAL PENDING** | Esistono candidati misurati e riproducibili (B1/B2/B3) che affrontano i tre limiti segnalati (Dense non corposo: luminanza 0,59→0,49; Candy senza bordo: 0,0035→0,039; Clear debole su chiaro: 1,29→1,34; Soft/Clear meccanicamente distinti). **Nessuna review indipendente**, nessun built-in cambiato, `visuallyVerified: false`. Bolle ancora poco leggibili a 80×32. Vedi `visual-review.md` |
| 2 | Affidabilità della fisica | READY | **READY** | invariata; verificati determinismo, energia limitata e ritorno a riposo anche per i valori B2 e per lo stress «40 pressioni alternate a 30 ms» e l'estremo valido (`motion-metrics.json`: ampiezza ≤ limite, velocità ≤ tetto, assestamento in 673–748 ms) |
| 3 | Performance | PARTIAL | **PARTIAL (migliorata la diagnosi)** | `performance.md`: 12 e 24 superfici misurate (A e candidato), 0 RAF a riposo, nessun long task, nodi costanti; renderer isolato: 4 listener per superficie, tutti rilasciati; +12 listener non riprodotto con GC forzato; heap del renderer stabile. **Ancora aperti:** telefono/GPU, bundle di produzione servito, crescita di heap a livello Studio non diagnosticata |
| 4 | Compatibilità browser | PARTIAL | **PARTIAL** | Chromium e Firefox. **WebKit NOT RUN**, Safari iOS e Android WebView NOT TESTED |
| 5 | Integrazione col documento canonico | BLOCKED | **BLOCKED** | invariato. Un'osservazione utile per M6.5: il trattamento di rendering (`m642`/`m643`) è deliberatamente **fuori dal documento**; promuoverlo a campo persistito richiederebbe una decisione di schema che M6.4.3 ha evitato |
| 6 | Adattamento del Builder | PARTIAL | **PARTIAL** | invariato |
| 7 | Export React / Vanilla | BLOCKED | **BLOCKED** | invariato; il pacchetto sperimentale contiene la nuova opzione (+2,3 kB) ed è stato riverificato (4 pacchetti × Chromium/Firefox × moto normale/ridotto = 16 esecuzioni OK) |
| 8 | Migrazione dei dati sperimentali | PARTIAL | **PARTIAL** | invariato: nessuna modifica di schema; la politica di revisione dei preset è analizzata in `compatibility.md` §3 (bozze non toccate che seguono la base viva) e non implementata |
| 9 | Compatibilità con Glass/Solid | PARTIAL | **PARTIAL** | runtime produttivo identico byte per byte in dimensione (202 194 B); non provati Jello+Glass nello stesso `GlassGroup`, navbar, overlay |
| 10 | Accessibilità | PARTIAL | **PARTIAL** | contrasto etichetta/pixel misurato per le varianti (idle, 4,81–6,20 minimo); stato premuto, lettore di schermo e sfondi `text`/`structured` non misurati |
| 11 | Isolamento e fallimento | READY | **READY** | confine lazy intatto; nessun import dal runtime produttivo |
| 12 | Capacità dichiarate = implementate | READY | **READY** | `unsupported` invariato (nessuna rifrazione, volume, drift); le bolle `m643` sono decorazione 2D e non dichiarano fisica |

## Cosa M6.5 dovrà decidere riguardo a M6.4.3

1. **Adottare o no i candidati**: dopo una review visiva indipendente. Se sì, aggiornare i built-in con la strategia di `compatibility.md` §3 (ID e nome tecnico invariati, snapshot M6.4.2 conservato, bozze pristine ricollegate).
2. **Se rendere `m643` il rendering di default** e rimuovere l'opzione, oppure mantenerla come interruttore sperimentale. Finché non c'è approvazione, il default è il rendering M6.4.2 (0 pixel di differenza dal baseline).
3. **Bolle**: la visibilità a dimensione UI si risolve con i parametri (opacità/raggio) più che col disegno; un designer deve fissare i valori e dichiarare se 80×32 debba mostrarle.
4. **Rimbalzo di Soft**: sub-pixel con i valori testati (0,29 px); accettare l'«assestamento» o avvicinarsi a Candy.
5. **Deformazione delle bolle**: proposta (≤ 0,9 px) non implementata (`motion-coupling.md`).
6. Tutto ciò che la tabella indica ancora aperto (WebKit, telefoni, bundle di produzione, schema).
