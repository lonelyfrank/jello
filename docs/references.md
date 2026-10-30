# Riferimenti e attribuzioni

Consultati il 29 ottobre 2026. Per ogni fonte distinguiamo:

- **dichiarato** — ciò che affermano gli autori;
- **nel codice** — ciò che abbiamo letto nel sorgente alla revisione indicata;
- **provato qui** — ciò che abbiamo eseguito nel nostro ambiente.

**Nessuna riga di codice è stata copiata** dai progetti seguenti. Jello ne riprende alcune
idee, indicate sotto, con un'implementazione propria. I repository GitHub sono stati clonati
in una cartella temporanea solo per la lettura; non sono stati eseguiti né installati.

## Web

### Aave — "Building Glass for the Web"
<https://aave.com/design/building-glass-for-the-web> · pagina senza data né autore.

- Dichiarato: il glass filtra il contenuto stesso, non lo sfondo ("nothing is sampled from
  underneath"); `feDisplacementMap` con mappa generata dalla forma (R = x, G = y, neutro
  fuori dalla lente); mappa rigenerata solo ai cambi di forma, mentre il trascinamento sposta
  solo la regione; quadrante calcolato e specchiato; specular limitato alla regione della lente;
  Safari mette in cache i filtri per id e limita la dimensione della sorgente; `<video>` e
  canvas richiedono WebGL su Safari. Tabella: `backdrop-filter` SVG solo Chromium, la loro
  tecnica in Chromium, Safari e Firefox.
- Nel codice: non disponibile.
- Provato qui: l'approccio di base (filtro sulla sorgente, sottoregioni, mappa in cache,
  traslazione senza rigenerazione) funziona in Chromium 156 e Firefox 157 headless.
- Ripreso in Jello: l'architettura generale, la separazione mappa/posizione, la simmetria a
  quadranti, la mitigazione per Safari (non verificata).

### PallavAg/liquid-glass-web-react
<https://github.com/PallavAg/liquid-glass-web-react> · revisione `8c615458a0496a007a0fd1d3aa7a9716698f8f03`
(10 giugno 2026) · **MIT**, © 2026 Pallav Agarwal.

- Dichiarato: implementazione dell'approccio Aave; nucleo imperativo indipendente da React.
- Nel codice (`src/core/engine.ts`, `displacementMap.ts`): un filtro per contenitore con
  primitive limitate alla lente (`data-lens`); `feFlood` neutro + `feImage`; tre
  `feDisplacementMap` per l'aberrazione cromatica; alfa della mappa come maschera della forma;
  `objectBoundingBox` ovunque tranne iOS (`userSpaceOnUse`); id nuovo a ogni aggiornamento solo
  su Safari; avviso oltre 2,5 Mpx su Safari; bias di 0,5 px sulle sottoregioni.
- Provato qui: non eseguito.
- Ripreso in Jello: la catena per lente con sottoregioni, i tre passaggi per l'aberrazione, la
  scelta di aggiornare l'id solo su WebKit. Diverso in Jello: coordinate `userSpaceOnUse`
  ovunque; forma nel canale blu con mappa opaca (non nell'alfa); blur/saturazione su una
  sottoregione allargata della rifrazione; profili e parametri propri.

### kwlck/liquid-glass-web
<https://github.com/kwlck/liquid-glass-web> · revisione `a77866771c280eb3edfc108111a01541db6634dc`
(8 ottobre 2026) · **MIT**, © 2026 kwlck.

- Dichiarato: filtra la pagina dal vivo; rifrazione SVG su Chromium e fallback CSS altrove.
- Nel codice (`src/geometry.js`, `src/liquid-glass.js`): SDF di rettangolo arrotondato ed
  ellisse; gradiente numerico dell'SDF; bevel `min(32, lato · 0,16)`; percorso
  `backdrop-filter: url()` abilitato in modo conservativo su Blink.
- Provato qui: non eseguito.
- Ripreso in Jello: nulla di specifico oltre alla conferma che `backdrop-filter: url()` è
  limitato a Blink.

### rdev/liquid-glass-react
<https://github.com/rdev/liquid-glass-react> · revisione `ac48eab18d1f7f444ae30002d240cae29c863a21`
(13 giugno 2025) · **MIT**, © 2025 Max Rovensky.

- Dichiarato: rifrazione ai bordi, aberrazione configurabile, elasticità; "Safari and Firefox
  only partially support the effect (displacement will not be visible)".
- Nel codice (`src/index.tsx`): `filter: url()` su uno strato con `backdrop-filter`, disattivato
  su Firefox; mappe immagine precalcolate; aberrazione con tre displacement e `feBlend screen`.
- Provato qui: non eseguito.
- Ripreso in Jello: nulla; è il caso da evitare (rifrazione legata al backdrop).

## Android (per il renderer futuro)

### Kyant0/AndroidLiquidGlass (libreria `backdrop`)
<https://github.com/Kyant0/AndroidLiquidGlass> · revisione `65ab177e90e5c1d8c62e70cf7755841982da65f6`
(26 agosto 2026) · **Apache-2.0**, © 2025 Kyant.

- Nel codice: `RenderEffect` da API 31, `RuntimeShader` (AGSL) da API 33
  (`backdrop/src/androidMain/.../Platform.kt`); shader di rifrazione su rettangolo arrotondato
  con `refractionHeight`, `refractionAmount`, `depthEffect`, profilo `1 − √(1 − x²)` e normale
  calcolata con raggio `min(1,5·r, metà lato)` (`internal/Shaders.kt`).
- Ripreso in Jello: il profilo `circle` è la stessa funzione; l'idea di calcolare la normale
  con un raggio maggiorato (in Jello `max(r, 1,25·fascia)`). Formula riscritta in TypeScript.
  Se il renderer Kotlin riusasse codice di questa libreria, va mantenuta la NOTICE Apache-2.0.

### chrisbanes/haze
<https://github.com/chrisbanes/haze> · revisione `bac0b12493eb5da154c483b591a8c018bce29adf`
(28 ottobre 2026) · **Apache-2.0**.

- Dichiarato: effetti accelerati per Compose Multiplatform; Haze 2 con blur basato su sorgente
  e "refraction-driven Glass".
- Nel codice: percorsi diversi sotto API 31 (nessun `RenderEffect`, invalidazioni forzate) e a
  API 31/32 (`HazeEffect.android.kt`, `HazeSourceNode.android.kt`).
- Ripreso in Jello: il modello "sorgente esplicita + effetto" che corrisponde a
  GlassSource/GlassSurface; le soglie di API come vincoli per il fallback Android.

## Principi visivi

### Apple — "Meet Liquid Glass", WWDC25 sessione 219
<https://developer.apple.com/videos/play/wwdc2025/219/>

Usati come principi, non come specifica: lensing invece di scattering; luce che risponde
alla geometria e alle interazioni; il tocco "illumina dall'interno"; l'ombra separa; tinta
solo per enfasi; riduzione trasparenza → più satinato, contrasto elevato → bianco/nero con
bordo, movimento ridotto → niente elasticità. Jello non riproduce lo shader né i valori di Apple.

## Progetti personali consultati nella fase sperimentale

Durante la fase sperimentale due progetti personali dell’autore sono serviti come riferimento per
due preset di approssimazione. Quei preset sono stati rimossi dalla libreria ufficiale (vedi
[material-model.md](material-model.md), «Preset rimossi»); nessun codice, branding, dato o
logica di quei progetti è mai stato importato in Jello, e i repository non sono stati modificati.

## Asset

Fotografia di prova CC0: vedi [../public/assets/ATTRIBUTION.md](../public/assets/ATTRIBUTION.md).
Le altre scene (griglia, testo, blocchi, coordinate) sono generate dal codice del laboratorio.
Nessun asset dimostrativo di progetti esterni è stato importato.
