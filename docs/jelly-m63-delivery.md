# Consegna M6.3 — fisica e interazioni Jelly nella fixture privata

31 ottobre 2026, Europe/Rome. HEAD iniziale `a112627c909e4710285b44d47349dd4058d03855`,
checkout pulito. Nessun AGENTS.md negli antenati o nel repository.
Nessun commit, push, merge o pubblicazione. Nessuna nuova dipendenza.

**Completamento tecnico:** implementazione privata e verifiche completate.
**Valutazione visiva:** risposta accettabile per il Button Jelly stilizzato nei
casi acquisiti; compressione, ritorno e piccolo overshoot sono leggibili, con
contenuto fermo. Non è una validazione su dispositivi fisici o di grandi scene.
Il limite prestazionale misurato su Firefox con dodici superfici è riportato sotto.
Jelly resta `planned`, versione pubblica 0, `editor:false`; M6.4 non avviata.

## Riproduzione

```sh
npm run dev -- --host 127.0.0.1 --port 4178
# Aprire http://127.0.0.1:4178/tests/fixtures/jelly/
./node_modules/.bin/playwright test -c playwright.jelly.config.ts
node scripts/jelly-motion-evidence.mjs
node scripts/jelly-motion-perf.mjs
node scripts/jelly-static-regression.mjs
```

Gli script richiedono il server Vite già attivo. La fixture non è un input di
build e non è servita dalla preview produttiva. Il server sulla porta 4178 era
già disponibile ed è stato riusato; non sono stati terminati processi altrui.
Per browser e test relay serve consentire localhost nel sandbox dell'agente.

La fixture conserva il catalogo M6.2 e aggiunge controlli motion da `JELLY_PARAMS`,
quattro preset interattivi con confronto `static`, indicatore di contatto,
sequenza press/hold/release, pressioni ripetute, cancel e sospensione. Resize,
backend e preferenze usano gli stessi controlli del documento sperimentale.
La diagnostica legge x/v/target/contatto e contatori del coordinatore a 10 Hz,
aggiornando un solo output e il marker; non ridisegna il pannello per frame.
`jellyFixture.capture()` usa un clock iniettato e lo stesso renderer reale,
per osservazioni ai tempi dichiarati. I timer diagnostici sono solo della fixture
e vengono fermati nelle scene di misura/acquisizione e durante HMR.

## Moduli e contratto matematico

| Modulo | Responsabilità |
| --- | --- |
| [jelly-motion.ts](../src/model/experimental/jelly-motion.ts) | Solver puro: init/evolve/target/impulse/press/reset/configure/settled |
| [jelly-visual.ts](../src/model/experimental/jelly-visual.ts) | Mappa firmata, silhouette, proiezione e ottica pura |
| [jelly-scheduler.ts](../src/runtime/experimental/jelly-scheduler.ts) | Coordinatore con clock/RAF iniettabili, insieme attivo e ownership |
| [jelly-input.ts](../src/runtime/experimental/jelly-input.ts) | Adattatore DOM separato, feedback e cleanup, nessuna azione semantica |
| [jelly.ts runtime](../src/runtime/experimental/jelly.ts) | Documento atomico, aspetto/backend, misure, posa, preferenze, observer e teardown |

Nessun parametro persistito aggiunto o cambiato. Preset candidati, seed e quattro
JSON restano identici. x, v, target, contatto, pressed, timestamp e stato del
coordinatore sono effimeri. Nessuna scrittura JSON, storage, React o undo nel loop.

Con `T=responseMs/1000`, `ω=2π/T`, `ζ=dampingRatio`:

```text
x'' + 2ζω x' + ω²(x-target) = 0
x e target: frazioni del lato corto
v: frazioni del lato corto / secondo
API temporali: timestamp monotoni in millisecondi, forniti dal chiamante
press: target = pressStrength × maxDeformation; v conservata
release: target = 0; Δv = -releaseImpulse × ω × maxDeformation
```

Il segno positivo comprime, quello negativo estende. Release applica l'impulso
una sola volta nella transizione pressed→released. Press ripetuti e key repeat
non reiniettano impulsi. Con pressStrength zero non c'è impulso di rilascio;
maxDeformation zero annulla x/v/target. `behavior.press:disabled` non genera moto.
Cancel, blur, disable e sospensione azzerano x/v/target/pressed senza impulso.
Active/selected resta indipendente.

Per `y=x-target`, `a=ζω`, la transizione usa
`y(t)=y₀ ec+(v₀+a y₀) es`,
`v(t)=v₀ ec-(a v₀+ω²y₀) es`:

- Sotto smorzamento: `q=ω√(1-ζ²)`, `ec=e⁻ᵃᵗ cos(qt)`, `es=e⁻ᵃᵗ sin(qt)/q`.
- Critico, compreso `|ζ²-1|<1e-10`: `ec=e⁻ᵃᵗ`, `es=t e⁻ᵃᵗ`.
- Sovrasmorzamento: due esponenziali `e₁=e^((-a+q)t)`, `e₂=e^((-a-q)t)`,
  `q=ω√(ζ²-1)`, `ec=(e₁+e₂)/2`, `es=(e₁-e₂)/(2q)`; niente overflow da cosh.

Delta zero o timestamp precedente conserva lo stato; un evento passato viene
applicato al tempo già raggiunto. Numeri non finiti e parametri invalidi sono
rifiutati. Il documento completo viene validato prima di applicare opzioni o
parametri; il solver copia e controlla il comportamento alla configurazione.

### Limiti, determinismo e arresto

La soluzione libera è analitica; i vincoli sono discreti su una griglia interna
**fissa di 1 ms**, non sulla cadenza RAF. È una risoluzione di almeno 80 intervalli
per il periodo naturale minimo ammesso di 80 ms. Ogni tick applica la transizione
esatta, poi `|x|≤maxDeformation` e azzera la velocità uscente al limite (urto
anelastico). Un tetto `|v|≤2ω maxDeformation`, comune a tick, eventi e impulsi,
impedisce energia illimitata da input alternati. Il limite ridotto proietta subito
x e v con la stessa policy; x/v validi sono conservati.

Lo stato conserva base/tick/origine canonici e un'osservazione densa separata.
L'osservazione fra tick viene anch'essa limitata, ma **non modifica la base**.
Un input commette l'osservazione al timestamp esatto e apre una nuova griglia.
Perciò aggiungere frame intermedi non cambia gli urti successivi. Questo è un
oscillatore vincolato discreto, non una ricerca continua dell'istante d'impatto:
la risposta all'urto è quantizzata entro 1 ms. Non si usa Euler variabile.

A parità di timestamp di input, i test confrontano 30/60/120 Hz e frame irregolari
ai tempi comuni, anche con urti reali: errore assoluto di x **<1e-10**, più stretto
del budget normalizzato 1e-4; anche v è confrontata. Il caso libero è verificato
con RK4 indipendente a 10 μs e soluzioni note. Non si rivendica tale errore rispetto
a un modello continuo con collisioni esatte, che non è il contratto implementato.

Nessun accumulatore di delta di rendering: il resto del millisecondo appartiene
all'osservazione. Riposo esatto salta direttamente al tick richiesto. Per chiamate
pure con recupero oltre 60.000 tick si assume l'equilibrio: nel peggiore caso
ammesso (`T=1.2s`, `ζ=.15`) l'inviluppo è già attenuato di circa `e^-47` dopo 60s.
Il runtime non usa questo recupero per la visibilità: resetta il timestamp sia
all'ingresso sia all'uscita dalla sospensione.

Settle richiede **entrambe** `|x-target|<1e-4` e `|v|<1e-3 s^-1`.
Un punto di inversione lontano dal target non ferma il loop. Il solver non viene
snappato: solo la posa visiva usa il target quando settled e il coordinatore
rimuove la superficie. Un hold può così restare compresso con zero RAF; un nuovo
evento riparte dalla soluzione matematica al suo timestamp.

## Deformazione e contatto

Il contratto dinamico è `{ displacement, contact }`, firmato fino a ±.15.
Il vecchio argomento numerico resta una posa diagnostica distinta, limitata a
0… .05, senza alimentare il solver. Con larghezza W, altezza H, lato corto S,
contatto `(cx,cy)`, punto locale `(u,v)` e ampiezza d:

```text
weight = .65 + .35 exp(-4(u/W-cx)²)
X = W/2 + (u-W/2) [1 + .7 d S/W sin(πv/H)]
Y = cy H + (v-cy H) [1 - 2 d S/H weight]
```

È un solo modo globale con peso spaziale. d non è una scala dell'altezza:
la conversione esplicita usa S/H. Al centro, il bordo superiore/inferiore può
muoversi fino a dS; con contatto all'estremo il bordo opposto può muoversi fino
a 2dS. `maxDeformation` limita l'ampiezza del solver, non ogni singolo vertice
della mappa. Il rigonfiamento laterale è contenuto, ≤.35|d|S. Non si dichiara
conservazione del volume, simulazione volumetrica o onda propagante.

Silhouette: quattro tratti diritti campionati in 12 segmenti ciascuno durante
il moto, angoli cubici con punti di controllo mappati. A riposo resta il path
M6.2. Centri delle inclusioni e landmark di gloss/gleam/caustic usano la stessa
mappa. Il grande highlight usa centro mappato e scala verticale locale, quindi
è un'approssimazione del campo; tutto resta dentro la clip deformata. Nessun
nodo SVG, gradiente, filtro, seed o raggio delle bolle viene ricreato per frame.
Padding del filtro ombra: tre sigma + offset + `.35S+2px`, sufficiente per entrambi
i segni e lo spostamento massimo `.30S` con d=.15 ai bordi.

Le coordinate input sono locali [0,1]², clampate; non finiti e host nullo danno
il centro. `clientX/clientY` e `getBoundingClientRect` condividono coordinate CSS
viewport: sottrazione dell'origine e divisione per larghezza/altezza visibile.
Sono supportate traslazione e scale positive allineate agli assi, anche degli
antenati; rotazione, skew, riflessione e prospettiva non sono supportati. La
geometria usa il border box locale misurato con offsetWidth/Height, arrotondato
al pixel CSS; la misura viene letta solo al resize, mai nel frame loop.

Il contatto è fissato all'inizio della pressione; non è un drag. Tastiera al
centro. Un nuovo press durante moto conserva x/v e interpola dal contatto corrente
al nuovo con smoothstep in 80 ms. A riposo il contatto può essere impostato subito,
perché d≈0. Resize conserva contatto normalizzato, stato e seed.

Test numerici e SVG reale coprono 240×64, 96×48, capsule 180×56, 24×24 e 480×24,
centro e quattro bordi, entrambi i segni. Jacobiano campionato positivo >.5;
nessuna intersezione nel contorno SVG campionato a 120 punti nei casi verificati.
Sono verifiche dei casi/range provati, non una dimostrazione simbolica universale.

## Input, scheduler, preferenze e cleanup

L'adattatore non invia click, non naviga, non usa preventDefault, pointer capture
o touch-action:none. Un puntatore primario attivo; gli altri sono ignorati.
Pointerup è ascoltato su window; pointerleave durante pressione cancella, così
il rilascio fuori non lascia stato attivo. Pointercancel, lostpointercapture,
blur, document.hidden e disabled cancellano senza azione o impulso aggiunto.
MutationObserver copre disabled/aria-disabled; frame verifica anche `:disabled`.
Space sul Button ed Enter conservano la semantica nativa. Repeat non cambia
il materiale; eventuali click da autorepeat Enter restano comportamento del browser.

Ogni superficie può ricevere un `JellyCoordinator` come quarto argomento di
attach; la fixture lo condivide. In assenza ne crea uno e ne possiede il destroy.
Rimuovere una superficie non distrugge il coordinatore passato dal chiamante.
Un insieme contiene solo partecipanti in moto: un solo RAF pendente, nessun RAF
idle, hold stabilizzato o dopo cleanup. Il clock ha now/request/cancel iniettabili.

Document hidden, IntersectionObserver offscreen e dimensioni zero cancellano
l'input e sospendono. Resume riparte da riposo con timestamp nuovo, senza catch-up.
Destroy è idempotente; rimuove partecipante, observer, media query e adattatori
registrati, ripristina solo le risorse host possedute e tollera destroy da una
callback status. I test osservano assenza di ulteriori chiamate/input/RAF/DOM,
non misurano heap o garbage collection.

`update` valida atomicamente documento/opzioni e riconfigura il solver, conservando
x/v validi. `render` risolve aspetto, ottica, backend e geometria non animata;
`resize` aggiorna le misure; `frame` legge solo stato/cache e scrive posa/path,
landmark e posizioni delle bolle. Nel loop non ci sono letture layout, parsing,
serializzazione, PRNG, creazione di nodi o notifiche a tutti gli status listener.

Reduced motion live, static, CSS e opaco fermano subito il moto e riportano la
superficie a posa zero, mantenendo feedback statico. Static usa ottica medium e
non modifica i parametri salvati. Opaco mantiene la coppia cromatica M6.2, con
outline distinto per pressed/active e attenuazione disabled; forced colors usa
colori di sistema. Focus, testo, icona e hitbox sono sempre dell'host immobile.

## Evidenza reale e giudizio visivo

[Metadati e campioni numerici](screenshots/jelly-m63/evidence.json).
Filmstrip: prima riga centro `(0.5,0.5)`, seconda laterale `(0.95,0.25)`.
Tempi **0, 80, 240, 450, 530, 610, 690, 1800 ms**: riposo, compressione,
hold, release a 450, decompressione, overshoot, ritorno e assestamento.
I PNG vengono dal renderer SVG reale con tempo iniettato; i WebM registrano
input reali e RAF nativo, compresa una seconda pressione laterale durante il ritorno.

| Sequenza | Chromium | Firefox |
| --- | --- | --- |
| Soft 240×64 | [filmstrip](screenshots/jelly-m63/chromium-soft-main-filmstrip.png) | [filmstrip](screenshots/jelly-m63/firefox-soft-main-filmstrip.png) |
| Soft 96×48 | [filmstrip](screenshots/jelly-m63/chromium-soft-small-filmstrip.png) | [filmstrip](screenshots/jelly-m63/firefox-soft-small-filmstrip.png) |
| Candy 240×64 | [filmstrip](screenshots/jelly-m63/chromium-candy-main-filmstrip.png) | [filmstrip](screenshots/jelly-m63/firefox-candy-main-filmstrip.png) |
| Candy 96×48 | [filmstrip](screenshots/jelly-m63/chromium-candy-small-filmstrip.png) | [filmstrip](screenshots/jelly-m63/firefox-candy-small-filmstrip.png) |
| Sequenza continua Candy | [video](screenshots/jelly-m63/chromium-live.webm) | [video](screenshots/jelly-m63/firefox-live.webm) |
| Reduced motion | [PNG](screenshots/jelly-m63/chromium-reduced.png) | [PNG](screenshots/jelly-m63/firefox-reduced.png) |
| Static | [PNG](screenshots/jelly-m63/chromium-static.png) | [PNG](screenshots/jelly-m63/firefox-static.png) |
| CSS / opaco | [CSS](screenshots/jelly-m63/chromium-css.png), [opaco](screenshots/jelly-m63/chromium-opaque.png) | [CSS](screenshots/jelly-m63/firefox-css.png), [opaco](screenshots/jelly-m63/firefox-opaque.png) |

Ispezione delle filmstrip e dei fotogrammi sequenziali estratti dai video:
compressione continua, rimbalzo contenuto, nessuno scatto evidente quando il
contatto cambia. Candy mostra più inerzia di Soft; su 96×48 l'effetto è più
sottile. Testo/icona rimangono nitidi e fermi. Highlight e inclusioni seguono il
corpo; non si vede un riflesso separato che galleggia sulla silhouette. Il feedback
cromatico press/release rimane istantaneo come in M6.2 e può essere più evidente
della piccola estensione negativa. È un giudizio visivo circoscritto, distinto
dagli assert numerici di continuità, limiti e layout.

[Regressione statica](screenshots/jelly-m63/static-regression.json): caricati
renderer e geometria originali dall'oggetto Git della baseline in moduli temporanei,
confrontati con M6.3 **nello stesso host e sulla stessa griglia pixel**. Quattro
preset × tre formati × due browser: **24/24, zero canali pixel differenti** nello
stato default a riposo. I moduli temporanei sono rimossi in finally. Confrontare
invece il catalogo storico con la nuova pagina introduce differenze di origine
subpixel dovute al layout della fixture: non viene usato come prova di regressione.

## Misure e limiti prestazionali

[Protocollo e dati grezzi](screenshots/jelly-m63/performance.json), script
[jelly-motion-perf.mjs](../scripts/jelly-motion-perf.mjs). Vite **development**, Linux
7.2.13, Intel Core i7-10510U @1.80 GHz, headless Chromium 156.0.8078.4 / Firefox
157.0, viewport 1400×1100, DPR 1. Una sequenza per caso, Candy 240×64 medium,
press 450 ms seguito da release fino a settle. Catalogo distrutto e timer della
fixture fermati; scena separata da una o dodici superfici visibili.

`performance.now()` misura la durata CPU delle callback per superficie, non
paint/GPU o frame time completo. Gli intervalli usano timestamp RAF. Sono
strumentati getBoundingClientRect e offsetWidth/Height durante frame; l'ispezione
del codice esclude altre letture layout nel loop. Idle iniziale 300 ms e finale
250 ms: zero RAF. Long tasks tramite PerformanceObserver dove supportato.

| Browser / superfici | Durata moto ms | RAF / aggiornamenti | CPU totale ms | CPU p95 per superficie ms | Intervallo RAF p95 ms | Layout / long task |
| --- | --- | --- | --- | --- | --- | --- |
| chromium / 1 | 1381.2 | 84 / 84 | 22.1 | 0.40 | 16.70 | 0 / 0 |
| chromium / 12 | 1399.3 | 85 / 1020 | 141.3 | 0.30 | 16.70 | 0 / 0 |
| firefox / 1 | 1409.0 | 85 / 85 | 43.0 | 1.00 | 17.30 | 0 / non supportati |
| firefox / 12 | 1444.0 | 37 / 439 | 109.0 | 1.00 | 50.32 | 0 / non supportati |

Nessun budget adattivo di gruppo o cap DPR introdotto. Il caso Firefox con dodici
SVG filtrati mostra un costo di raster/compositing compatibile con intervalli RAF
più lunghi, ma questo protocollo non isola quale fase del browser ne sia la causa.
Non è una garanzia 60fps o una misura su ThinkPad/Android. I budget della RFC restano
obiettivi; la scena privata può superare il numero di superfici proposto per medium.

## Verifiche e confini

| Comando | Risultato |
| --- | --- |
| `npm run typecheck` / typecheck nella build | Superato |
| `./node_modules/.bin/tsc -p tests/tsconfig.jelly-model.json` | Superato senza DOM/Node, incluso solver |
| `npm test` | **541/541**, 29 file, zero skip/errori nell'esecuzione autorizzata |
| `npm run build` | Superato, lib/tipi/Studio; avviso preesistente chunk Studio >500kB |
| `node scripts/jelly-examples.mjs --check` | Quattro JSON invariati e coerenti col serializer |
| `./node_modules/.bin/playwright test -c playwright.jelly.config.ts` | **38/38**, 19 casi × Chromium/Firefox |
| `node scripts/jelly-motion-evidence.mjs` | Otto filmstrip, due video continui, otto fallback; zero errori console/page |
| `node scripts/jelly-motion-perf.mjs` | Quattro scene misurate, RAF idle/finale zero |
| `node scripts/jelly-static-regression.mjs` | 24 confronti a riposo identici pixel per pixel |
| `git diff --check` | Superato |

Il primo run unitario nel sandbox è fallito con `listen EPERM` nei test relay;
la ripetizione autorizzata supera tutti i test. Il primo avvio del server browser
nel sandbox non riusciva; le esecuzioni browser autorizzate usano localhost.
Il test M6.2 hidden/reopen ora porta esplicitamente in viewport l'host riaperto,
per verificare anche la nuova policy offscreen. Non sono stati eliminati test.

Gli E2E coprono semantica/click, Space/Enter e repeat, touch/cancel, scroll reale
via touch CDP Chromium (Firefox: pointer touch/cancel e wheel), rilascio fuori,
blur, disabled, preferenze/backend in moto, dimensioni nulle e offscreen, resize,
timestamp alla ripresa, ID/seed, contatto smussato, hitbox/contenuto/focus, contorni
estremi e cleanup ripetuto. La perdita di visibilità documento è esercitata con
un evento e `document.hidden` controllati; non è una prova di sospensione del
sistema operativo o del tab su un dispositivo fisico.

Boundary e compilazione senza DOM confermano l'isolamento. Hash prima/dopo:

```text
9411d44c113d9b9bd2d4e18cf10f750c4bfed5946ab54aca40790e944a01bfd3  dist-lib/jello.js
5fb34366844700a325d8d6d0bd1a4432d10265cdb10519db10a50cabb758fa1a  dist-lib/jello.css
edc5bf59419f1016f4592aedf4bf7f3d88c422ad768186fca442071d7d1acfa2  dist/assets/lab-Bv_Q91HJ.js
```

Non eseguiti: suite E2E produttiva completa, WebKit/Safari, Android/WebView/Pixel
reale, GPU/dispositivi fisici, benchmark heap/GC, profiler paint/GPU o contrasto
universale sugli sfondi. Touch emulato non equivale a un Pixel. Restano i limiti
ottici M6.2 (Dense vicino alla resina, Clear grigio su scuro), l'highlight grande
approssimato localmente e il costo multi-superficie Firefox. Nessun blocco residuo
nei criteri tecnici verificati della fixture; la resa non è una simulazione fisica
volumetrica e non approva universalmente i preset candidati.

Prossimo passo M6.4: integrazione atomica nei contratti pubblici/componenti,
Inspector, persistenza ed export, con nuovi gate e una decisione sul budget di
gruppo basata sulle misure. Nessuna di queste integrazioni è stata anticipata.
