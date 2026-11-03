# M6.4.3 — Fase E: revisione e selezione dei candidati

> ## VISUAL APPROVAL PENDING
> Nessuna review visiva indipendente è stata effettuata. I giudizi qui sotto sono **dell'agente**, derivano da immagini e metriche (`screenshots/`, `metrics-*.json`) e **non sostituiscono** la valutazione di un designer. `visuallyVerified` resta `false` per tutti e quattro i preset, i valori built-in sono **invariati**, nessun candidato è stato promosso. Il completamento tecnico di questa milestone non è un'approvazione estetica.

Materiali per la decisione: `screenshots/comparison/compare_<preset>_<dimensione>_<sfondo>_A-B1-B3.png` (righe: **A, B1, B3**), `screenshots/candidates/`, `screenshots/motion/*_timeline_*` (A, B2, B3; 160×44 e 80×32, chiaro e scuro), `screenshots/bubbles/`, `screenshots/normalized-tint/`.

## 1. Le sei domande di §10.5

Risposte **provvisorie, da verificare a occhio**; dove una sola variante non vince le dico.

| # | Domanda | Risposta basata sulle prove | Fiducia |
|---|---|---|---|
| 1 | Quale variante appare più gelatinoso-elastica? | **B3**, per Candy (bordo ×11, riflesso più curvo e stretto, movimento invariato) e per Dense (corpo e bordo più densi). Per Soft e Clear l'ottica cambia poco in idle e la differenza è soprattutto nel movimento (B2/B3) | media: giudizio visivo dell'agente |
| 2 | Quale è più leggibile? | Il contrasto etichetta/sfondo (5° percentile, idle) è ≥ 4,5 in tutte le varianti; **B3 ha margini migliori o pari di A su Soft (5,42 vs 4,71), Clear (4,95 vs 4,90) e Candy (4,81 vs 4,54)** e peggiori su Dense (6,20 vs 7,02, ancora ampio). Lo stato premuto non è misurato | alta per idle, nulla per premuto |
| 3 | Quale è meno confondibile con Glass? | Nessuno dei candidati introduce rifrazione o lettura dello sfondo; la distinzione resta strutturale (corpo gel senza backdrop). **Clear B1/B3** è il più vicino a un'estetica «acquosa» e il più a rischio: non confrontato direttamente con un Glass nelle stesse immagini | bassa: manca il confronto diretto |
| 4 | Quale mantiene maggiore coerenza con il nome? | Soft ≈ A≈B (nome già rispettato), Clear B (più traslucido-luminoso, più bolle), Candy B3 (più lucido, bordo denso), Dense B3 (più corposo: luminanza −0,10 vs A) | media |
| 5 | Quale funziona meglio su un Button piccolo? | A 80×32 le bolle sono sotto la soglia di leggibilità in tutte le varianti (5–40 px su 2 560); la differenza utile a quella dimensione è corpo/bordo: Dense e Candy B3 | media |
| 6 | Quale presenta il minor costo di rendering? | A, di poco: B3 costa +5 % per frame a 12 superfici e +12/+25 % per aggiornamento di documento (`performance.md`) | alta |

**Non applicato automaticamente il candidato numericamente più diverso** (il criterio non è la differenza raster): ad esempio B1 di Candy ha la differenza raster maggiore (riflesso ×2,7) ma è anche quella da guardare con più attenzione per il rischio «plastica verniciata».

## 2. Decisioni per preset (raccomandazioni all'attenzione del designer)

| Preset | Candidato migliore tecnicamente | Cosa lo sostiene | Cosa manca / rischio | Stato |
|---|---|---|---|---|
| Soft | B3 (ottica poco diversa, movimento B2) | riposo 764 ms, picco +16 %, swing 0,29 px; bolle più piccole | rimbalzo ancora sub-pixel (0,29 px); l'ottica B1 è sottile | non promosso |
| Clear | B3 | corpo più percepibile su chiaro (contrasto 1,29→1,34), bolle ×2,1, riposo 413 vs 764 ms di Soft (differenza meccanica misurabile) | contrasto sul chiaro resta il più basso (1,34); distinzione da Glass non verificata fianco a fianco | non promosso |
| Candy | **B1 = B3** (movimento invariato per decisione) | contrasto bordo/centro 0,0035→0,039; riflesso luminoso e curvo | rischio «plastica»; bolle meno numerose in pixel | non promosso |
| Dense | B3 | luminanza corpo 0,59→0,49 (≠ Soft), bordo +16 %, nessun rimbalzo, 433 ms a riposo | corpo più scuro: contrasto sul fondo scuro in calo (9,4→8,6); risposta 90 % a 190 ms (più lenta) | non promosso |

**Baseline preservata.** Se la review non conferma, il comportamento attuale resta quello di A; i candidati sono riproducibili da `variants.ts`.

## 3. Test a tinta normalizzata (§11)

Quattro preset con la stessa tinta `#b8a2e8` e lo stesso colore etichetta `#211735`; trattamento e movimento invariati. Immagini in `screenshots/normalized-tint/` (A normalizzato = `N_*`, candidato = `NB3_*`; idle, hover, press, hold, release, rebound, rest, disabled; timeline in `screenshots/motion/N_timeline_*`, `NB3_timeline_*`). Differenza media di pixel nell'area del Button fra coppie, stato idle, media su 3 dimensioni × 3 sfondi (`normalization.json`, scala 0–255):

| Coppia | A (normalizzato) | B3 (normalizzato) |
|---|---|---|
| soft / clear | **6,1** (min 2,1) | 9,2 (min 3,4) |
| soft / candy | 13,2 | 12,0 |
| soft / dense | 17,1 | 15,5 |
| clear / candy | 18,5 | 20,1 |
| clear / dense | 22,5 | 23,9 |
| **candy / dense** | 6,7 (min 3,4) | **5,9** (min 3,8) |

Lettura: **la coppia più debole in A normalizzato è Soft/Clear (6,1), che B3 migliora (+50 %)**; la coppia più simile in B3 è **Candy/Dense (5,9)**, che peggiora lievemente. Entrambe differiscono però *nel movimento* (swing di rilascio 0,0155 contro 0 per Candy/Dense; riposo 413 vs 764 ms per Clear/Soft in B3), che questo test statico non vede. Preset «eccessivamente simili» da documentare: **Soft/Clear in A** (era anche meccanicamente identico), **Candy/Dense in B3** nelle immagini ferme. Non è un requisito che ogni pixel differisca; è un segnale per il designer.

## 4. Cosa non è stato fatto

- Nessuna review indipendente, nessun test con utenti.
- Nessuna misura di contrasto in stato premuto/hover; nessuna su sfondi testo e struttura.
- Nessun confronto fianco a fianco con un Glass.
- Nessun test su display ad alta densità fisico (solo DPR 2 emulato in Chromium).
