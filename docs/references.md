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

## Progetti dell'autore (solo consultazione)

Nessuna modifica è stata fatta a questi repository; nessuna funzionalità, branding, routing o
logica applicativa è stata importata.

### Cable — `ui/index.html`, materiale `.vetro`
Clone locale, revisione `68f5e2052f54110f98f5d3972cdbcffde031d1df` (27 ottobre 2026).
`backdrop-filter: blur(30px) saturate(185%)`, bianco `0,20 + tint·0,52` (tint = 0,45 → ≈ 0,43),
raggio 28 px, highlight interno, `::before` con gradiente in `soft-light`. Nessuna rifrazione.
→ preset "Cable .vetro (approssimazione)".

### BT Score Board — navbar
Clone locale, branch `main`, revisione `ca07af2cc42a2dfdb7d3bf454c2ba122dea94c34`
(28 ottobre 2026). File: `apps/web/src/components/BottomNavigation.tsx`, `glass-map.ts`,
`apps/web/src/styles/bottom-navigation.css`, `tokens.css`, `docs/navbar-refinement/README.md`.
Mappa sin² su fascia 12 px, picco 5 px, applicata con `backdrop-filter: url()` e limitata a
Chromium 156 desktop verificato; blur 10 px, saturazione 150%, tinta rgb(18,18,22) al 14%;
pressione come sola luce, nessuna scala. → preset "BT navbar (approssimazione)" e profilo `bump`.

## Asset

Fotografia di prova CC0: vedi [../public/assets/ATTRIBUTION.md](../public/assets/ATTRIBUTION.md).
Le altre scene (griglia, testo, blocchi, coordinate) sono generate dal codice del laboratorio.
Nessun asset dimostrativo dei progetti di riferimento è stato importato.
