# M6.4.2 — Persistenza e integrità dei dati

Esito: **nessuna perdita di dati, nessuna corruzione, nessuna regressione delle protezioni di M6.H / M6.4.1** nei casi coperti. Un difetto di *flusso di risoluzione* trovato e corretto (M642-00). Nessun formato persistito, schema o numero di versione è stato modificato; nessuna migrazione è stata necessaria.

## 1. Archivio stabile (`jello-lab`)

| Funzione (§11.1) | Prova (tutte nei 776 unit / 791+ e2e) |
|---|---|
| salvataggio progetto, ultimo progetto riaperto | `storage.test.ts:16` «saves, lists and reopens materials and the last project» |
| scrittura multi-store atomica («tutto o niente») | `storage.test.ts:31` |
| bozza di un built-in modificato conservata e validata alla lettura | `storage.test.ts:46` |
| migrazione v1 → v2 senza perdere record | `storage.test.ts:54` |
| fallback in memoria **dichiarato non persistente** | `storage.test.ts:92`; `autosave.test.ts:137`; UI «Non persistente: solo questa scheda» |
| errori mappati in categorie leggibili (quota, ecc.) | `storage.test.ts:101`; `autosave.test.ts:127` «never claims a save when storage fails (quota)» |
| **«Salvato» solo dopo la risoluzione della scrittura** (§10.4) | `autosave.test.ts:114` «debounces writes and reports "saved" only after the write resolved» |
| flush sovrapposti serializzati; operazione esclusiva non si sovrappone | `autosave.test.ts:144, 157, 177` |
| un autosave fallito tiene la modifica in sospeso; il successivo la scrive e un reload la trova | `hardening.spec:296` |
| cambio progetto subito dopo una modifica non perde la modifica | `hardening.spec:339` |
| un'altra scheda che salva il progetto aperto è segnalata, non sovrascritta in silenzio | `hardening.spec:359` |
| progetti indipendenti (duplicato A→B: modificare A cambia solo A) | `hardening.spec:138`; `project-integrity.test.ts` (12) |
| componente collegato al materiale di un altro progetto da una versione precedente: scollegato all'avvio, con avviso | `hardening.spec:203` |
| import/duplica/rinomina/elimina/preferiti, reload | `projects.spec`, `studio-completion.spec:85` |
| import e ZIP ostili (limiti di dimensione/voci, percorsi, SVG ostile) | `zip-hardening.test.ts` (11), `svg-security.test.ts` (32), `hardening.spec:93,117` |
| CSP dichiarata e l'app parte | `hardening.spec:285` |
| export → import: identità dei documenti, copie rinominate mai sovrascritte | `projects.spec` «exporting the project and importing it back…» (aggiornato a 3 materiali per M642-03) |
| revisione `material.revision` non cambia per sola rinomina | `catalog.test.ts` (nomi storici, vedi `catalog-validation.md` §2 · 9) |

## 2. Archivio sperimentale (`jello-lab-experimental`)

Store reali verificati dal codice: `jelly-materials`, `jelly-drafts`, `jelly-links`, `jelly-quarantine` (`repository.ts`). `jelly-integrity.test.ts` (70 test, ogni scenario sia su repository in memoria sia su IndexedDB):

| Scenario | Descrizione nel test |
|---|---|
| upgrade database v1 → v2 | `describe('database upgrade v1 → v2')` |
| inventario, quarantena, ripristino | `describe('inventory, quarantine, restore')` |
| **riconciliazione: classifica, non indovinare** (`valid`/`orphan`/`unverifiable`/`corrupt`/`newer`) | `describe('reconciliation…')`; un record è «orfano» **solo** se la lettura del database stabile è completa e persistente |
| lettura fresca del database stabile; una lettura parziale non conclude nulla | `readLiveSnapshot` |
| scan **di sola lettura**; quarantena solo per azione esplicita, con esportazione | `describe('scan and quarantine')`; e2e `material-library.spec:137` «integrity check is read-only, offers a backup, and quarantine is reversible» |
| nessuna cancellazione non condizionata | `describe('the repository exposes no unconditional purge')` |
| A: cambio progetto durante il caricamento · B: salvataggio in corso mentre cambia il progetto · C: scrittura fallita (quota) | `workbench · Scenario A/B/C` |
| D: **due schede sullo stesso progetto** (revisioni, compare-and-swap) | `workbench · Scenario D` (memory + IndexedDB) |
| bozza non leggibile; distruzione e cleanup | `workbench · unreadable stored draft / destroy and cleanup` |
| snapshot del Builder | `describe('Builder snapshots')` |

**Concorrenza a due schede** (§11.3): passaggi richiesti (A apre, A modifica e salva, B modifica e salva → conflitto, modifiche locali conservate, esportazione della versione locale, risoluzione esplicita) → e2e `material-library.spec:89` «the second, stale save is refused with an explicit choice; nothing is overwritten» e il suo analogo per il Builder (`BuilderTrial`: «Un’altra scheda ha cambiato la prova di questo componente…», «Usa quella dell’altra scheda» / «Sovrascrivi con la mia», entrambe esplicite). **Nessun merge automatico** dei documenti.

**M642-00 (corretto).** Con due schede, un conflitto sulla *bozza* sostituiva quello sulla *copia salvata*: all'utente spariva la via d'uscita «salva come copia». Il difetto è dimostrato su `origin/main` (2 test unitari rossi) e corretto da un fix già scritto nei commit locali non pushati di `m641`. Nessuna perdita di dati: la scrittura rifiutata restava rifiutata; era un difetto di risoluzione.

**Eliminare un componente legato a una prova Jello** (§11.4): la riga resta nel database sperimentale e viene classificata `orphan` (con documento leggibile = recuperabile, esportabile, spostabile in quarantena su azione esplicita), **mai** cancellata automaticamente (`reconcile.ts` + `jelly-integrity.test.ts`). Non c'è un test e2e che elimini un componente reale e guardi il pannello; la classificazione è provata a livello di unità con uno snapshot dello stabile.

## 3. Guasti dei database e dei chunk (§11.4, §14.5)

| Guasto | Esito | Prova |
|---|---|---|
| quota insufficiente (stabile) | «Non salvato: spazio esaurito», nessun falso «Salvato» | `autosave.test.ts:127`, `storage.test.ts:101` |
| database stabile non disponibile | fallback in memoria dichiarato | `storage.test.ts:92` |
| scrittura fallita (sperimentale) | stato di errore del workbench, nessuna perdita della bozza in memoria | Scenario C |
| **IndexedDB sperimentale non apribile / evento `error` / `QuotaExceededError` in scrittura** | Jello Lab si apre comunque con la preview reale, **0 `pageerror`** (3 modalità forzate con `addInitScript`) | **sonda manuale** (`tools/`-style, non test permanente): misurato, non automatizzato |
| dati non leggibili / documento di versione più recente | riportati e lasciati intatti, non sovrascritti | `jelly-studio.spec:303` «a corrupt or newer stored record is reported and left alone» |
| **chunk sperimentale non caricabile** | prima: Studio vuoto (**M642-18**); ora: il guasto resta nell'area sperimentale, retry funzionante, documento del componente byte-identico | `m642-resilience.spec` (3 test × Chromium/Firefox) |
| **chunk WebGL2 non caricabile** (runtime pubblico) | prima: ogni `createSceneView` successiva falliva fino al reload (**M642-19**); ora la chiamata successiva ritenta | `scene-loader.test.ts` |
| «runtime sperimentale mancante» nell'export | nessun download e messaggio chiaro | `jelly-studio.spec:451` «offers no export without a runtime to ship» |

## 4. Quarantena (§11.5)

Scan in sola lettura; i record recuperabili si esportano (bundle di recupero) e si spostano in quarantena **solo** su azione esplicita; il ripristino dalla quarantena è reversibile (`material-library.spec:137`, `jelly-integrity.test.ts` «inventory, quarantine, restore»); nessuna cancellazione automatica (`no unconditional purge`); revisioni e controllo transazionale preservati.

## 5. Compatibilità dichiarata (§1.2) — cosa è stato verificato

| Elemento | Verifica |
|---|---|
| `jello-material` v2, `jello-component-definition` v1, `.jello` | nessuno schema o versione toccati (`git diff origin/main -- src/model src/components src/project src/migration` → solo `src/model/families.ts`: valore di un campo informativo, non persistito) |
| ID tecnici dei preset, collegamenti materiale/componente, revisioni | invariati; `catalog.test.ts`, `builder.spec:269,325` |
| dati IndexedDB dello Studio stabile, database separato `jello-lab-experimental` | invariati: nessun upgrade di versione; `storage.test.ts:54`, `jelly-integrity.test.ts` v1→v2 |
| copie personali, preferiti, bozze | invariate. **I progetti esistenti non perdono né guadagnano materiali** per la modifica del kit (M642-03): solo i *nuovi* progetti non ricevono più «Refraction Test» |
| package React e Vanilla, API pubbliche del runtime | `react-consumer.spec`, `vanilla-consumer.spec`, `desktop-consumer.spec`; unica modifica al runtime pubblico: `createSceneView` ritenta dopo un caricamento fallito (nessuna firma cambiata) |

## 6. Non verificato

Il comportamento con un database stabile di versione *più recente* della corrente al caricamento dello Studio (esiste solo il caso «documento più recente» per il Jello lab); nessun test di *browser crash* durante una transazione (la transazionalità è quella di IndexedDB); nessun test su storage reale quasi pieno (quota emulata).
