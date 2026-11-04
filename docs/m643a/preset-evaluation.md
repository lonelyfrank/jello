# M6.4.3.A — Valutazione dei quattro preset

> ## VISUAL REVIEW: NESSUNA DECISIONE UMANA REGISTRATA
> I giudizi qui sotto sono **dell'agente**: derivano da metriche, dalle immagini in `screenshots/` e dal comportamento osservato nel workspace. **Non sono un'approvazione visiva.** Tutti e quattro i preset sono `Pending` (`review-decisions.json`), `visuallyVerified` resta `false`, i built-in sono invariati. «Variante migliore secondo i dati» significa quella con più miglioramenti misurati, **non** quella esteticamente scelta.

Per i numeri: `comparison-matrix.md` (varianti e matrice 4×4), `motion-review.md`, `accessibility.md`, `performance.md`, e M6.4.3 (`docs/m643/preset-experiments.md`, `visual-review.md`). Immagini: `screenshots/<preset>_<A|B3>_<light|dark>_<xs|md>_<idle|pressed>_dpr<1|2>.png`, `timeline_*`, tutte in `screenshots/manifest.json` con SHA-256 (riprodotte due volte: 112 file, 0 pixel diversi tra le due esecuzioni).

## 1. Le dieci domande — risposte provvisorie

| # | Domanda | Risposta basata sulle prove | Fiducia |
|---|---|---|---|
| 1 | Soft appare realmente morbido? | Corpo lattiginoso, bordo poco aggressivo, nessun riflesso duro; cede 1,8–2,1 px e si assesta senza rimbalzo percettibile. Coerente con «morbido»; B3 è quasi indistinguibile da A da fermo | media |
| 2 | Clear traslucido senza duplicare Glass? | Traslucido e più leggibile in B3 (bordo, bolle ×2,1); la distinzione da Glass è **strutturale** (corpo gel senza lettura dello sfondo, nessuna rifrazione dichiarata), **non verificata fianco a fianco** | bassa |
| 3 | Candy gommoso e lucido senza sembrare plastica? | Lucido e gommoso; in B1/B3 il riflesso superiore è molto marcato e **il rischio «plastica verniciata» è visibile** (vedi §2.3): spetta al reviewer | bassa |
| 4 | Dense più denso e pesante degli altri? | Sì in B3: luminanza 0,49 contro 0,56 di Soft e 0,59 di A; bordo più consistente, riflessi attenuati, nessun rimbalzo | media-alta |
| 5 | Distinguibili con la stessa tinta? | Con B3 tutte le coppie superano ≥ 4 canali anche a 80×32; la più vicina nei pixel è Candy/Dense (raster 6,1), distinta però per riflesso, bordo e moto. In baseline A, Soft/Clear è quasi identica (anche nel movimento) | media |
| 6 | Differenze percepibili su componenti piccoli? | A 80×32 restano corpo, bordo e, un poco, il riflesso; le bolle sono 1–2 e non leggibili in nessuna variante | media |
| 7 | La pressione è coerente con l'identità? | Dai numeri sì (Dense smorzato senza rimbalzo, Candy il più elastico, Clear rapido); la **sensazione** non è misurata | media-bassa |
| 8 | Contenuti leggibili in tutti gli stati? | **Non del tutto**: Candy premuto su scuro e il disabilitato su scuro scendono sotto 4,5 (`accessibility.md` §1) | media |
| 9 | m643 dà benefici sufficienti rispetto al costo? | Costo: entro il rumore per frame a 1/12/24 superfici, +21 % per aggiornamento di documento, +3 nodi per superficie, +2,3 kB di bundle. Benefici: bordo di Candy ×11, corpo di Dense, bolle di Clear. Il bilancio è **favorevole in modo marginale**; dipende da quanto il reviewer apprezza le bolle e i riflessi | media |
| 10 | Quale combinazione candidare? | Dai dati: **B3 per Soft (marginale), Clear e Dense; B1 (= B3) per Candy**, con riserva sul riflesso di Candy. È una proposta all'attenzione del reviewer, non una scelta | bassa |

## 2. Per preset

### 2.1 Soft Skin (`jelly-soft`)
- **Stato:** Pending.
- **Variante migliore secondo i dati:** B3, di poco. Corpo invariato (luminanza 0,559), bordo +14 %, bolle volutamente più piccole (31 px contro 81), etichetta con margine migliore (P5 idle 5,42 contro 4,71 in M6.4.3).
- **Miglioramenti misurati:** pressione +16 %, assestamento 764 contro 587 ms; Soft ora si distingue meccanicamente da Clear.
- **Problemi residui:** il rimbalzo di B3 è **sub-pixel** (0,29 px a 44 px). Da fermo A e B3 si assomigliano molto: la differenza è nel movimento. A 80×32 le bolle sono quasi assenti (volutamente).
- **Rimbalzo vs assestamento:** l'assestamento attuale è più coerente con «morbido» di un rimbalzo marcato; per un rimbalzo percettibile servirebbe ζ ≈ 0,40, già vicino a Candy. **Non aumentare elasticità e overshoot senza evidenza.**
- **Modifiche suggerite:** nessuna per ora; se B3 non convince, A è un'ottima base.

### 2.2 Transparent Gel (`jelly-clear`)
- **Stato:** Pending.
- **Variante migliore secondo i dati:** B3. Contrasto del corpo sul chiaro 1,29 → 1,34, bolle da 48 a 102 px (×2,1), riposo 413 ms (distinto da Soft), e **migliora il contrasto dell'etichetta in stato premuto su scuro** (A 4,39–4,41 → B3 ≥ 4,5).
- **Problemi residui:** su fondo chiaro è ancora il corpo con meno contrasto (1,34). **Confronto con Glass: `NOT TESTED`** — il codice sperimentale non importa il runtime produttivo, quindi il workspace non può mostrarli insieme; va fatto a mano aprendo Glass «Frosted» nel Material Lab sugli stessi sfondi. La distinzione non può dipendere solo dal colore: Clear non dichiara rifrazione né legge lo sfondo.
- **Modifiche suggerite:** nessuna prima del confronto con Glass. Se risultasse troppo simile, l'unica leva senza nuove proprietà è accentuare le bolle e il bordo (già il senso di B3).

### 2.3 Glossy Gummy (`jelly-candy`)
- **Stato:** Pending.
- **Variante migliore secondo i dati:** B1 = B3 (il movimento è invariato). Bordo/centro 0,0035 → 0,039 (**×11, il miglioramento più netto di M6.4.3**), riflesso effettivo 0,24 → 0,65 e più stretto.
- **Problemi residui:**
  - **Rischio «plastica verniciata»**: a 160×44 su chiaro il riflesso superiore di B1/B3 è una barra bianca netta che attraversa il Button (`screenshots/candy_B3_light_md_idle_dpr1.png` contro `candy_A_…`). È il punto da giudicare a occhio, confrontando B1 con A.
  - **Contrasto dell'etichetta in stato premuto su sfondo scuro: P5 4,14–4,29 (B3), 4,08–4,20 (A)**: sotto 4,5, preesistente.
  - Bolle meno numerose in pixel (84 contro 134) ma più leggibili.
- **Modifiche suggerite (non applicate, da valutare):** se il riflesso risulta troppo duro, abbassare `highlightStrength` da 0,75 verso 0,55–0,60 (stessa descrizione, nessun nuovo campo); per il premuto, scurire meno la tinta dello stato premuto o usare un'etichetta più scura. Non aumentare il movimento.

### 2.4 Dense Gel (`jelly-dense`)
- **Stato:** Pending.
- **Variante migliore secondo i dati:** B3. Luminanza 0,590 → 0,494 (ora più pesante di Soft di 0,065), contrasto sul fondo 1,57 → 1,85, bordo +16 %, riflessi attenuati (0,16 contro 0,24), nessun rimbalzo.
- **Problemi residui:** il corpo più scuro riduce il contrasto sul fondo scuro (9,4 → 8,6, ancora ampio); risposta al 90 % in 190 ms (A: 146): più «pesante» ma meno pronto. A tinta uguale e a 80×32 in baseline è molto vicino a Candy; con B3 si distingue per bordo, riflesso e movimento.
- **Modifiche suggerite:** nessuna; se risultasse ancora troppo simile a Candy a tinta uguale, `highlightStrength` più bassa o `bodyOpacity` → 1 (`comparison-matrix.md` §3). Non trasformarlo in un materiale completamente solido.

## 3. Inclusioni (bolle) — fase F

Gli esperimenti X0–X5 di M6.4.3 (`docs/m643/visual-anatomy.md` §3) **non sono stati duplicati**: i loro dati bastano. Sintesi che serve alla decisione: il gradiente tinto da solo *riduce* la visibilità; la leva forte è parametrica (opacità e raggio); il trattamento m643 dà struttura (arco di luce, mezzaluna) e una protezione dell'etichetta continua; a 80×32 nessuna variante rende le bolle leggibili e non è stato forzato.

Quantità reale delle bolle (densità per 10 000 px² × area): a 80×32 (2 560 px²) Soft e Candy ne hanno 2, Clear e Dense 1; a 160×44 (7 040 px²) da 3 a 7 (densità della baseline A: Soft 5, Clear 3, Candy 7, Dense 4). Il conteggio **già scala con l'area**.

**Strategia di dettaglio adattivo proposta — NON implementata, resta sperimentale finché non approvata:** sotto una soglia di larghezza (da definire, ~100 px) usare solo la mezzaluna e il bordo della bolla (due indizi di profondità), tenere 1–2 bolle, dare priorità a testo e bordo; sopra la soglia il trattamento completo. Nessuna nuova proprietà persistita: sarebbe una regola del renderer sulle dimensioni misurate. Prima di implementarla serve la decisione del reviewer su quanto contano le bolle a 80×32.

## 4. Cosa questa fase non ha potuto fare

- Un giudizio estetico indipendente: nessun designer ha guardato; le risposte sopra sono un'ipotesi di lavoro.
- Confronto diretto con Glass (Clear).
- Test su display ad alta densità fisici e su telefoni.
- WebKit/Safari: `NOT RUN`.
