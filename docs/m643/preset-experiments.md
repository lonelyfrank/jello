# M6.4.3 — Fase C: esperimenti A/B sui quattro preset

**Metodo.** Varianti diagnostiche e non persistenti in `tests/fixtures/jelly-m643/variants.ts` (mai importate da `src/`, mai nella Library, nessuna scrittura nell'archivio):

| Variante | Documento | Trattamento |
|---|---|---|
| **A** | built-in invariato (`JELLY_CANDIDATE_PRESETS`) | `m642` |
| **B1** | solo valori ottici candidati | `m643` |
| **B2** | solo valori di movimento candidati; ottica = A | `m642` |
| **B3** | B1 + B2 | `m643` |

B1/B2/B3 usano **solo descrittori esistenti**; seed, id, geometria, target e quality di A sono invariati per costruzione (testato: `m643-visual.test.ts`). Quando si confronta l'ottica il movimento è lo stesso; quando si confronta il movimento l'ottica è la stessa. Le metriche pixel sono in `metrics-*.json` (Chromium, DPR 1, label nascosta, orologio iniettato); le metriche di movimento in `motion-metrics.json` (oscillatore del modello, griglia 1 ms). Le metriche di pixel **non sostituiscono un giudizio estetico**: una differenza maggiore non è un miglioramento.

Immagini: `screenshots/candidates/` (fogli B1, B3 per tutte le dimensioni su chiaro/scuro/gradiente, 160×44 anche su testo e struttura; B2 a 160×44), `screenshots/comparison/compare_<preset>_<dimensione>_<sfondo>_A-B1-B3.png` (righe dall'alto: **A, B1, B3**; colonne: idle, hover, press, hold, release, rebound, rest, disabled), `screenshots/motion/*_timeline_*` (pressione a 0, rilascio a 600 ms; colonne 0, 70, 140, 300, 600, 650, 700, 780, 880, 1000, 1200, 1600 ms).

## Valori ottici candidati (B1) e di movimento (B2)

| Preset | Ottica A → B1 (solo i valori che cambiano) | Movimento A → B2 |
|---|---|---|
| Soft | `highlightStrength` .35→.50, `roughness` .55→.72, `thickness` .35→.42, `transmission` .55→.50, `scattering` .25→.30, `bodyOpacity` .82→.86, `edgeFalloff` 1,5→1,3, `elevation` 1→2, `shadowOpacity` .18→.16, bolle: raggio 2,5–6→1,5–3,5, `opacity` .8→.55 | 360/.65/.060/.15 → **380/.52/.065/.22** |
| Clear | `tint` #d2e9ee→#b9e1ee, `bodyOpacity` .92→.90, `transmission` .70→.72, `absorption` .5→.6, `scattering` .12→.10, `thickness` .35→.45, `edgeFalloff` 1,5→2,2, `highlightStrength` .40→.50, `roughness` .30→.20, bolle: raggio 2–5→2,5–5, `opacity` .8→.95 | 360/.65/.060/.15 → **320/.70/.055/.12** |
| Candy | `thickness` .55→.62, `edgeFalloff` 2→2,4, `absorption` 2,2→2,6, `transmission` .40→.45, `highlightStrength` .35→.75, `roughness` .55→.25, `bodyOpacity` .90→.93, bolle: raggio 2,5–6→2–5, `opacity` .8→.9 | **invariato** (§6.2) |
| Dense | `tint` #a6c9b2→#8fb7a0, `bodyOpacity` .95→.97, `transmission` .25→.12, `absorption` 1,8→2,4, `scattering` .70→.55, `thickness` .35→.65, `edgeFalloff` 1,5→2,6, `highlightStrength` .35→.30, `roughness` .55→.85, `shadowOpacity` .18→.30, bolle: raggio 2–5→2–4, `opacity` .8→.55 | 220/1,05/.035/.05 → **270/1,10/.040/.04** |

I valori di movimento sono i candidati iniziali del brief, **misurati, non applicati ciecamente**.

## Tabelle di confronto (160×44, sfondo chiaro salvo diversa indicazione)

Pressione e rilascio dall'oscillatore (frazioni del lato corto; a 44 px: ×44 → px). «Tempo a riposo» = |x − target| < 1e-4 e |v| < 1e-3.

### Soft Skin (`jelly-soft`)

| Criterio | Baseline A | Candidato B3 | Decisione |
|---|---|---|---|
| Corpo | luminanza 0,560, contrasto sul fondo 1,65 | invariato (0,559 / 1,65) | Il corpo era già giusto; si lavora su riflesso e bordo |
| Bordo | contrasto bordo/centro 0,046 | 0,052 (+14 %) | Leggermente più profondo, nel segno «profondità moderata» |
| Riflessi | riflesso 0,244 effettivo, ampiezza 0,34 | 0,302 effettivo, ampiezza 0,40 (più largo e morbido) | Più ampio e diffuso come da §4.1; da giudicare a occhio |
| Bolle | 81 px visibili | 31 px | **Voluto** (piccole, poco invasive); a 80×32 6 px: praticamente assenti |
| Pressione | picco 0,0417 (1,8 px) | 0,0485 (2,1 px, +16 %) | Cede un po' di più, ancora modesto |
| Rilascio | swing 0,0027 (0,12 px), riposo 587 ms | swing 0,0067 (**0,29 px**), riposo 764 ms | **Il valore candidato non rende percepibile il rimbalzo di Soft** (< 0,3 px); resta «assestamento» più che rimbalzo. Distinto da Candy (×2,3 di swing) |
| Performance | — | +5 % per frame a 12 superfici (cfr. `performance.md`) | Accettabile |

### Transparent Gel (`jelly-clear`)

| Criterio | Baseline A | Candidato B3 | Decisione |
|---|---|---|---|
| Corpo | luminanza 0,730, contrasto 1,29 | 0,700, **1,34**; scuro: 5,41 → 5,49 | Più percepibile su chiaro senza aumentare `bodyOpacity` (anzi −0,02) |
| Bordo | 0,096 | 0,098 | Invariato; il bordo luminoso era già presente |
| Riflessi | riflesso effettivo 0,33, ampiezza 0,24 | 0,45, ampiezza 0,21 (più luminoso e più stretto) | Coerente con «highlights sottili e controllati» |
| Bolle | 48 px | **102 px** (+112 %); a 80×32: 9 → 18 | Elemento distintivo, come richiesto; protezione dell'etichetta: continua |
| Pressione | picco 0,0417 | 0,0374 | Più contenuta |
| Rilascio | swing 0,0027, riposo 587 ms | swing 0,0017, **riposo 413 ms** | Differenza **misurabile** da Soft (riposo 413 vs 764 ms): conservata. Percettibilità visiva non provata: da review |
| Performance | — | come sopra | Accettabile |

### Glossy Gummy (`jelly-candy`)

| Criterio | Baseline A | Candidato B3 | Decisione |
|---|---|---|---|
| Corpo | luminanza 0,346, contrasto 2,54 | 0,353 / 2,49 | Invariato nell'aspetto d'insieme |
| Bordo | **0,0035** (corpo piatto) | **0,039** (×11); scuro 0,020 → 0,060 | **Miglioramento più netto della milestone**: il colore ora «gira» verso il bordo |
| Riflessi | riflesso effettivo 0,24, ampiezza 0,34 | **0,65**, ampiezza 0,23 (×2,7 più luminoso, più stretto) | Luminoso e curvo; il rischio è «plastica verniciata»: da giudicare a occhio |
| Bolle | 134 px | 84 px (variazione media di luminanza 8,1 → 10,8) | Meno numerose in pixel, più leggibili per pixel: compromesso, da giudicare |
| Pressione / rilascio | picco 0,0733, swing 0,0155, riposo 927 ms | identici (§6.2) | **Non modificato**, come richiesto |
| Performance | — | come sopra | Accettabile |

### Dense Gel (`jelly-dense`)

| Criterio | Baseline A | Candidato B3 | Decisione |
|---|---|---|---|
| Corpo | luminanza 0,590, contrasto 1,57 (≈ Soft) | **0,494, 1,85**; scuro 9,4 → 8,6 | Ora più pesante di Soft di 0,065 in luminanza: risolve il limite principale. Scuro: contrasto leggermente inferiore |
| Bordo | 0,078 | 0,090 (+16 %) | Bordo più profondo (`edgeFalloff` 2,6, `thickness` .65) |
| Riflessi | riflesso effettivo 0,24, ampiezza 0,34 | 0,16, ampiezza 0,45 | Più largo e meno brillante, come richiesto |
| Bolle | 48 px | 38 px | Attenuate, come richiesto |
| Pressione | picco 0,0227 (1,0 px), 90 % a 146 ms | 0,026 (1,15 px), 90 % a **190 ms** | Più lento a rispondere (+44 ms): ancora rapido, non inerte |
| Rilascio | nessun rimbalzo, riposo 330 ms | nessun rimbalzo, riposo 433 ms | Smorzato, come richiesto |
| Performance | — | come sopra | Accettabile |

## Leggibilità dell'etichetta (tutte le varianti)

Contrasto del colore dell'etichetta contro i pixel sotto di essa (etichetta nascosta, banda centrale, **5° percentile**, stato idle), minimo su 3 dimensioni × 3 sfondi: A 4,71 / 4,90 / 4,54 / 7,02 (Soft, Clear, Candy, Dense); B3 **5,42 / 4,95 / 4,81 / 6,20**. Tutti ≥ 4,5 (soglia AA per testo normale). Margine minimo: A **0,04** (Candy); B3 **0,31** (Candy) e 0,45 (Clear). Lo stato premuto non è stato misurato (lo scurimento del tint lo riduce): limite dichiarato.

## Cosa NON ha dato risultato

- Il rimbalzo di Soft resta sub-pixel con i valori suggeriti dal brief (0,29 px a 44 px). Sensibilità calcolata (stesso oscillatore, `responseMs` 380, `maxDeformation` .065): ζ .52 → 0,29 px · ζ .45 → 0,41 px · ζ .40 → **0,51 px** (riposo 956 ms, già quasi Candy) · ζ .30 → 0,77 px (1,3 s). **Anche il rimbalzo di Candy è 0,68 px a 44 px**: in questo modello l'ampiezza assoluta del rimbalzo è sub-pixel per tutta la famiglia; l'impressione elastica viene dalla compressione in pressione (fino a 3,2 px per Candy) e dalla durata dell'assestamento (0,9 s), non dall'oltrepassamento. Portare Soft a ≥ 0,5 px costerebbe un comportamento vicino a Candy: decisione per la review.
- Le bolle a 80×32 non diventano leggibili in nessuna variante (§ `visual-anatomy.md`).
- Con tinta normalizzata Candy/Dense restano i più simili (`visual-review.md` §3).
