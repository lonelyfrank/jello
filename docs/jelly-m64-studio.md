# Jelly nello Studio (M6.4) — architettura, persistenza, export, limiti

> **Aggiornamento M6.4.1.** L'area si chiama ora «Jello β» (nome visualizzato della famiglia; id tecnico `jelly`). Il database sperimentale è alla versione 2 (revisioni + quarantena), `purgeOrphans` è stato rimosso e sostituito da verifica/quarantena esplicite, il salvataggio è protetto da compare-and-swap tra schede: vedi [jelly-m641-integrity.md](jelly-m641-integrity.md) e [material-catalog.md](material-catalog.md). Il testo che segue descrive M6.4.


Funzione **sperimentale**. Jelly resta `planned` in `FAMILIES`, versione pubblica 0, `editor:false`:
non è un materiale ufficiale, non è selezionabile dai componenti, non è nel runtime produttivo.

## Baseline

M6.H non è su `main`: la PR #2 (`m6h-hardening` → `main`) è aperta. M6.4 parte da `m6h-hardening`
(HEAD `3100bed`, albero pulito) nel branch `m64-jelly-studio`. Nessun merge, nessun push. Se la PR #2
verrà rebasata o modificata, M6.4 va rebasato sopra.

## Punto d'ingresso sperimentale (un'unica porta)

```text
Studio (src/lab/main.tsx)  ── nessun import statico di Jelly ──┐
  App.tsx            ── import() ──▶ experimental/jelly/JellyMain   (area «Jelly β»)
  BuilderJellyTrial  ── import() ──▶ experimental/jelly/BuilderTrial (prova nel Button)
```

Le uniche due porte sono `src/lab/app/App.tsx` e `src/lab/app/BuilderJellyTrial.tsx`, e solo con `import()`.
Il boundary test (`tests/unit/boundaries.test.ts`, «experimental Jelly Studio boundary») fissa:

- il grafo **statico** di `src/lab/main.tsx` non contiene alcun modulo `*/experimental/*` (avvio senza Jelly);
- i soli importatori di moduli sperimentali fuori dalle cartelle sperimentali sono le due porte, e usano `import()`;
- ogni modulo di `src/lab/experimental/jelly/` importa solo modelli, `runtime/experimental`, `export/zip`, React e
  quattro blocchi dello Studio (`session`, `store`, `studio-preferences`, `ParamField`/`PanelResize`/`StudioNav`/`ui`);
- `src/runtime/index.ts`, `src/export/*`, `src/model/index.ts` non raggiungono Jelly; repository stabile, autosave,
  `project/*`, `registry.ts` e `families.ts` non contengono riferimenti a `experimental`;
- `dist-lib` non contiene Jelly; nel Studio costruito il renderer sta in chunk separati, non nel chunk d'ingresso.

## Moduli (`src/lab/experimental/jelly/`)

| Modulo | Responsabilità |
| --- | --- |
| `bridge.ts` | Adattatore Studio ↔ renderer M6.3: valida, monta una volta, `update()` in-place, stato di preview, input solo in modalità live, diagnostica pull-only, teardown idempotente. Dipendenze iniettabili (testato in Node). Nessuna formula ottica o fisica. |
| `inspector-model.ts` | Puro: raggruppamento dei controlli, livello Base, modifica validata (documento intero attraverso `parseExperimentalJelly`), errori relazionali con etichette reali, reset, copie personali. |
| `workbench.ts` | Store fuori da React: documento di lavoro, base di ripristino, copie del progetto, salvataggio, bozza, import/export di un documento. |
| `repository.ts` | Archivio sperimentale separato (vedi sotto). |
| `preview-model.ts` | Stati, sfondi, dimensioni e ambienti simulati della preview; non entrano nel documento. |
| `package.ts`, `export-client.ts` | Pacchetto web sperimentale (puro) e suo recupero dal runtime servito. |
| `JellyMain/Preview/Inspector/Library/Diagnostics/Button/BuilderTrial.tsx`, `studio.ts`, `jelly-lab.css` | UI, singleton pigri, preferenze di vista. |

I controlli dell'Inspector sono generati da `JELLY_PARAMS` tramite lo stesso `ParamField` di Glass e Solid:
intervalli, passi, unità, default, descrizioni e validazione non sono riscritti. Un test verifica che ogni
descrittore compaia esattamente una volta. Il livello **Base** nasconde controlli; non cambia il documento.
Il ripristino per parametro (↺) torna al valore della base (preset o copia salvata); «Valori Jelly di base»
torna ai default dei descrittori.

## Ciclo di vita React

Il `JellyBridge` nasce con l'elemento host (`useLayoutEffect` con dipendenza il solo coordinatore) e muore con
esso. Cambi di parametro, backend, stato e dimensione sono `update()` / `setState()` sulla stessa superficie
(un test E2E verifica che il nodo DOM della decorazione sia lo stesso dopo le modifiche). Un documento non valido
è rifiutato per intero: resta l'ultimo rendering valido e l'host è comunque un `<button>` nativo. Area nascosta
(cambio workspace) → il renderer sospende da solo (host a dimensione zero / fuori viewport) e non lascia RAF.
Un solo `JellyCoordinator` per vista: un solo RAF, fermo a riposo. La diagnostica legge `bridge.motion` a 10 Hz
direttamente in un `<output>` (nessuno stato React per frame) solo mentre il pannello è montato e la scheda visibile.

## Persistenza

**Scelta: database IndexedDB separato `jello-lab-experimental` (v1).** Non si tocca `jello-lab` v4, né i formati
`jello-material`, `jello-component-definition`, `jello-project`, né l'autosave produttivo. Un record Jelly non può
finire in un `.jello` o negli export Glass/Solid perché nessuno di quei percorsi legge questo database.

| Store | Chiave | Contenuto |
| --- | --- | --- |
| `jelly-materials` | `id` (indice `projectId`) | copia personale: `{id, projectId, doc, basePreset, createdAt, updatedAt}` |
| `jelly-drafts` | `projectId` | documento di lavoro non salvato (ripristino dopo reload) |
| `jelly-links` | `projectId::componentId` | prova nel Builder: snapshot del documento Jelly |

`doc` è il `JellyExperimentalDocument` (`jello-material` v2, `family: "jelly"`, `familyVersion: 1`): solo parametri,
override di stato di aspetto e `meta`. Il parser non ha campi per posizione/velocità dell'oscillatore, `pressed`,
timestamp, scheduler, RAF o coordinate del contatto; un test lo verifica sul JSON serializzato.

Garanzie (tutte con test): ogni scrittura valida i documenti **prima** di aprire la transazione; un batch è **una
transazione** su tutti gli store toccati (o tutto o niente); la lettura rivalida, scarta e *segnala* i record
corrotti o di versione più recente **senza cancellarli**; l'id del record è autorevole; le query sono per progetto
(e rivalidate), quindi nessuna contaminazione; eliminare una copia elimina nella stessa transazione la bozza che
la puntava; se IndexedDB non c'è si usa la memoria e lo si dice («solo in questa scheda»).

**Limiti noti.** Nessuna transazione tra i due database: eliminare un progetto dal Studio non elimina i record
Jelly di quel progetto (restano orfani, invisibili, perché ogni lettura è filtrata per progetto). `purgeOrphans`
esiste ed è testato ma **non** è chiamato automaticamente: con due schede aperte una lista progetti obsoleta
potrebbe cancellare dati di un progetto appena creato. Due schede sullo stesso database: vince l'ultima
scrittura (come per il database stabile). I link del Builder non vengono rimossi quando si elimina il componente.

Il documento di una copia si esporta/importa come file `*.jelly.json` dall'Inspector (Avanzato → Documento).
L'importatore dei materiali ufficiali lo **rifiuta** (`family: "jelly"` non è supportata): è voluto. L'import
Jelly rivalida il file, non cambia nulla se è invalido e assegna sempre un id nuovo.

## Builder

Nell'Inspector del Button: sezione «Prova Jelly · sperimentale», spenta di default e non persistita come flag
(aprire un componente non carica Jelly). Quando attiva mostra, accanto, il Button con la sua etichetta, l'icona,
l'altezza (`BUTTON_SIZES`), il padding, la larghezza fissa o adattiva, il raggio (capsule o px), il peso e la
dimensione del testo, disabilitato incluso, resi dal renderer Jelly reale. Permette di scegliere un preset (o
una copia del progetto), modificare sette parametri essenziali e provare le interazioni.

- **Non** scrive nel documento del componente, in `material.family` né in `material.preset`; non tocca la canvas;
  non è inclusa nell'export del componente. Un test E2E confronta il JSON del componente prima/dopo.
- La configurazione è uno **snapshot** nel database sperimentale, chiave `(progetto, componente)`: sopravvive
  all'eliminazione della sorgente e non la «segue». Al cambio di componente o progetto si scrive il pendente per la
  vecchia coppia e si carica la nuova (con token anti-stale). Disattivare la prova distrugge il renderer: non c'è
  nulla da annullare perché nulla è cambiato.
- **Non fatto:** applicare Jelly alla canvas del Builder né esportarlo con il componente. Richiederebbe un riferimento
  nuovo in `material` (vietato senza piano di migrazione) ed è rimandato alla promozione.

## Export sperimentale

`Esporta pacchetto web` (solo nell'area Jelly; l'`ExportDialog` e gli adapter Glass/Solid non sono toccati).

Runtime: `npm run build:jelly` → `dist-jelly/` (`jello-jelly-experimental.js` + `.css` + `manifest.json` con SHA-256),
costruito da `src/runtime/experimental/index.ts`, che è solo un re-export dei moduli che la preview esegue
(`jelly.ts`, `jelly-input.ts`, `jelly-scheduler.ts`, modello). Non c'è un renderer alternativo. Separato da
`dist-lib`: l'hash della libreria produttiva non cambia (verificato prima/dopo). Il Studio serve `dist-jelly` come
`/runtime-jelly/` (dev: middleware; build: copia in `dist/runtime-jelly`), verifica gli hash scaricati contro il
manifest e **non genera nulla** se il runtime manca o non corrisponde.

Pacchetto `jello-jelly-<id>/`: `jelly.json` (validato), `runtime/*` (JS e CSS), `example/index.html` + `main.js`
(Button nativo + Jelly), `manifest.json` (formato `jello-jelly-experimental-package`, backend supportati e non,
limiti, SHA-256), `README.md`. Deterministico. `npm run jelly-consumer:prepare` lo spacchetta in
`examples/jelly-consumer/` per provarlo; l'E2E esporta dal Studio, spacchetta, serve da una pagina indipendente
e verifica rendering SVG, pressione, click nativo e teardown.

**Dichiarato come non supportato** (manifest e README): WebGL2 Jelly, Android nativo / WebView verificata,
rifrazione, drift, simulazione volumetrica, tipi TypeScript, `file://` (serve HTTP).

## Fallback e accessibilità

Il Button è sempre un `<button>` nativo: semantica, tastiera, focus e hitbox sono suoi; la decorazione è
`aria-hidden`, `pointer-events: none`, dietro il contenuto. Il renderer (M6.3) gestisce reduced motion,
reduced transparency e forced colors da solo; la preview aggiunge simulazioni (`SVG non disponibile`, `Forza opaco`,
`Trasparenza ridotta`, `Movimento ridotto` = profilo `static`, **sola anteprima**, non salvate). Il backend
effettivo, il motivo delle riduzioni, bolle, sospensione e fallback sono nella diagnostica avanzata.
