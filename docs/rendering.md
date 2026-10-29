# Scelte di rendering

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
autori di kwlck/liquid-glass-web e rdev/liquid-glass-react, e BT lo limita a Chromium 156
verificato) e non va confuso con questa tecnica.

Un solo elemento `<filter>` per sorgente, in coordinate `userSpaceOnUse` (origine nel bordo
della sorgente, regione = dimensioni della sorgente). Per ogni lente `n`:

```
feImage            mappa della lente, x/y/width/height = riquadro della lente      → m{n}
feColorMatrix      blu (copertura) → alfa                                          → k{n}
feGaussianBlur     SourceGraphic, sottoregione allargata di |rifrazione| + 3σ      → b{n}
feColorMatrix      saturate, sulla stessa sottoregione allargata                   → s{n}
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
- **Niente WebGL** in questa versione: il filtro SVG copre il contenuto DOM nei due motori
  provati. Aave lo usa per `<video>` e `<canvas>` su Safari, dove non passano dalla pipeline
  dei filtri SVG (dichiarato da Aave, non provato qui). Se servirà, il renderer WebGL riceverà
  la stessa mappa.
- **Niente turbulence**: la lente è una funzione deterministica della forma.

## Limiti osservati

| Limite | Evidenza | Conseguenza |
| ------ | -------- | ----------- |
| Vicino al bordo della sorgente il campionamento esce dall'area: `feDisplacementMap` restituisce trasparente e si vede il contenuto originale. | Test di allineamento con lente a ≤ 46 px dal bordo (viewport emulato ridimensionato). | La rifrazione si attenua sul lato vicino al bordo. Lasciare margine o estendere la sorgente oltre l'area visibile. |
| A DPR frazionario (2,625 emulato) la prima riga di pixel dispositivo dove il bordo dello stage incontra la sorgente filtrata è miscelata diversamente. | `meanDiff` prima dell'esclusione della cornice: 0,059 livelli medi, concentrati nella riga superiore. | Invisibile a occhio; i confronti raster escludono una cornice di 3 px e gli angoli. |
| L'anti-aliasing degli angoli arrotondati dello stage cambia di 1–2 pixel quando la sorgente è filtrata. | Chromium 156 e Firefox 157, DPR 1. | Nessuno visibile; escluso dai confronti. |
| Safari mette in cache l'output dei filtri per id. | **Dichiarato** da Aave e liquid-glass-web-react, non provato qui. | Su UA WebKit il renderer assegna un id nuovo a ogni aggiornamento (`refreshIdOnUpdate: 'auto'`). Da verificare. |
| Safari limita la dimensione della sorgente filtrabile. | **Dichiarato** da Aave e liquid-glass-web-react (soglia non documentata). | Tenere la sorgente piccola; da misurare su dispositivi Apple. |
| Firefox elabora `lostpointercapture` al successivo evento puntatore. | Test `gesture state is cleared on lostpointercapture` (Firefox 157). | Al massimo un movimento in più prima del rilascio; conforme alla specifica "pending pointer capture". |
