# Indicazioni per il renderer Android nativo

Obiettivo della fase successiva: un renderer Kotlin che produca la stessa lente con gli stessi
parametri, verificabile sugli stessi casi. Niente in questa milestone è codice Android.

## Cosa si porta così com'è

| Web | Android | Note |
| --- | ------- | ---- |
| `src/core/params.ts` (tabella `PARAMS`) | `data class GlassParams` + tabella descrittori | Stesse chiavi, unità (px CSS → dp), intervalli, valori iniziali e `affects`. Il JSON `jello-glass` v1 deve essere importabile su entrambe le piattaforme. |
| `src/core/geometry.ts` | funzioni AGSL + gemelle Kotlin per i test | `sdRoundedRect`, `normalRoundedRect` con `normalRadius`, `profileValue`, `displacementAt`. |
| `docs/android/geometry-cases.json` | test JVM | Valori di riferimento (tolleranza 1e-4). Rigenerati con `npm run geometry:cases`; un test web fallisce se il codice diverge. |
| `src/core/spring.ts` | stessa integrazione a passo fisso (1/240 s) | Oppure `spring()` di Compose con stiffness/damping convertiti; documentare la conversione. |
| `resolvePath` | stessa logica | Percorsi: rifrazione, satinato, opaco. |

## Cosa cambia

Sul web la geometria va rasterizzata in una mappa perché `feDisplacementMap` legge un'immagine.
In AGSL la stessa funzione si valuta **per pixel nello shader**: niente mappa, niente cache,
nessun costo di rigenerazione. Il vettore resta normalizzato e moltiplicato per `refraction`:

```glsl
// pseudocodice AGSL, stessi nomi di geometry.ts
uniform shader content;      // la GlassSource
uniform float2 size;         // lente, px
uniform float2 origin;       // angolo della lente nella sorgente
uniform float radius, band, refraction, dome;
uniform int profile;
half4 main(float2 p) {
  float2 c = p - origin - size * 0.5;
  float2 v = displacementAt(c, size, radius, band, profile, dome); // [-1, 1]
  return content.eval(p + refraction * v);
}
```

- **Accesso alla sorgente**: `RenderEffect.createRuntimeShaderEffect` (API 33+) su un layer
  che contiene la sorgente, come fanno Kyant0/backdrop e Haze (modello "source + effect").
  Il foreground resta fuori dal layer, come sul web.
- **Blur e saturazione** prima della deviazione: `RenderEffect.createBlurEffect` +
  `createColorFilterEffect` concatenati (API 31+).
- **Bordo della sorgente**: in AGSL si può fare clamp del campionamento ed evitare
  l'attenuazione osservata sul web (vedi rendering.md). Documentare la differenza o applicare
  lo stesso comportamento in entrambi i renderer, scegliendo esplicitamente.

## Livelli di fallback proposti

| API | Percorso | Base |
| --- | -------- | ---- |
| 33+ | rifrazione AGSL + blur `RenderEffect` | `RuntimeShader` |
| 31–32 | satinato: blur + tinta `RenderEffect` | Haze usa invalidazioni diverse su 31/32 |
| < 31 | opaco | nessun `RenderEffect` |

Rispettare le impostazioni di sistema equivalenti: rimozione animazioni (`ANIMATOR_DURATION_SCALE`
= 0 → movimento ridotto), testo ad alto contrasto → opaco.

## Casi di prova equivalenti

1. Unit JVM su `geometry-cases.json` (stesse tolleranze).
2. Test strumentati con screenshot del layer (sorgente a griglia, preset "Ottica nuda"):
   fascia ≠ sorgente, centro = sorgente, rifrazione 0 = sorgente, foreground invariato.
   Le stesse soglie della suite Playwright (fascia > 8, centro < 0,5, pass-through < 0,05),
   riviste sulla densità del dispositivo.
3. Scena a coordinate (R = x, G = y) per ricostruire gli spostamenti campionati e confrontarli
   con `displacementAt` × `refraction`.
4. Traslazione senza ricompilazione dello shader né nuove allocazioni (contatori come
   `mapRegenerations` / `attributeWrites`).

## Licenze

Kyant0/AndroidLiquidGlass e chrisbanes/haze sono Apache-2.0. Usarli come dipendenze è possibile
mantenendo le NOTICE; copiarne porzioni richiede attribuzione nel file sorgente. Le formule di
Jello sono state riscritte e non dipendono da quel codice.
