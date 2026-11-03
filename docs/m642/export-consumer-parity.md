# M6.4.2 — Export e parità Studio ↔ consumer

Distinzione usata in tutto il documento: **MISURATO** = eseguito in questa milestone, con l'esito in `verification.json`; **COPERTO** = test esistente passato nella baseline e nella verifica finale, citato per titolo; **DEDOTTO** = ragionamento dal codice, non una misura.

Nessun adapter di export contiene riferimenti a Jello (`grep jelly src/export` → nessun risultato): il pacchetto Jello è prodotto solo da `src/lab/experimental/jelly/package.ts`, con runtime dedicato `dist-jelly`. **Jello non è integrato negli adapter produttivi** (richiesto dal mandato §12.7).

## 1. Destinazioni (§12.1)

| Destinazione | Come è prodotta | Verifica |
|---|---|---|
| React + TypeScript (Button, Mobile Navbar, Desktop Navbar, Glass e Solid) | `src/export/react*.ts` | COPERTO `export.test.ts:133-278`, `react-consumer.spec` (9), `desktop-consumer.spec`; il consumer è un progetto Vite **indipendente** (`examples/react-consumer`) con il proprio `tsc` e `build` (`scripts/prepare-consumer.mjs`), eseguito dalla pipeline |
| Vanilla HTML/CSS/JS | `src/export/vanilla.ts` | COPERTO `vanilla-export.test.ts` (6), `vanilla-consumer.spec` (4 test; per ogni tipo×famiglia) |
| Materiale autonomo Glass / Solid | `src/export/package.ts` | COPERTO `export.test.ts:37-122`, `export.spec:48-119` |
| JSON canonico | `session.componentJson()` / `exportJson()` | COPERTO `export.test.ts:196` «JSON configuration exports are the documents the lab saves» |
| Progetto `.jello` | `project/package.ts` | COPERTO `projects.spec` «exporting the project and importing it back…», `project.test.ts` |
| Pacchetto sperimentale Jello (separato) | `jelly/package.ts` | **MISURATO** (§5), COPERTO `jelly-package.test.ts` (7), `jelly-studio.spec:402` |

Android nativo: **non dichiarato** (il manifest Jello lo elenca in `unsupported`; i pacchetti stabili non lo promettono). L'app `apps/android-preview` è una preview WebView, fuori scopo.

## 2. Manifest (§12.2)

Ispezione reale dei manifest prodotti (`examples/react-consumer/vendor/*/jello-manifest.json`, `examples/jelly-consumer/*/manifest.json`):

| Campo richiesto | React/Vanilla (`jello-package` v1) | Jello (`jello-jelly-experimental-package` v1) |
|---|---|---|
| versione | `format`, `version`, `generatedBy` («Jello Material Lab 0.3.0») | `format`, `version`, `generatedBy`, `experimental: true` |
| materiale | `material {id, name, family, schemaVersion, file, preset}` | `material {id, name, family, schemaVersion, familyVersion, file}` |
| componente | `component {id, name, type, typeVersion, schemaVersion, file, unsupported[]}` | — (solo Button di esempio) |
| file inclusi + integrità | `files[] {path, bytes, sha256}` | `files[] {path, bytes, sha256}` |
| dipendenze | `dependencies {peer: react/react-dom, bundled: runtime/}` (React); `no peers` (Vanilla, `vanilla-export.test.ts:17`) | runtime e CSS inclusi |
| backend | `backend {requested, fallback, candidates[{backend, label, requires[]}]}` (Solid: `none`) | `backends {requested, fallback, supported[], unsupported[], note}` |
| limitazioni | `component.unsupported[] {path, reason}` per famiglia + README | `limits[]` (6 voci) + `accessibility[]` |
| istruzioni d'uso | `README.md`, `example/` | `README.md`, `example/` |

Osservazione (P2, non modificata): il manifest dei pacchetti stabili non ha un elenco `limits` di alto livello come quello Jello (es. «non per Android nativo»): lo dicono README e `unsupported`. Il **README** non è nell'elenco hash del manifest né il manifest in sé: per costruzione (README generato dal manifest).

## 3. React (§12.3)

COPERTO dal consumer indipendente: mount, update (modalità controllata, props), callback con id stabili, stato attivo, tastiera (frecce, Invio, focus visibile), responsive, nessuna dipendenza dal laboratorio (`react-consumer.spec:79` «ships the same runtime the lab previews with», `:148`), unmount e **StrictMode** (`examples/react-consumer/src/main.tsx` monta l'intera app sotto `<StrictMode>`, quindi ogni test `react-consumer.spec` esercita il doppio mount/cleanup di sviluppo; la pulizia del runtime è provata a parte da `example.spec:64` «destroy leaves no filter, layer or listener behind»). TypeScript: il progetto consumer esegue `tsc` sul wrapper tipizzato.

## 4. Vanilla (§12.4)

COPERTO: caricamento indipendente, **nessun React** («ship byte-identical runtime files and no React dependencies», `vanilla-consumer.spec:83`), mount/update/destroy, eventi, stati, responsive, percorsi delle risorse, servito via HTTP (`scripts/serve-static.mjs`, porta 4177), reduced motion e trasparenza (`:111`), Solid libera i suoi layer in `destroy` (`:95`).

## 5. Pacchetto Jello — **MISURATO** in M6.4.2

`scripts/m642-verify-jelly-package.mjs` → `package-verification.json`, su `npm run jelly-consumer:prepare` (4 pacchetti: soft, clear, candy, dense):

| Controllo | Esito |
|---|---|
| per ogni file del manifest: esiste, `bytes` e `sha256` coincidono | 4/4 pacchetti |
| nessun file non elencato oltre `manifest.json` e `README.md` (esclusi per costruzione, vedi §2) | 4/4 |
| servito via HTTP da un server statico minimale, in **Chromium e Firefox**, con movimento normale e ridotto (**16 esecuzioni**) | tutte montate (`.jelly-decoration` presente), backend effettivo `svg` |
| RAF a riposo in 1,5 s · RAF 1,2 s dopo il rimbalzo | **0 · 0** in tutte le 16 |
| tastiera Spazio + Invio sul Button nativo | 2 click nativi in tutte le 16 |
| pressione con puntatore registrata; `disabled` non preme | tutte |
| `destroy()` → nessun `.jelly-decoration`, classe `jelly-surface` rimossa, **0 RAF** anche premendo dopo | tutte |
| errori console / richieste fallite | **0** |
| movimento ridotto → «moto static» | verificato |

Cosa **non** è stato fatto: nessun confronto raster del consumer Jello con lo Stage (il test `jelly-studio.spec:402` esporta, serve in una pagina indipendente e verifica che il Button monti con il runtime reale; non misura pixel); nessuna verifica di integrazione in un bundler esterno (il pacchetto è ES module servito via HTTP, come dichiarato: «non funziona da file://»).

## 6. Parità visiva Stage ↔ consumer (§12.5)

| Scenario | Metodo | Soglia / criterio | Stato |
|---|---|---|---|
| Esempio DOM del pacchetto materiale vs preview (stesso backend, sorgente, dimensione, DPR) | raster, differenza media per pixel | **< 0,5 / 255** (`export.spec:64`); la scena è deterministica (`animate=0`), il tempo non entra | COPERTO |
| Esempio WebGL2 vs preview a t = 0 | raster | stesso criterio (`export.spec:89`) | COPERTO (saltato dove il browser headless non ha WebGL2: qui eseguito) |
| Bottoni e barre esportati vs Stage (`component-export.spec`, **10 casi** per motore: 7 Button — Glass primary, secondary disabled, ghost; Solid primary, primary disabled, ghost, link grande/quadrato/icona dopo/larghezza fissa — e 3 barre — Glass, Solid, Solid con breakpoint + tab disabilitata) | **firma strutturale** (DOM, attributi, stile calcolato) di Stage e componente esportato, confrontata campo per campo | **uguaglianza** (`differences()` vuota); si attende una condizione, mai un tempo | COPERTO |
| Desktop Navbar React e Vanilla vs Stage | firma + azioni + tastiera + responsive + aggiornamento config + cleanup | uguaglianza | COPERTO (`desktop-consumer.spec`) |
| Stage vs **matrice di screenshot M6.4.2** | raster, `m642-compare` contro `origin/main` | soglia 12/255 per canale (misurata sul rumore di anti-aliasing, non scelta per far passare) | Glass `text/photo/uniform` e componenti Glass: **identici** a `main`; le scene corrette (M642-20) cambiano come previsto |

La soglia 0,5/255 di media è stretta (≈ 0,2 %): non è stata allargata. **Non è un confronto Stage ↔ consumer per i dinamici**: per stati animati i test confrontano condizioni deterministiche (stato premuto/hover/disabilitato dichiarati), non fotogrammi a timestamp.

## 7. Round-trip (§12.6)

Studio → export `.jello` → import → documenti: COPERTO `projects.spec` («exporting the project and importing it back keeps both copies when asked…»; con le opzioni «Mantieni entrambi / Sostituisci / Salta» ciascuna con il suo conteggio). Il backup `.jello` è distinto dal pacchetto di integrazione (formato `jello-project`, non `jello-package`). Il documento originale resta invariato (le copie sono rinominate, mai sovrascritte). Studio → pacchetto → consumer → ricaricamento: i consumer leggono `component.json`/`material.json` e il test «the project ships the same runtime…» garantisce lo stesso renderer.

## 8. Limiti del lavoro

WebKit non eseguito (host); nessun bundler esterno oltre a Vite; nessun Android; nessun test di installazione da npm (i pacchetti sono directory).
