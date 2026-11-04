# M6.4.3 — Fase B: anatomia visiva ed esperimenti sulle inclusioni

Nessuna modifica alla fisica, allo schema, al seed, al numero di candidati o al conteggio delle bolle. Tutto ciò che segue è **opt-in** tramite l'opzione di rendering `treatment: 'm643'` (default `'m642'` = rendering storico, pixel-identico: `regression-check.json`, 0 pixel diversi su 17 fogli).

## 1. Le cinque strati canonici, come già esistono nel renderer

| Strato (§3.1) | Nodi SVG (`runtime/experimental/jelly.ts`) | Parametri che lo governano |
|---|---|---|
| A · Corpo | `base` (gradiente `body`: `lightTint`→`tint`→`deepTint`), `corePath` (`core`, radiale), `veil` | `tint`, `bodyOpacity`, `transmission`, `absorption`, `thickness`, `scattering` → `centerAlpha`, `edgeAlpha`, `veil` |
| B · Profondità di bordo | `rimPath` (stroke sfocato, gradiente `rim`), `poolPath` (`pool`, ombra interna in basso) | `thickness`, `edgeFalloff` → `rimWidth`, `edgeStop` |
| C · Inclusioni | `bubbles` (un `<g>` per bolla) | `seed`, `density`, `radiusMin/Max`, `depthMin/Max`, `opacity` |
| D · Pelle | `highlight` (riflesso diffuso), `glossPath` (lucido), `gleam` (stretto), `caustic` (attenuato in basso) | `highlightStrength`, `roughness` → `highlight`, `highlightSpread` |
| E · Risposta elastica | `renderMotion`: tutti i `d` e i centri passano da `surfacePoint` | oscillatore unico |

Osservazione che guida la fase: gli strati B e D dipendono quasi solo da `thickness`, `edgeFalloff`, `highlightStrength`, `roughness`. **Bastano i parametri esistenti** per differenziare i trattamenti (vedi `preset-experiments.md`); nessun descrittore nuovo è stato introdotto.

## 2. Cosa è stato modificato nel codice (e solo questo)

`src/model/experimental/jelly-visual.ts`: `projectBubble(..., treatment = 'm642')`. Con `'m643'`:
- **protezione dell'etichetta continua**: finestra super-gaussiana `exp(−(((x−½)/0,30)⁴ + ((y−½)/0,22)⁴))` invece del rettangolo con salto 0,38 (massima protezione al centro, uguale al valore storico 0,38; ≈ nessuna protezione fuori dall'area testo). Verificato da `m643-visual.test.ts` («no step in opacity across the old band edges»: salto relativo 0,62 → < 0,01);
- attenuazione di profondità e scattering più mite (`0,3 + 0,35·assorbimento·spessore` e `1 − 0,35·scattering` invece di `0,45 + 0,5·…` e `1 − 0,5·scattering`), così il contrasto non sparisce con Dense/Candy;
- identità, posizione, raggio e profondità **identici** al trattamento storico (testato).

`src/runtime/experimental/jelly.ts`: opzioni `treatment` e `diagnosticBubbleParts`; con `'m643'` ogni bolla è `circle` (gradiente `bubble3` colorato dalla tinta del gel invece del blu-notte fisso, bordo di 0,8 px in `deepTint`) + arco di luce trasmessa in basso a destra (`rim`) + mezzaluna speculare in alto a sinistra (`crescent`, più nitida per le bolle vicine alla superficie, in funzione di `depth`). Un cambio di trattamento ricrea i nodi delle bolle una volta, senza crescita (E2E `jelly-m643.spec.ts`, 20 commutazioni). Nessun nodo per frame, nessun RAF, nessun secondo solver, nessuna modifica del contenuto semantico, hitbox, backend CSS/opaco (E2E: CSS/opaco → 0 bolle come prima).

Il trattamento **non è persistito**, non fa parte del documento, non cambia `jello-material` v2 né `familyVersion`.

## 3. Esperimenti sulle inclusioni (§8)

Stessi documenti baseline, stesso seed e stessa dimensione; solo il trattamento cambia. `metrics-X*.json`, immagini in `screenshots/bubbles/` (320×96 e 160×44, DPR 2, sfondo chiaro). Misura: pixel del Button (label nascosta) che cambiano di ≥ 6/255 quando le bolle sono attive, e variazione media di luminanza ×255 di quei pixel. 160×44, sfondo chiaro:

| Variante | Soft | Clear | Candy | Dense |
|---|---|---|---|---|
| X0 baseline | 81 px / 12,5 | 48 / 23,0 | 134 / 8,1 | 48 / 15,9 |
| X1 solo parametri (`opacity` 1, raggio 2,5–6) | 92 / 14,4 | 88 / 23,9 | 164 / 9,0 | 87 / 14,7 |
| X2 solo gradiente tinto | 42 / 11,7 | 38 / 13,6 | 51 / 12,1 | 40 / 13,4 |
| X3 solo arco di luce | 84 / 13,5 | 49 / 25,4 | 158 / 8,6 | 62 / 17,4 |
| X4 solo mezzaluna | 90 / 13,9 | 51 / 25,3 | 180 / 8,9 | 71 / 16,5 |
| X5 tutti gli strati m643 | 81 / 13,3 | 66 / 16,3 | 122 / 11,1 | 61 / 15,6 |

Lettura onesta:
1. **Il gradiente tinto da solo riduce la visibilità** (X2: −40/−50 % dei pixel): sostituisce il blu-notte che dava il contrasto. La prima implementazione di X5 era peggiore della baseline su tutti e quattro (52/45/81/46 px); con bordo più scuro e più largo (0,8 px) e archi più marcati X5 **eguaglia o supera la baseline** su Soft, Clear, Dense e resta ~9 % sotto su Candy, con variazione media di luminanza più alta su Soft/Candy.
2. **La leva più forte per la visibilità è parametrica** (X1: +80 % su Clear, +80 % su Dense, +22 % su Candy), cioè opacità e raggio, non il disegno della bolla. Il trattamento m643 non risolve da solo «bolle poco visibili a dimensione UI»: dà alle bolle **struttura interna** (rifrazione di luce, curvatura) e una protezione dell'etichetta senza artefatti; la visibilità si regola coi parametri (usati in B1, `preset-experiments.md`).
3. A 80×32 le differenze sono dell'ordine di 5–15 pixel su 2 560: **nessuna variante rende le bolle una caratteristica leggibile a quella dimensione**, e non è stato forzato (violerebbe la protezione del testo). Dato in `metrics-*.json`.
4. Quantità ≠ visibilità (§8.3): nessun preset ha cambiato `density`; B1 diminuisce il raggio di Soft e Dense (inclusioni «poco invasive», «attenuate») e lo aumenta per Clear.

Profondità (§8.4): usato solo `depth` già generato — nel trattamento m643 controlla opacità della mezzaluna (0,5 + 0,45·(1 − depth)), raggio e attenuazione; nessun secondo sistema casuale.
Coerenza geometrica (§8.5): le bolle seguono `surfacePoint` (test: stessa mappa dell'outline per 6 pose, identità al resize/qualità, nodi costanti in 6 stati × 2 trattamenti; il PRNG non viene rieseguito: nessuna modifica a `bubbleCandidates` né al seed, testato con `seed identico ⇒ posizioni identiche` tra trattamenti).

## 4. Non fatto, per scelta

- Nessuna deformazione ellittica delle bolle: vedi `motion-coupling.md` (≤ 0,9 px di effetto al picco di Candy, non giustificato).
- Nessuna modifica di `bubbleCount` né dei limiti 24/12/4.
- Il «contrasto del bordo» e l'«hairline di pelle» ipotizzati non sono stati aggiunti: i parametri esistenti hanno prodotto la differenza di bordo necessaria (Candy 0,0035 → 0,039).
