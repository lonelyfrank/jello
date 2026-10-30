# Scelte di rendering

## Tre backend, tenuti separati

| Backend | Dove | Cosa legge | Rifrazione | Loop JS a riposo |
| --- | --- | --- | --- | --- |
| **CSS** (`css`) | vere componenti HTML | il contenuto dietro l’elemento, tramite `backdrop-filter` | no | no |
| **SVG** (`svg`) | vere componenti HTML sopra una GlassSource DOM dichiarata | solo la sorgente dichiarata (filtro sulla sorgente) | sì | no |
| **WebGL2** (`webgl2`) | canvas | una **texture controllata**: pattern deterministico, immagine, canvas del consumatore | sì | no (solo con sorgente dinamica o molla in moto) |

- Il backend richiesto sta nel documento (`target.backend`); quello effettivo e i motivi li
  riportano `GroupStatus` e `SceneStatus`. Lo stesso JSON non ha la stessa resa su backend
  diversi: la tabella di supporto (`src/model/support.ts`) dice cosa è ignorato o approssimato.
- **WebGL2 non legge il DOM.** Non c’è cattura continua della pagina: un documento che chiede
  `webgl2` montato su componenti DOM gira sul percorso automatico e lo dice. Per video e scene
  renderizzate il contratto prevede `kind: 'canvas'` (implementato) e `kind: 'video'` (riservato,
  non implementato).
- Testi, icone e controlli restano DOM in primo piano anche con WebGL2: l’etichetta della lente è
  un elemento posizionato dalla vista, mai disegnato nella texture.

## Backend WebGL2

[`src/runtime/webgl2/scene-view.ts`](../src/runtime/webgl2/scene-view.ts), caricato con
`import()` alla prima `createSceneView()` (chunk separato: le pagine solo DOM non lo scaricano,
verificato in `tests/e2e/webgl.spec.ts` ed `example.spec.ts`).

```
passata sorgente  pattern (procedurale, deterministico in u_time) o texture "cover"  → target scena (con mipmap)
passate blur      gaussiana separabile; blur grandi su livelli mipmap più piccoli      → target blur
composizione      scena + blur + mappa della lente (la stessa CPU map del backend SVG) → canvas
```

- **Geometria condivisa**: la mappa è `computeLensMap` di `src/core/geometry.ts`, caricata una
  volta per geometria e tenuta in una cache LRU (≤ 8 texture). Fascia, profilo e lente centrale
  hanno quindi la stessa deviazione dei due backend.
- **Aggiornamenti**: i normali slider scrivono uniform; il programma viene compilato una volta per
  contesto (contatore `programBuilds`). La geometria carica una mappa; il blur ricalcola solo le
  passate di blur.
- **Rendering su invalidazione**: nessun frame a riposo; un loop gira solo con sorgente dinamica
  (pattern animato, canvas `dynamic`) rispettando il budget del profilo (30 o 60 fps), o mentre la
  molla della lente si muove.
- **Risoluzione**: `css × min(DPR, dprCap) × internalScale` (profilo qualità; riduzione automatica
  facoltativa e visibile).
- **Errori gestiti**: WebGL2 assente o shader che non compila → `effective: 'unavailable'` con il
  motivo (log del compilatore incluso); nell’anteprima la scena passa a CSS sulla stessa texture.
  Perdita del contesto → `lost`, loop fermo, ripristino con ricreazione di programmi, target,
  mappe e texture. Immagine di un’altra origine senza CORS → rifiutata con il motivo (texImage2D
  solleva SecurityError), nessun canvas contaminato.
- **Rilascio**: `destroy()` elimina programmi, buffer, texture, framebuffer e query, scollega
  listener e observer (`texturesAlive` torna a 0).
- **Metriche misurabili**: intervallo tra frame, tempo CPU per frame, tempo GPU solo con
  `EXT_disjoint_timer_query_webgl2` (altrimenti «non disponibile»). Temperatura, consumo e memoria
  GPU non sono stimati.


## Contratto

```
stage (position: relative, overflow: hidden)
├── GlassSource   .jello-source        filter: url(#jello-glass-N)   ← solo questo è filtrato
│   └── scroller → scena               contenuto che può scorrere e animarsi
└── overlay       (stesso riquadro, pointer-events: none)
    └── host      .jello-host          posizionato sopra la sorgente, NON dentro
        ├── GlassSurface  span.jello-surface   tinta, luce, ombra (aria-hidden)
        └── Foreground    testo, icone, controlli semantici
```

- La lente esiste in due posti con le stesse coordinate: come **sottoregione del filtro** sulla
  sorgente (deviazione, blur, saturazione) e come **strato materiale** nell'host (tinta, luce,
  ombra). Il contesto misura il riquadro dell'host rispetto al bordo della sorgente.
- Il foreground non è discendente della sorgente: per costruzione non entra nel filtro.
  Il test `foreground is never displaced` lo verifica anche sul raster.
- Geometria ottica (`geometry.ts`) e accesso allo sfondo (`renderer/source-filter.ts`) sono
  separati: la geometria è una funzione pura da coordinate a vettore; il renderer decide come
  campionare la sorgente. Un renderer AGSL riusa la prima e sostituisce il secondo.

## Percorso principale: filtro SVG sulla sorgente

È l'approccio descritto da Aave ("Building Glass for the Web") e implementato da
liquid-glass-web-react: il filtro si applica con `filter: url(#…)` al contenuto delimitato,
non con `backdrop-filter: url(#…)`. Quest'ultimo funziona solo in Chromium (lo dichiarano gli
autori di kwlck/liquid-glass-web e rdev/liquid-glass-react) e non va confuso con questa
tecnica.

Un solo elemento `<filter>` per sorgente, in coordinate `userSpaceOnUse` (origine nel bordo
della sorgente, regione = dimensioni della sorgente). Per ogni lente `n`:

```
feImage            mappa della lente, x/y/width/height = riquadro della lente      → m{n}
feColorMatrix      blu (copertura) → alfa                                          → k{n}
feGaussianBlur     SourceGraphic, sottoregione allargata di |rifrazione| + 3σ      → b{n}
feColorMatrix      saturazione come matrice esplicita (+ alfa = 1 se blur > 0)      → s{n}
feDisplacementMap  in = s{n}, in2 = m{n}, scale = 2·rifrazione, sottoregione lente  → d{n}
                   (con aberrazione: tre passaggi a scale 1±0,12·chroma, un canale ciascuno)
feComposite in     ritaglio sulla forma                                           → l{n}
feMerge            SourceGraphic + l{0..n}
```

- Fuori dalle sottoregioni non si calcola nulla di nuovo: il resto passa invariato da `feMerge`.
  Il test `refraction 0 is a pass-through` misura una differenza media di 0,00004 livelli
  (Chromium) tra filtro attivo a rifrazione zero e sorgente senza filtro.
- La mappa è opaca e porta la forma nel canale blu, non nell'alfa: le mappe di displacement
  si leggono non premoltiplicate e i pixel trasparenti perderebbero il colore.
- Con blur = 0 il passaggio di blur viene scavalcato (cambio dell'attributo `in`) invece di
  usare `stdDeviation="0"`, gestito in modo diverso tra motori.
- **Blur al bordo della sorgente.** Fuori dalla regione del filtro (= la sorgente) il blur vede
  pixel trasparenti: vicino al bordo il risultato perdeva alfa e, nel `feMerge`, lasciava
  trasparire la sorgente nitida sotto la lente. La saturazione è ora una matrice esplicita
  (stessi coefficienti di `type="saturate"`) con riga alfa `0 0 0 0 1` quando blur > 0: poiché
  `feColorMatrix` lavora su colori non premoltiplicati, ogni pixel viene diviso per il peso del
  kernel caduto dentro la sorgente (convoluzione normalizzata). Richiede una sorgente opaca, che
  è già il contratto del laboratorio. Test `blur reaches the edge of the source without fading`:
  deviazione standard della griglia a 6 px dal bordo 6,1 (Chromium), 5,9 (Firefox), 5,5
  (Pixel 7 emulato) contro 17,9 / 17,9 / 17,2 con la riga alfa identità e ~6,1 all'interno.
- Gli attributi vengono scritti solo se il valore cambia; il contatore `attributeWrites`
  lo rende misurabile.

### Mappa e movimento

- La mappa si genera da `computeLensMap` (un quadrante calcolato e specchiato), si codifica
  in PNG via canvas e si mette in cache per chiave geometrica (dimensioni, raggio, fascia,
  profilo, dome, risoluzione). Rifrazione, blur, saturazione e posizione non fanno parte della chiave.
- Traslare la lente cambia solo `x`/`y` delle primitive. Pressione ed elasticità cambiano
  `width`/`height`: la mappa esistente viene stirata (`preserveAspectRatio="none"`) e lo strato
  materiale scala con la stessa trasformazione. Il foreground non scala.
- Misure (`docs/perf/2026-10-29.json`): 0 rigenerazioni in tutti i 16 scenari, inclusi
  trascinamenti di 3 s con 4 superfici.

### Scorrimento, resize, stacking

- La sorgente non scorre: scorre un suo figlio. La lente resta ferma rispetto alla sorgente e il
  contenuto passa sotto; scorrimento interno e scorrimento della pagina non cambiano le
  coordinate relative. Verificato su raster dopo spostamento, scroll interno, resize del
  viewport e scroll della pagina.
- `ResizeObserver` su sorgente e host e `resize` della finestra rimettono in coda le misure;
  tutte le letture avvengono in un unico frame, prima di tutte le scritture.
- Lo strato materiale non ha `filter`, `opacity < 1`, `mask` o `backdrop-filter` sugli antenati
  (che creerebbero una backdrop root nel percorso satinato). Le regole di layout di
  `glass.css` hanno specificità zero (`:where`) per non imporre posizionamenti all'integratore.

## Navbar: una superficie, indicatore separato

```
nav.navbar (.jello-host, sizing: element, radius: capsule)
├── span.jello-surface     materiale e lente (una sola, per tutta la barra)
├── span.nav-indicator     voce attiva: strato visivo, transizione CSS, nessun filtro
└── button.nav-item × 4    icona SVG + etichetta, foreground
```

- La barra è una sola lente nel filtro. L'indicatore **non** è una seconda lente: due lenti
  sovrapposte comporrebbero due deviazioni della stessa sorgente senza una regola esplicita (il
  `feMerge` dipinge l'ultima sopra la prima). È uno strato con fondo del tema e un filo di luce
  legato a `light`, sopra il materiale e sotto le etichette.
- L'indicatore si posiziona leggendo `offsetLeft/offsetWidth` della voce solo su montaggio,
  `ResizeObserver` e cambio di selezione; il movimento è una transizione CSS, che si ferma a
  riposo. Con il movimento ridotto (di sistema o manuale) salta.
- La pressione usa `setPressed` della superficie (luce di contatto, scala `pressScale`,
  rifrazione `+pressRefraction`): la mappa viene stirata, non rigenerata. La selezione è stato
  del laboratorio, sincronizzato tra i riquadri.
- Il contenuto scorre nello scroller dentro la sorgente: la barra e la sua lente non cambiano
  coordinate (test `stays still while the content scrolls` e raster
  `navbar lens is aligned with the bar and stays put while the content scrolls`).

## Ciclo di vita degli oggetti nel laboratorio

`Stage` (`src/stage/stage.ts`, condiviso da laboratorio e pagina telefono, costruito sul
`GlassGroup` pubblico) monta un solo oggetto per volta: capsula, navbar, pulsante, card o pannello. Smontare significa: `destroy()`
della superficie (lente fuori dal filtro, strato fuori dal DOM, `ResizeObserver` dell'host
scollegato), rilascio dei binding (`bindDrag` o i listener della navbar, incluso `blur` della
finestra) e `hidden` sull'host. Non si usa mai un cambio di percorso per nascondere una lente.
In più, nel nucleo, un host che il layout riduce a 0×0 rimuove la propria lente invece di
lasciarla nel filtro con l'ultima geometria (prima era possibile).

Verifiche: sei passaggi Capsula ↔ Navbar senza lenti, strati o filtri in più; passaggio durante
un'animazione della molla; resize e cambio di percorso con la capsula smontata; la capsula
smontata non reagisce più alla tastiera; posizione, parametri e selezione conservati.

## Percorso satinato e fallback opaco

- **Satinato**: `backdrop-filter: blur(var(--jello-blur)) saturate(...)` sullo strato
  materiale, stessa tinta, luce e ombra. Non simula la rifrazione con gradienti o decorazioni:
  la differenza tra i due percorsi è visibile nel confronto sincronizzato.
- **Opaco**: sfondo opaco del tema e bordo; nessun filtro sulla sorgente. `forced-colors` usa
  `Canvas`/`CanvasText`/`Highlight`. Le regole CSS ripetono il fallback anche senza script.
- Il percorso effettivo, i motivi del fallback e lo stato di verifica sono esposti da
  `GlassContext.status` e mostrati nel laboratorio.

## Cosa non abbiamo fatto, e perché

- **Niente screenshot continui del DOM** (html2canvas e simili): costosi, asincroni, fuori
  sincronia con scroll e animazioni.
- **Niente WebGL sul DOM**: per le componenti reali il filtro SVG resta il percorso con
  rifrazione. WebGL2 è usato solo per scene e texture controllate e riceve la stessa mappa.
- **Niente turbulence**: la lente è una funzione deterministica della forma.

## Limiti osservati

| Limite | Evidenza | Conseguenza |
| ------ | -------- | ----------- |
| Vicino al bordo della sorgente il campionamento della **rifrazione** esce dall'area: `feDisplacementMap` restituisce trasparente e si vede il contenuto originale. | Test di allineamento con lente a ≤ 46 px dal bordo (viewport emulato ridimensionato; pannello mobile aperto). | La rifrazione si attenua sul lato vicino al bordo. Serve un margine ≥ `refraction × (1 + pressRefraction)`: la navbar sta a 12 px dal fondo e il preset `navbar` arriva a 14 px premuto, quindi l'ultimo paio di pixel della fascia inferiore può attenuarsi durante la pressione. Il **blur** non ha più questo limite (normalizzazione dell'alfa). |
| La normalizzazione del blur presuppone una sorgente opaca. | Costruzione del filtro. | Su una sorgente trasparente le zone vuote sotto la lente diventerebbero nere: dare uno sfondo alla sorgente. |
| A DPR frazionario (2,625 emulato) la prima riga di pixel dispositivo dove il bordo dello stage incontra la sorgente filtrata è miscelata diversamente. | `meanDiff` prima dell'esclusione della cornice: 0,059 livelli medi, concentrati nella riga superiore. | Invisibile a occhio; i confronti raster escludono una cornice di 3 px e gli angoli. |
| L'anti-aliasing degli angoli arrotondati dello stage cambia di 1–2 pixel quando la sorgente è filtrata. | Chromium 156 e Firefox 157, DPR 1. | Nessuno visibile; escluso dai confronti. |
| Safari mette in cache l'output dei filtri per id. | **Dichiarato** da Aave e liquid-glass-web-react, non provato qui. | Su UA WebKit il renderer assegna un id nuovo a ogni aggiornamento (`refreshIdOnUpdate: 'auto'`). Da verificare. |
| Safari limita la dimensione della sorgente filtrabile. | **Dichiarato** da Aave e liquid-glass-web-react (soglia non documentata). | Tenere la sorgente piccola; da misurare su dispositivi Apple. |
| Firefox elabora `lostpointercapture` al successivo evento puntatore. | Test `gesture state is cleared on lostpointercapture` (Firefox 157). | Al massimo un movimento in più prima del rilascio; conforme alla specifica "pending pointer capture". |
