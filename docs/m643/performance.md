# M6.4.3 — Prestazioni e ciclo di vita delle risorse

Strumenti: `tools/perf.mjs` (A vs B3, stessi scenari, **RAF reale**, 5 ripetizioni alternate A/B per il moto, 3 per i cicli) → `perf-results.json`; `tools/studio-listeners.mjs` → `studio-listeners.json`. **A** = baseline (documento e trattamento M6.4.2), **B3** = candidato (ottica + movimento + trattamento `m643`).

**Ambiente e limiti.** Fedora 44, kernel 7.2.13, Intel Core i7-10510U (8 thread), **Chromium 156 headless**, server di sviluppo Vite (non minificato, non il bundle di produzione), viewport 1400×1100, DPR 1. Misurati: durata di `frame()` per superficie (wrapper attorno alla partecipazione del coordinatore), script/layout/stile da CDP `Performance.getMetrics`, contatori DOM e heap da CDP (con GC forzato), RAF del coordinatore, long task (`PerformanceObserver`). **Non misurati:** tempo GPU, paint/composite, hardware mobile, Firefox (solo Chromium ha CDP), memoria nello Studio con molte aree aperte. In headless gli intervalli fra frame sono vincolati dal vsync virtuale: i confronti A/B valgono su questa macchina.

## 1. Moto (pressione 450 ms → rilascio → assestamento), mediane su 5 ripetizioni

| Superfici | Costo per frame (somma `frame()`), A → B3 | Script ms (intera finestra), A → B3 | Layout / stile ms | RAF a riposo prima / dopo | Long task | Nodi SVG prima = durante = dopo |
|---|---|---|---|---|---|---|
| 1 | 0,210 → 0,220 ms | 19,5 → 20,5 | 4,6 → 4,5 / 10,5 → 10,4 | 0 / 0 | 0 | 77 → 80 |
| **12** | **1,253 → 1,320 ms (+5,3 %)** (intervallo A 1,23–1,42; B3 1,26–1,47) | 107,9 → 115,2 | 25,0 → 25,8 / 59,6 → 63,8 | 0 / 0 | 0 | 924 → 960 |
| 24 | 3,552 → 3,555 ms (+0,1 %) | 255,0 → 263,8 | 60,0 → 61,4 / 170,4 → 173,6 | 0 / 0 | 0 | 1848 → 1920 |

Letture:
- **0 RAF a riposo** in tutti i casi e in entrambe le varianti (300 ms prima e 300 ms dopo il moto); **nessun long task**.
- Il costo per frame del candidato è entro il rumore a 1 e 24 superfici e **+5 %** a 12 (le due distribuzioni si sovrappongono). Per superficie ≈ 0,10–0,15 ms/frame, in linea con ≈ 0,3 ms/frame complessivi di M6.4.2.
- **Nodi stabili durante il moto** (invariati fra prima/durante/dopo). Il trattamento `m643` ha **+1 nodo SVG per bolla** (circle + rim + crescent, invece di circle + ellipse) → +3 nodi per superficie nel campione, +72 a 24 superfici.
- Nessun aggiornamento React per frame: il renderer non usa React; il percorso per frame (`renderMotion`) aggiorna attributi esistenti, la modifica aggiunge solo un parametro alla funzione pura `projectBubble`.

## 2. Cambi ripetuti (12 superfici × 200 giri = 2 400 aggiornamenti per scenario, mediane di 3)

| Scenario | A µs/aggiornamento | B3 µs/aggiornamento | Nodi A (inizio / max / fine) | Nodi B3 |
|---|---|---|---|---|
| Cambio rapido di preset (4 documenti ciclici) | 166 | **207** (+25 %) | 852 / 852 / 843 | 912 / 912 / 900 |
| Cambio di qualità (low/medium/high, densità 12) | 195 | 231 (+18 %) | 852 / 912 / 912 | 912 / 992 / 992 |
| Resize (larghezza variabile) | 302 | 337 (+12 %) | 852 / 873 / 864 | 912 / 940 / 928 |

Decisione documentata: il candidato costa **~ 35–40 µs in più per aggiornamento di documento** (non per frame): generazione delle stringhe d'arco e attributi di tre nodi per bolla. È un costo da *editing* (cambio preset/qualità/dimensioni), ordine di grandezza di 0,04 ms: accettato. I nodi sono limitati dai cap 24/12/4 (il picco con `high` è il tetto, non una crescita) e **non crescono nel tempo** (fine ≈ inizio). Nessun salto di identità al cambio qualità (E2E: i primi 4/12 indici e le loro posizioni coincidono fra low/medium/high).

## 3. Ciclo di vita: mount/unmount ripetuti

3 sessioni × 5 batch × 60 (mount di 4 superfici, pressione, destroy) con GC forzato e due rAF prima di ogni lettura:

| | nodi DOM per batch | listener JS per batch | heap (MB) dopo i batch |
|---|---|---|---|
| A | 20 · 20 · 20 · 20 · 20 (×3 sessioni) | 18 costanti | 4,67 → 4,80 (prima sessione), poi 4,78–4,80 |
| B3 | 20 · 20 · 20 · 20 · 20 (×3 sessioni) | 18 costanti | 4,76 → 4,80 |

(Un primo campione isolato di A mostrava 268 nodi nell'ultimo batch; non si è ripetuto in 3 sessioni × 5 batch con due rAF di attesa prima della lettura: ipotesi, non verificata: nodi staccati non ancora raccolti nella lettura immediata. Non lo considero un leak perché non si è ripetuto, ma neppure lo spiego con certezza.)

**Nessuna crescita** di nodi o listener su 900 mount/unmount per variante; l'heap varia di ≤ 0,13 MB ed è identico fra le due varianti a regime.

## 4. Diagnosi dei punti aperti di M6.4.2 (§13.3)

Gli ultimi due punti di `docs/m642/performance.md` §4 («+12 listener per fase di moto», «heap +2 MB su 252 cambi d'area») sono stati indagati con misure mirate.

**(a) Renderer isolato — listener, per fase** (`add/removeEventListener` strumentati; `perf.mjs`, `listener_attribution_one_motion`):

| Fase | Aggiunti | Rimossi |
|---|---|---|
| Attach | `MediaQueryList:change` ×3 (moto ridotto, trasparenza ridotta, forced colors), `document:visibilitychange` ×1 | — |
| **Moto completo (pressione 450 ms → rilascio → riposo)** | **0** | **0** |
| Destroy | — | gli stessi 4 |

Sono listener **persistenti intenzionali** (alle preferenze di sistema e alla visibilità), rilasciati tutti da `destroy()`; non ce ne sono di temporanei né di non liberati. Identico per A e B3.

**(b) Studio — pressione/rilascio sul Button del Jello Lab** (`studio-listeners.mjs`, build di produzione, GC forzato prima di ogni lettura, `add/removeEventListener` strumentati con file chiamante): fase *hold* 3 s: **0 aggiunti, 0 rimossi, delta listener 0** (505 → 505, nodi 3 007 → 3 007); fase *release*: idem; secondo ciclo: idem.

**Conclusione e confini.** Il «+12 listener per fase» di M6.4.2 **non si riproduce** né nel renderer né nello Studio con GC forzato e ganci sugli eventi: nel moto non nasce alcun listener. L'ipotesi più coerente è un artefatto di lettura (contatori letti senza GC forzato, quindi con listener di oggetti già irraggiungibili ma non ancora raccolti), **ma questa è un'inferenza**: non ho rieseguito il protocollo originale di M6.4.2 per confermarla né provato che la lettura di allora non forzasse il GC. Stato: **non riprodotto, non attribuito con certezza** (non «provato non-leak»). Il «+2 MB su 252 cambi d'area» riguarda la navigazione fra aree dello Studio, non il renderer: nel renderer isolato 900 mount/unmount lasciano l'heap entro 0,13 MB; la crescita a livello Studio **resta non diagnosticata** (cache legittime e allocazioni React non sono distinguibili con queste misure).

## 5. Bundle

| Artefatto | M6.4.2 | Ora | Δ |
|---|---|---|---|
| `dist-jelly/jello-jelly-experimental.js` | 87,0 kB raw / 24,6 gzip | 89,3 kB / 24,8 gzip | **+2,3 kB / +0,2 gzip** |
| `dist-lib/jello.js` (runtime **produttivo** Glass/Solid) | 202,2 kB / 54,7 gzip | 202,2 kB / 54,0 gzip (ricalcolato con `gzip -9`) | **0** raw: il confine è intatto |
| `dist/assets/lab-*.js` (Studio) | 628,9 kB | 628,9 kB | 0 |

## 6. Criteri di §13.2

- Nessun RAF persistente a riposo: **soddisfatto** (0 in 30 finestre di 300 ms per variante).
- Nessuna crescita incontrollata dei listener dopo cleanup: **soddisfatto** (costanti, 4 aggiunti e 4 rimossi per superficie).
- Nessuna crescita continua dei nodi SVG: **soddisfatto**.
- Nessuna allocazione per frame evitabile: nessuna aggiunta nel percorso per frame; la funzione pura `projectBubble` non alloca oltre al valore di ritorno già esistente.
- Nessun aggiornamento React per frame introdotto: **soddisfatto**.
- Costo per frame «non peggiorato in misura significativa»: **+5 % a 12 superfici, entro il rumore a 1 e 24**; costo di aggiornamento documento +12/+25 % (≈ 35–40 µs), motivato e accettato (§2).

## 7. Non misurato

Telefono o hardware reale, GPU/paint, Firefox per CDP, bundle di produzione servito (si è misurato su dev server), Glass+Jello insieme, memoria con molte aree aperte nello Studio.
