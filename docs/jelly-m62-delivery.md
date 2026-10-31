# Consegna M6.2 — renderer ottico Jelly privato

31 ottobre 2026, Europe/Rome. Checkout iniziale pulito, HEAD
`2011492eba10e2ad7c335367c107124174dc57a4`. Nessun AGENTS.md applicabile.
Nessun commit, push, merge o pubblicazione eseguito.

**Completamento tecnico: M6.2 implementata e verificata.**
**Valutazione visiva: accettabile come primo renderer Jelly stilizzato nella
fixture descritta sotto, dopo ispezione delle catture reali su entrambi i browser.**
Non è una simulazione volumetrica o una certificazione universale dei preset.
M6 nel suo insieme resta incompleta: nessun solver M6.3 o integrazione M6.4.

## Aprire e riprodurre

Dal repository, con le dipendenze locali già installate:

```sh
npm run dev -- --host 127.0.0.1 --port 4178
```

Aprire **http://127.0.0.1:4178/tests/fixtures/jelly/**.
Il server di sviluppo è lasciato disponibile a questo indirizzo al termine
della sessione. La fixture non è un input di build e non viene copiata in dist.
`npm run preview` serve soltanto gli artifact produttivi, senza questa pagina.

In un secondo terminale:

```sh
./node_modules/.bin/playwright test -c playwright.jelly.config.ts
node scripts/jelly-screenshots.mjs
```

Playwright avvia/riusa il server Vite sulla stessa porta. La configurazione
ordinaria ignora il solo `jelly.spec.ts`: la fixture richiede Vite dev, mentre
gli altri E2E continuano a usare la build produttiva. Non sono stati introdotti
skip nei test Jelly. Lo script screenshot richiede il server già attivo.

La pagina offre preview principale, quattro preset, quattro sfondi (chiaro
`#fafafa`, scuro `#101828`, lilla/ciano, scacchi da 8 px), tre geometrie, backend
auto/SVG/CSS, opaco, qualità high/medium/low/static/auto, bolle/seed, stati statici,
posa diagnostica e controlli ricavati da `JELLY_PARAMS`. Il pannello opzionale
mostra confronti fra estremi ottici. Non espone slider del solver.

## Moduli e contratti

| File | Responsabilità |
| --- | --- |
| [jelly.ts M6.1](../src/model/experimental/jelly.ts) | Unica fonte dei 33 descrittori, schema, validazione, serializer e resolver degli stati; invariato |
| [jelly-visual.ts](../src/model/experimental/jelly-visual.ts) | PRNG, candidati, conteggio/cap, proiezione, silhouette e profilo ottico puri, senza DOM |
| [renderer DOM](../src/runtime/experimental/jelly.ts) | `attachExperimentalJelly`, `update`, `resize`, stati, status e `destroy`; conforme a `MaterialSurface`, senza gruppo fittizio |
| [CSS](../src/runtime/experimental/jelly.css) | Namespace Jelly, fallback statico, opaco e forced colors |
| [fixture](../tests/fixtures/jelly/main.ts) | Un solo componente logico: Button nativo con icona, contenuto e semantica posseduti dall'host; riusato nella matrice |
| [candidati](../src/model/experimental/jelly-presets.ts) / [JSON](examples/jelly/) | Stati statici e valori ottici calibrati; esempi rigenerati con lo script esistente |
| [unitari](../tests/unit/jelly-visual.test.ts), [browser](../tests/e2e/jelly.spec.ts), [boundary](../tests/unit/boundaries.test.ts) | Determinismo, matematica, lifecycle, semantica, fallback e isolamento produttivo |
| [catture](../scripts/jelly-screenshots.mjs), [config](../playwright.jelly.config.ts) | Prove riproducibili su Chromium e Firefox, immagini reali e misure locali |

L'host deve offrire uno sfondo trasparente e possedere dimensioni, padding,
contenuto e focus. La decorazione è assoluta, dietro il contenuto, `aria-hidden`
e senza hit testing; testo/icona non passano attraverso filtri. Nessun listener
semantico o click viene aggiunto dal renderer. La fixture gestisce gli input e
usa il resolver del materiale per i feedback statici.

Il raggio passato nelle opzioni vince sul materiale, compresa capsule, e viene
clampato a metà lato corto. La silhouette cubica e i centri delle bolle condividono
la mappa della posa diagnostica, limitata a .05 e non persistita. I raggi delle
bolle restano invariati: nessuna conservazione del volume dichiarata.

## Ottica implementata e limiti del mapping

La [RFC aggiornata](jelly-material-rfc.md#m62-implementata--ottica-privata-e-verifica-reale)
riporta formule e differenze rispetto alla proposta M6.1.

| Parametri | SVG reale | CSS reale / limiti |
| --- | --- | --- |
| tint, foreground | Colore del corpo, bordo derivato e contenuto indipendente | Tinta/gradienti e colore del contenuto |
| bodyOpacity | Alpha dell'intero gruppo ottico, inclusi riflessi/bolle; ombra attenuata coerentemente | Alpha delle decorazioni, contenuto invariato |
| transmission | Quota di sfondo prima dell'attenuazione, realizzata tramite alpha del corpo | Stessa base alpha approssimata in gradienti |
| thickness, absorption | `exp(-absorption×thickness×L)`, percorsi centro 1/bordo 2; thickness cambia fascia/luce interna, absorption attenua anche le bolle | Alpha più gradiente, fascia interna; nessuna bolla |
| scattering | Alpha del corpo, velatura post-bolle e contrasto delle inclusioni | Alpha del corpo; volume più semplice |
| edgeFalloff | Posizione del pooling e ampiezza del bordo sfumato | Posizione della transizione di gradiente; effetto più debole |
| highlightStrength, roughness | Intensità, ampiezza e attenuazione dei riflessi morbidi | Intensità/ampiezza del riflesso radiale |
| elevation, shadowColor, shadowOpacity | Singola ombra morbida con bounds espliciti | `elevationShadow` Solid, key + ambient; non pixel-identica a SVG |
| bubbles.* | Distribuzione/profondità, raggio prospettico, bordo/riflesso e clip nel corpo | Assenti, motivazione nello status |
| quality.profile | Cap high 24, medium 12, low 4; static/auto ottica medium | Nessun incremento reale di dettaglio fra profili |
| target.* | Routing e override di fallback, senza verifica fittizia della qualità via API | `fallback:opaque` è anche una scelta esplicita che forza il corpo opaco |
| geometry.* | Default rounded/capsule, raggio host prioritario | Stesso raggio risolto, nessuna posa |
| behavior.hover/press, states.* | Abilitano gli override statici M6.1, senza movimento | Feedback statici; opaco conserva la coppia fissa di colori |
| responseMs, dampingRatio, maxDeformation, pressStrength, releaseImpulse | Dati candidati; **non supportati** in M6.2, elencati nella diagnostica | Non supportati |

Il nucleo della formula RFC è applicato, ma luce interna, pooling, velatura e
riflessi aggiungono compositing locale: non si rivendica l'equazione come
descrizione esatta di tutti i pixel. Lo sfondo non viene campionato o rifratto.
Non esiste un campo di spessore fisico né uno scattering calibrato.

Su un singolo pixel uniforme del corpo, bodyOpacity e transmission possono
produrre lo stesso alpha. Restano distinguibili sulla superficie completa:
bodyOpacity attenua anche riflessi/bolle/ombra, transmission agisce sulla base e
sull'indizio inferiore. Absorption con thickness zero e roughness con highlight
zero non hanno effetto utile, come previsto dalle rispettive dipendenze.
Il confronto roughness usa highlight .85; edgeFalloff usa thickness .8 per rendere
valutabile la fascia. Sono visibili differenze nella contact sheet ottica,
pur restando più sottili rispetto a tint/scattering/thickness.

## Distribuzione e lifecycle

Mulberry32 ha vettori uint32 fissi per seed 0, 1 e 4294967295. Ogni candidato
ha indice stabile e quattro draw normalizzati; proiezione e range del materiale
producono raggio e profondità. Nessun `Math.random` o `Date.now` implicito.
Conteggio richiesto `floor(density×widthCSS×heightCSS/10000)`, seguito dal cap.
Il pool massimo di 24 è indipendente dal profilo e dal contatore degli ID SVG.
Ridurre qualità/dimensioni conserva il prefisso e non riesegue il PRNG.

Il resize riproietta gli stessi candidati: niente rejection sampling. Raggio e
clip possono nascondere bolle agli angoli, tagliarne una frazione o renderle
nuovamente visibili. La profondità riduce raggio e contrasto; una fascia centrale
attenua le inclusioni senza misurare né catturare il testo. Restano sotto velatura,
pooling e riflessi. Bolle disabled/density zero/backend CSS liberano pool e nodi;
dimensioni temporaneamente nulle conservano il pool e sospendono le inclusioni.

Gli aggiornamenti validano e copiano documento/opzioni prima del commit; un
documento invalido non applica nemmeno le nuove opzioni. Gradienti, clip, SVG e
nodi delle bolle esistenti vengono riusati. ResizeObserver ignora misure uguali;
nessun RAF, timer o loop nel renderer. Destroy ripetibile scollega observer,
media query e listener di status, svuota il sottoalbero posseduto e ripristina
solo la propria classe/variabile CSS, preservando modifiche successive dell'host.
La fixture distrugge i propri renderer anche all'hot reload.

Opaco forza alpha del gruppo 1 e transmission 0 con `#b8a2e8`/`#211735`;
il documento originale non cambia. Reduced transparency è rilevata via media
query quando supportata e ha override manuale/test. Reduced motion è riportata
live, senza animazione in nessun profilo. Forced colors usa colori di sistema,
bordo, stato active, disabled e focus distinguibili senza ottica decorativa.

## Evidenza visiva ispezionata

Catture reali, PNG non generati, viewport desktop 1400×1100, DPR 1, browser
headless Linux: Chromium **156.0.8078.4**, Firefox **157.0**. Le dieci contact
sheet finali sono state aperte e ispezionate dopo l'ultima modifica visiva:

| Matrice | Chromium | Firefox |
| --- | --- | --- |
| 4 preset × 4 sfondi, 240×64; istanze simultanee | [preset](screenshots/jelly-m62/chromium-preset.png) | [preset](screenshots/jelly-m62/firefox-preset.png) |
| Soft tre geometrie, bolle on/off, SVG/CSS/opaco, posa | [varianti](screenshots/jelly-m62/chromium-variant.png) | [varianti](screenshots/jelly-m62/firefox-variant.png) |
| default/hover/pressed/active/disabled, focus, icona | [stati](screenshots/jelly-m62/chromium-state.png) | [stati](screenshots/jelly-m62/firefox-state.png) |
| 13 proprietà ottiche/colore/ombra, coppie di estremi | [ottica](screenshots/jelly-m62/chromium-optical.png) | [ottica](screenshots/jelly-m62/firefox-optical.png) |
| Colori di sistema e focus | [forced colors](screenshots/jelly-m62/chromium-forced.png) | [forced colors](screenshots/jelly-m62/firefox-forced.png) |

Giudizio: il bordo inferiore denso ma sfumato, il nucleo più luminoso e i
riflessi asimmetrici suggeriscono un corpo morbido da fermo. Le inclusioni hanno
contrasto/profondità variabili e vengono integrate dalla velatura, con una
differenza visibile rispetto a bolle off. Non c'è un contorno neon uniforme;
testo e icona rimangono nitidi. Capsule e 96×48 conservano volume e leggibilità.
Il fallback resta un pulsante leggibile e coerente, con volume più semplice.

Difetti residui: Dense può ricordare resina opaca; Clear sullo scuro appare più
grigio; le bolle più piccole/periferiche sono deboli o parzialmente tagliate.
Con thickness alto la fascia inferiore può apparire pesante. La posa diagnostica
non deforma un campo ottico tridimensionale: i riflessi restano indizi locali,
non una risposta fisica. La resa non promette il realismo di una gelatina fotografata.
CSS perde inclusioni e parte della curvatura; opaco privilegia la leggibilità.

Il primo passaggio visivo ha portato a sfumare il bordo, attenuare meno le bolle,
correggere la posizione assoluta SVG e aumentare il contrasto dei candidati.
I preset/esempi contengono gli stessi valori usati dalla fixture, senza stile
ottico speciale duplicato. `visuallyVerified` resta **false**: queste evidenze
circoscritte non promuovono i candidati a preset pubblici universalmente verificati.

[Ambiente e misure](screenshots/jelly-m62/capture-environment.json): lo script
nasconde temporaneamente il contenuto per catturare lo sfondo reale sotto la sua
area, poi confronta la luminanza sRGB col foreground calcolato. Sono misure locali
di fixture, non lettura dello sfondo nel renderer e non audit WCAG completo.
Minimi fra i quattro sfondi, stato default:

| Preset | Chromium | Firefox |
| --- | --- | --- |
| Soft | 4.69:1 | 4.71:1 |
| Clear | 5.16:1 | 5.17:1 |
| Candy | 4.74:1 | 4.74:1 |
| Dense | 7.36:1 | 7.38:1 |

Coppia opaca: **7.57:1** su entrambi. Estremi diagnostici come foreground bianco
non sono preset approvati. Nessuna garanzia di contrasto su sfondi arbitrari.

## Verifiche eseguite

Node v22.23.1, dipendenze locali senza nuove installazioni.
Riepilogo conservato: [jelly-m62-verification.json](jelly-m62-verification.json).

| Comando / verifica | Esito finale |
| --- | --- |
| `npm run typecheck` | Superato, inclusi renderer, fixture e test; ripetuto dalla build |
| `./node_modules/.bin/tsc -p tests/tsconfig.jelly-model.json` | Superato per modello, candidati e calcoli con ES2022, senza DOM/Node |
| `npm test -- tests/unit/jelly-model.test.ts tests/unit/jelly-visual.test.ts tests/unit/boundaries.test.ts` | 114/114, tre file |
| `npm test` | **513/513**, 27 file, zero skip/errori |
| `npm run build` | Superato: runtime, tipi, Studio/preview; 144 moduli lib e 236 Studio |
| `node scripts/jelly-examples.mjs --check` | Quattro esempi identici al serializer |
| `./node_modules/.bin/playwright test -c playwright.jelly.config.ts` | **16/16**, 8 casi × 2 browser, zero skip/flaky, tracing attivo |
| `node scripts/jelly-screenshots.mjs` | Dieci contact sheet; zero errori console/page nei due browser |
| `sha256sum -c /tmp/jello-m62-baseline.sha256` | Tutti e tre gli artifact confrontati identici |
| `git diff --check` | Superato |

I browser verificano contenuto/hitbox/focus/click, override statici, ID senza
collisioni con distribuzione identica a seed uguale, resize/hidden/reopen, host
radius e capsule 24×24/480×24, cap/prefisso, aggiornamenti atomici e riuso dei
nodi, bolle off/density zero, 100 mount/destroy, proprietà aggiunte dall'host,
preferenze, fallback forzato, assenza di errori/loop ResizeObserver e **zero RAF**.
I test di mount/destroy non sono una misura di heap/GC.

Il primo tentativo della suite nel sandbox ha incontrato `listen EPERM` nei
test relay; l'esecuzione finale autorizzata con localhost supera tutta la suite.
Anche avvio Vite/browser richiedeva uscire dal sandbox. Durante l'iterazione
Firefox con tracing si bloccava con il confronto ottico nascosto già montato:
il montaggio lazy del confronto elimina il problema; test finali con tracing
superati senza allentare timeout o assert. Nessun blocco tecnico residuo.
Resta l'avviso preesistente sul chunk Studio oltre 500 kB.

Hash riprodotti prima/dopo, oltre al controllo separato del grafo:

```text
9411d44c113d9b9bd2d4e18cf10f750c4bfed5946ab54aca40790e944a01bfd3  dist-lib/jello.js
5fb34366844700a325d8d6d0bd1a4432d10265cdb10519db10a50cabb758fa1a  dist-lib/jello.css
edc5bf59419f1016f4592aedf4bf7f3d88c422ad768186fca442071d7d1acfa2  dist/assets/lab-Bv_Q91HJ.js
```

I boundary includono entry core/model/runtime/Studio/preview/export, il grafo
puro e quello della fixture. Non si allenta il grafo produttivo per far passare
la fixture: solo l'entry test può raggiungere il renderer sperimentale.
Jelly resta `planned`, `editor:false`, fuori da registry/parser/export pubblici.
Nessun cambiamento di persistenza, formato o dipendenza.

Non eseguiti: intera suite E2E produttiva/`verify`, `test:perf`, WebKit/Safari,
Android/WebView, dispositivi o GPU fisiche, viewport mobile, consumer Jelly
estratti, benchmark DPR/heap/frame. I cap di bolle sono applicati; budget di
gruppo, raster equivalente, DPR cap e adattamento hardware restano proposte.
Non si dichiara di controllare il DPR del browser per un SVG inline.

Prossima attività **M6.3**: solver puro analitico, input/cancel/visibility e
scheduler soltanto durante il moto, riusando silhouette e proiezione del renderer.
La presente consegna termina prima di tale implementazione. WebGL2 non è
necessario per il gate stilizzato qui accettato; un eventuale esperimento futuro
avrebbe senso solo con un requisito esplicito di rifrazione/normal field e un
confronto misurato con questa baseline, senza introdurlo in M6.2.
