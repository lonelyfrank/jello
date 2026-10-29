# Contratto di mappatura verso Android nativo (previsto, non implementato)

**Stato: documento di progetto.** Non esiste un export Kotlin/Compose/AGSL e il laboratorio non lo
offre. GLSL ES 3.00 (WebGL2) e AGSL non sono intercambiabili: AGSL è un dialetto di SkSL eseguito
da `RuntimeShader` (Android 13+, API 33), con `half4 main(float2 fragCoord)`, `shader` come input
al posto delle texture campionate liberamente, nessun framebuffer intermedio scelto
dall’applicazione e nessun controllo delle mipmap. Il porting va riscritto, non tradotto.

## Cosa si porta così com’è

- Il documento `jello-material` v2: stesso JSON, stessa validazione (da riscrivere in Kotlin con
  gli stessi intervalli di `src/core/params.ts`).
- La geometria: `displacementAt` e `computeLensMap` sono pure; i casi di riferimento sono in
  `docs/android/geometry-cases.json` (generati da `npm run geometry:cases`).
- La molla a passo fisso (`src/core/spring.ts`).

## Mappatura dei parametri

| Sezione | Parametro | Destinazione prevista | Note |
| --- | --- | --- | --- |
| geometry | shape, width, height, radius | dimensioni del `Modifier` / `Shape` | il raggio segue `effectiveRadius` |
| material | band, profile, dome | mappa di displacement calcolata su CPU, passata come `BitmapShader` | rigenerata solo al cambio di geometria (`affects: map`) |
| material | refraction | uniform `float` | `affects: filter` |
| material | chroma | tre campionamenti nell’AGSL | facoltativo, spento con il profilo Economy |
| material | blur | `RenderEffect.createBlurEffect` concatenato (`createChainEffect`) | non uguale a feGaussianBlur né al blur WebGL2: **approssimato** |
| material | saturation | `ColorMatrix` | stessi coefficienti di `saturationMatrix` |
| material | tint, tintOpacity, light, lightAngle | disegno Compose sopra l’effetto | come lo strato CSS |
| material | shadow* | `Modifier.shadow` o disegno | approssimato |
| behavior | stiffness, damping, stretch, press* | animazioni Compose o molla portata | stessa semantica di `src/core/spring.ts` |
| quality | profile, dprCap, internalScale | risoluzione dell’effetto | da misurare su Pixel 7 Pro e su un dispositivo meno potente |
| target | backend | nuovo valore `agsl` (non ancora nello schema) | richiederà una nuova versione dello schema |

## Fallback previsti

API < 33: niente `RuntimeShader` → blur + tinta (come il backend CSS). Accessibilità (riduzione
trasparenza, contrasto alto) → superficie opaca, come sul web.

## Prima di dichiarare un export Android

1. Implementazione Kotlin che superi i casi di `geometry-cases.json`.
2. Verifica raster su dispositivo reale (non emulatore) con la versione del runtime registrata.
3. Estensione dello schema (`target.backend: 'agsl'`) con migrazione e test.
