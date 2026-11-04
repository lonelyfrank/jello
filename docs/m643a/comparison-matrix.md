# M6.4.3.A — Confronto delle varianti e matrice di distinguibilità dei preset

> Dati misurati sul renderer reale (Chromium, DPR 1, orologio iniettato dell'harness M6.4.3). Le metriche **supportano** la decisione estetica, non la sostituiscono: una differenza maggiore non è un miglioramento. Nessuna variante è stata promossa; `visuallyVerified` resta `false`.

Strumenti: `docs/m643a/tools/comparison-matrix.mjs` → `comparison-matrix.json` (dati grezzi per condizione); le metriche per variante A/B1/B3 sono quelle di M6.4.3 (`docs/m643/metrics-*.json`, non rieseguite), il moto è calcolato con l'oscillatore del modello (`motionMetrics`, uguale ai valori di `docs/m643/motion-metrics.json`: test `m643a-review.test.ts`).

## 1. Le quattro varianti per preset (160×44, sfondo chiaro, idle)

B2 ha l'ottica di A (e il suo trattamento); B1 ha il movimento di A. «Picco press / swing / riposo» in frazioni del lato corto (a 44 px: ×44 = px); swing = escursione massima dal lato opposto dopo il rilascio.

| Preset | Var. | Luminanza corpo | Contrasto sul fondo | Bordo (rim−centro) | Pixel bolle | Etichetta P5 (idle) | Picco press | Swing rilascio | Riposo (ms) |
|---|---|---|---|---|---|---|---|---|---|
| soft | A | 0.5595 | 1.65 | 0.0458 | 81 | 9.99 | 0.0417 | 0.0027 | 587 |
| soft | B1 | 0.5591 | 1.651 | 0.0521 | 31 | 9.76 | 0.0417 | 0.0027 | 587 |
| soft | B2 | 0.5595 | 1.65 | 0.0458 | 81 | 9.99 | 0.0485 | 0.0067 | 764 |
| soft | B3 | 0.5591 | 1.651 | 0.0521 | 31 | 9.76 | 0.0485 | 0.0067 | 764 |
| clear | A | 0.7303 | 1.289 | 0.0959 | 48 | 12.34 | 0.0417 | 0.0027 | 587 |
| clear | B1 | 0.6997 | 1.342 | 0.098 | 102 | 11.71 | 0.0417 | 0.0027 | 587 |
| clear | B2 | 0.7303 | 1.289 | 0.0959 | 48 | 12.34 | 0.0374 | 0.0017 | 413 |
| clear | B3 | 0.6997 | 1.342 | 0.098 | 102 | 11.71 | 0.0374 | 0.0017 | 413 |
| candy | A | 0.346 | 2.54 | 0.0035 | 134 | 6.33 | 0.0733 | 0.0155 | 927 |
| candy | B1 | 0.3534 | 2.494 | 0.039 | 84 | 6.15 | 0.0733 | 0.0155 | 927 |
| candy | B2 | 0.346 | 2.54 | 0.0035 | 134 | 6.33 | 0.0733 | 0.0155 | 927 |
| candy | B3 | 0.3534 | 2.494 | 0.039 | 84 | 6.15 | 0.0733 | 0.0155 | 927 |
| dense | A | 0.5903 | 1.571 | 0.0776 | 48 | 8.1 | 0.0227 | 0 | 330 |
| dense | B1 | 0.4938 | 1.85 | 0.0898 | 38 | 6.65 | 0.0227 | 0 | 330 |
| dense | B2 | 0.5903 | 1.571 | 0.0776 | 48 | 8.1 | 0.026 | 0 | 433 |
| dense | B3 | 0.4938 | 1.85 | 0.0898 | 38 | 6.65 | 0.026 | 0 | 433 |

Lettura: la differenza *ottica* si vede nelle colonne luminanza/bordo/bolle (B1, B3); la differenza *di movimento* nelle ultime tre (B2, B3). Candy B2 = A e B3 = B1 (movimento invariato per decisione); la UI lo segnala («identica a …»). Le due leve sono separabili nella griglia 2×2 (A · B1 / B2 · B3).

## 2. Matrice di distinguibilità a tinta normalizzata (§9)

Stessa tinta `#b8a2e8`, stesso colore del contenuto, stesso sfondo, etichetta nascosta; media su sfondi chiaro, scuro e gradiente. **N** = baseline normalizzata (A), **NB3** = B3 normalizzato. Canali: raster = differenza media assoluta sull'area del Button (0–255) e quota di pixel che differiscono di più di 12/255; luminanza = |Δ luminanza media dell'interno|; bordo = |Δ (luminanza anello − centro)|; riflesso = |Δ (95° percentile della fascia alta − mediana dell'interno)|; inclusioni = differenza relativa dei pixel che le bolle modificano; moto = differenze di picco, swing e tempo di riposo dell'oscillatore.

**Classe** = euristica di triage sul numero di canali che superano una soglia scelta da me (raster ≥ 8, luminanza ≥ 0,03, bordo ≥ 0,02, riflesso ≥ 0,04, inclusioni ≥ 30 %, moto: picco ≥ 0,01 o swing ≥ 0,003 o riposo ≥ 150 ms): ≥ 4 canali «distinct», 2–3 «partly distinct», ≤ 1 «similar (review by eye)». **Non è una misura percettiva**: le soglie sono arbitrarie e solo un occhio umano decide se due preset sono troppo vicini.

### 2.1 Baseline normalizzata (N), 160×44

| Coppia | Raster (media) | Raster (% px > 12) | Luminanza | Bordo | Riflesso | Inclusioni | Moto: picco / swing / riposo | Canali che differiscono | Classe (euristica) |
|---|---|---|---|---|---|---|---|---|---|
| soft/clear | 6.4267 | 21.5 % | 0.0246 | 0.0134 | 0.0521 | 0.272 | 0 / 0 / 0 ms | highlight | similar (review by eye) |
| soft/candy | 13.7033 | 38.3 % | 0.0592 | 0.0236 | 0.0282 | 0.1397 | 0.0316 / 0.0128 / 340 ms | raster, luminance, edge, motion | distinct |
| soft/dense | 17.7867 | 34.9 % | 0.0853 | 0.0117 | 0.0262 | 0.308 | 0.019 / 0.0027 / 257 ms | raster, luminance, inclusions, motion | distinct |
| clear/candy | 19.31 | 45.0 % | 0.0838 | 0.0193 | 0.0248 | 0.3733 | 0.0316 / 0.0128 / 340 ms | raster, luminance, inclusions, motion | distinct |
| clear/dense | 23.53 | 38.6 % | 0.1099 | 0.0113 | 0.0259 | 0.1307 | 0.019 / 0.0027 / 257 ms | raster, luminance, motion | partly distinct |
| candy/dense | 6.85 | 22.3 % | 0.0262 | 0.0153 | 0.002 | 0.4127 | 0.0506 / 0.0155 / 597 ms | inclusions, motion | partly distinct |

### 2.2 B3 normalizzato (NB3), 160×44

| Coppia | Raster (media) | Raster (% px > 12) | Luminanza | Bordo | Riflesso | Inclusioni | Moto: picco / swing / riposo | Canali che differiscono | Classe (euristica) |
|---|---|---|---|---|---|---|---|---|---|
| soft/clear | 9.5967 | 28.8 % | 0.0389 | 0.0163 | 0.0619 | 0.782 | 0.0111 / 0.005 / 351 ms | raster, luminance, highlight, inclusions, motion | distinct |
| soft/candy | 12.4433 | 40.3 % | 0.0538 | 0.0026 | 0.1472 | 0.6597 | 0.0248 / 0.0088 / 163 ms | raster, luminance, highlight, inclusions, motion | distinct |
| soft/dense | 16.13 | 44.2 % | 0.0786 | 0.0544 | 0.0421 | 0.3567 | 0.0225 / 0.0067 / 331 ms | raster, luminance, edge, highlight, inclusions, motion | distinct |
| clear/candy | 20.7867 | 48.5 % | 0.0927 | 0.0187 | 0.0853 | 0.3707 | 0.0359 / 0.0138 / 514 ms | raster, luminance, highlight, inclusions, motion | distinct |
| clear/dense | 24.8567 | 53.7 % | 0.1142 | 0.0417 | 0.1041 | 0.662 | 0.0114 / 0.0017 / 20 ms | raster, luminance, edge, highlight, inclusions, motion | distinct |
| candy/dense | 6.0633 | 15.8 % | 0.0283 | 0.0544 | 0.1893 | 0.4613 | 0.0473 / 0.0155 / 494 ms | edge, highlight, inclusions, motion | distinct |

### 2.3 80×32

N (baseline):

| Coppia | Raster (media) | Raster (% px > 12) | Luminanza | Bordo | Riflesso | Inclusioni | Moto: picco / swing / riposo | Canali che differiscono | Classe (euristica) |
|---|---|---|---|---|---|---|---|---|---|
| soft/clear | 5.9633 | 19.3 % | 0.0242 | 0.0136 | 0.0519 | 0.089 | 0 / 0 / 0 ms | highlight | similar (review by eye) |
| soft/candy | 13.0133 | 36.7 % | 0.0593 | 0.0278 | 0.0304 | 0.6497 | 0.0316 / 0.0128 / 340 ms | raster, luminance, edge, inclusions, motion | distinct |
| soft/dense | 16.8467 | 33.4 % | 0.0855 | 0.0116 | 0.0305 | 0.6693 | 0.019 / 0.0027 / 257 ms | raster, luminance, inclusions, motion | distinct |
| clear/candy | 18.1667 | 42.1 % | 0.0835 | 0.0276 | 0.0215 | 0.6773 | 0.0316 / 0.0128 / 340 ms | raster, luminance, edge, inclusions, motion | distinct |
| clear/dense | 22.1167 | 36.5 % | 0.1097 | 0.0118 | 0.0217 | 0.694 | 0.019 / 0.0027 / 257 ms | raster, luminance, inclusions, motion | distinct |
| candy/dense | 6.6 | 22.3 % | 0.0262 | 0.0172 | 0.0005 | 0.0743 | 0.0506 / 0.0155 / 597 ms | motion | similar (review by eye) |

NB3:

| Coppia | Raster (media) | Raster (% px > 12) | Luminanza | Bordo | Riflesso | Inclusioni | Moto: picco / swing / riposo | Canali che differiscono | Classe (euristica) |
|---|---|---|---|---|---|---|---|---|---|
| soft/clear | 9.0133 | 27.3 % | 0.0391 | 0.0177 | 0.0483 | 0.8227 | 0.0111 / 0.005 / 351 ms | raster, luminance, highlight, inclusions, motion | distinct |
| soft/candy | 11.79 | 37.8 % | 0.054 | 0.0073 | 0.1371 | 0.9043 | 0.0248 / 0.0088 / 163 ms | raster, luminance, highlight, inclusions, motion | distinct |
| soft/dense | 15.64 | 43.2 % | 0.0808 | 0.0559 | 0.0465 | 0.8323 | 0.0225 / 0.0067 / 331 ms | raster, luminance, edge, highlight, inclusions, motion | distinct |
| clear/candy | 19.62 | 45.5 % | 0.093 | 0.0217 | 0.0888 | 0.4617 | 0.0359 / 0.0138 / 514 ms | raster, luminance, edge, highlight, inclusions, motion | distinct |
| clear/dense | 23.8267 | 51.5 % | 0.1146 | 0.0487 | 0.0948 | 0.13 | 0.0114 / 0.0017 / 20 ms | raster, luminance, edge, highlight, motion | distinct |
| candy/dense | 6.0133 | 14.7 % | 0.0287 | 0.0633 | 0.1836 | 0.4073 | 0.0473 / 0.0155 / 494 ms | edge, highlight, inclusions, motion | distinct |

## 3. Cosa dice la matrice

1. **Soft/Clear è la coppia più debole in A**: pixel quasi uguali (raster 6,4), luminanza e bordo simili e **movimento identico** (stesse quattro costanti: swing, picco e riposo coincidono). Con B3 passa a «distinct» (raster 9,6, riposo 351 ms di differenza, swing 0,005): il miglioramento è reale ma viene in parte dal movimento, che un'immagine ferma non mostra.
2. **Candy/Dense ha la distanza di pixel più bassa in B3 (6,1)**, ma il raster è l'unico canale in cui si assomigliano: riflesso (0,19), bordo (0,054), inclusioni (0,46) e movimento (riposo 494 ms, swing 0,0155 contro nessun rimbalzo) differiscono. Con le loro tinte vere (rosa contro verde) non sono confondibili: la normalizzazione elimina proprio la tinta, per costruzione.
3. **A 80×32, in baseline (N)** due coppie sono «similar»: Soft/Clear (solo il riflesso differisce, movimento identico) e Candy/Dense (differisce solo il movimento: a quella dimensione i due corpi sono molto vicini quando la tinta è la stessa). **Con B3 (NB3) tutte e sei le coppie superano la soglia di almeno quattro canali** anche a 80×32 (Candy/Dense: bordo, riflesso, inclusioni, movimento). L'euristica è però generosa; la conferma resta a occhio.
4. La distanza di pixel non coincide con la distinguibilità: Clear/Dense ha il raster più alto (23–25), in larga parte dovuto alla luminanza (Clear è chiaro, Dense scuro), mentre Candy/Dense ha il raster più basso pur differendo per riflesso, bordo e moto.

### Cambiamento minimo suggerito (non applicato, solo se la review conferma l'impressione di somiglianza)

| Coppia | Quando | Leva più piccola con i descrittori esistenti |
|---|---|---|
| Soft / Clear (baseline A) | già risolta da B3 | adottare almeno il movimento B2 di Clear (riposo 413 ms contro 764 ms di Soft: oggi sono meccanicamente identici in A) |
| Candy / Dense a tinta uguale, soprattutto 80×32 | solo se il reviewer li giudica troppo simili | `Dense.highlightStrength` ↓ o `Dense.roughness` ↑ (riflesso più spento) e/o `Dense.bodyOpacity` → 1: aumentano la distanza di riflesso e luminanza senza toccare movimento e tinta |

## 4. Limiti

- Un solo motore (Chromium), un solo DPR (1), sfondi chiaro/scuro/gradiente (non «testo» e «strutturato»); etichetta nascosta, quindi nessuna informazione sull'interazione col testo.
- Nessun confronto con un osservatore umano né con Glass.
- Le soglie della classe sono mie: i dati grezzi (`comparison-matrix.json`, `raw`) permettono di usarne altre.
