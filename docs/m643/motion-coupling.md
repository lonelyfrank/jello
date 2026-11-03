# M6.4.3 — Fase D: accoppiamento elastico dei riflessi

**Esito: nessuna modifica di codice. L'accoppiamento richiesto da §9 esiste già nel renderer ed è stato misurato; l'unico miglioramento residuo (deformare le bolle) vale ≤ 0,9 px al picco di Candy e non è stato implementato.** La fase prevedeva di implementare solo se gli esperimenti dimostravano un vantaggio sufficiente: non lo hanno fatto.

## 1. Cosa fa già il renderer (verificato nel codice)

`renderMotion()` (`src/runtime/experimental/jelly.ts`) è l'unico percorso per frame. Tutto passa da `jellyGeometry()` / `surfacePoint()`, cioè dalla stessa mappa del contorno:

| Elemento | Come segue la deformazione |
|---|---|
| clip, corpo, core, veil, pool, rim, ombra | `d` = `g.path`, contorno deformato (12 segmenti per lato, punti di controllo mappati) |
| riflesso lucido (`glossPath`) | ogni punto di controllo passa da `surfacePoint` |
| riflesso stretto (`gleam`), caustica | idem |
| riflesso morbido (`highlight`, ellisse) | **centro** da `surfacePoint`; semiasse verticale × la scala locale `dy` della mappa; orizzontale × `(1 + pose·0,1)` |
| bolle | centro da `surfacePoint` (`projectBubble`), identità e raggio invariati |

Vincoli di §9.4: un solo oscillatore, un solo RAF condiviso (`jelly-scheduler.ts`), nessuna animazione CSS, nessun aggiornamento React per frame, nessun nodo creato per frame (`renderMotion` aggiorna solo attributi), hitbox e contenuto invariati. Stati di §9.3 verificati a livello DOM: i nodi restano costanti in idle/press/hold/release/rebound/rest (E2E `jelly-m643.spec.ts`), e **rest ripristina la geometria esatta** (`d` di rest = `d` di idle, entrambi i trattamenti; anche con `prefers-reduced-motion`, dove press/hold/rest restituiscono la geometria statica identica).

## 2. Misura del residuo (`tools/coupling-analysis.mjs`, `coupling-analysis.json`)

Differenza fra l'ellisse disegnata e l'esatta immagine, attraverso la mappa, del riquadro del riflesso a riposo; in px CSS, per tre dimensioni, pose 0,0417 / 0,0733 (picco Candy) / 0,15 (limite) / −0,0155 (rebound Candy) / −0,0067, due punti di contatto.

| | peggiore a pose ≤ 0,0733 | peggiore in assoluto (pose 0,15) |
|---|---|---|
| errore semiasse orizzontale dell'ellisse | **0,22 px** (160×44) · 0,37 (320×96) | 0,76 px (320×96) |
| errore semiasse verticale | **0** (la mappa è affine in y) | 0 |
| rest = identità | sì (`surfacePoint` restituisce il punto) | — |

## 3. Il miglioramento ipotizzato e perché non è stato fatto

Le bolle restano cerchi mentre la superficie locale si comprime: applicando lo Jacobiano locale di `surfacePoint` (scala `1 + 0,7·pose·lato_corto/larghezza·sin(πy/h)` in x, `1 − compressione` in y) un cerchio di raggio 6 px (il massimo) si deformerebbe di **0,50 px** alla pressione standard (pose 0,0417), **0,88 px** al picco di Candy (0,0733: −14,7 %), 0,19 px al rebound; 1,8 px solo al limite estremo 0,15. Per le bolle tipiche (raggio 2–3 px) l'effetto è < 0,5 px: non percepibile a DPR 1 e invisibile a 80×32. Costo: un `scale()` per bolla per frame (stringa di trasformazione più lunga), più un test. Il rapporto non lo giustifica; è registrato qui come proposta eventuale per M6.5 se un designer lo chiede.

## 4. Reduced motion

`prefers-reduced-motion` forza il profilo statico: `canMove = false`, pose 0, nessuna animazione decorativa indipendente (non ne esiste alcuna: i riflessi non hanno animazioni proprie). E2E: `jelly-m643.spec.ts › reduced motion` (Chromium e Firefox): stato `motion: 'static'`, geometria di hold e rest identica a idle, stesso numero di nodi.
