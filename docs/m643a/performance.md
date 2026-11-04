# M6.4.3.A — Prestazioni

> Server di sviluppo Vite (non minificato), Chromium 156 headless, una CPU da laptop (Intel i7-10510U), 2026-11-04. Nessuna misura di GPU/paint, nessun telefono, nessun Firefox. Cinque ripetizioni, mediana con minimo e massimo nei JSON. **Il costo del renderer e il costo dell'interfaccia di revisione sono misurati separatamente.**

Dati: `perf-results.json` (renderer, rieseguendo `docs/m643/tools/perf.mjs`, A contro B3) e `review-perf-results.json` (workspace, `docs/m643a/tools/review-perf.mjs`). Riferimento M6.4.3: `docs/m643/performance.md`.

## 1. Costo del renderer, A (m642) contro B3 (m643)

Movimento con RAF reale, stesse condizioni per le due varianti (Candy, 160×44).

| Superfici | Tempo totale per frame (ms) A → B3 | Script per scenario (ms) A → B3 | Nodi A → B3 | RAF a riposo | Long task |
|---|---|---|---|---|---|
| 1 | 0,211 → 0,198 | 20,6 → 18,6 | 77 → 80 | 0 | 0 |
| 12 | 1,298 → 1,299 | 113,2 → 113,9 | 924 → 960 | 0 | 0 |
| 24 | 3,639 → 3,704 | 243,6 → 260,5 | 1 848 → 1 920 | 0 | 0 |

Con 1, 12 e 24 superfici B3 è **entro il rumore** sul tempo per frame (min–max sovrapposti); sale lo script a 24 (+7 %) e i nodi (+4 % in media, +3 nodi per superficie: arco e mezzaluna delle bolle). **Non ho misurato 4 superfici nel solo renderer** (la scala 1/12/24 è quella dello strumento M6.4.3); il caso a 4 è nel §2, con interfaccia compresa.

Costo di aggiornamento del documento (12 superfici, 2 400 aggiornamenti):

| Aggiornamento | A (µs) | B3 (µs) | Δ |
|---|---|---|---|
| parametro (preset) | 185,4 | 224,3 | +21 % |
| qualità | 174,2 | 201,5 | +16 % |
| ridimensionamento | 324,9 | 349,8 | +8 % |

B3 costa di più *per aggiornamento* (più nodi da riscrivere), ma anche il caso peggiore resta sotto 0,4 ms per aggiornamento. Nel workspace il cambio di variante **monta una nuova superficie** per la cella sostituita (la cella è identificata da preset e variante) e distrugge la vecchia; la pulizia è quella misurata nel §2 (nodi e listener costanti su 300 cambi). Cambiare dimensione, sfondo o contenuto **non** ricrea la superficie (la dimensione passa dal `ResizeObserver` del renderer); la tinta normalizzata la aggiorna con `update()`.

**Listener e ciclo di vita (renderer):** attach aggiunge 4 listener (3 `MediaQueryList:change`, 1 `visibilitychange`), il movimento 0, destroy li rimuove tutti: identico per A e B3. 900 mount/unmount per variante: nodi e listener costanti, heap piatto (4,78 → 4,81 MB).

## 2. Costo del workspace di revisione (interfaccia + renderer)

**Quattro superfici**, asse «Preset», pressione 600 ms e rilascio con input sincronizzato, finestra di 1,8 s; tempo CPU del thread principale (CDP `Performance.getMetrics`):

| | Script (ms) | Layout (ms) | Style (ms) | Task totali (ms) |
|---|---|---|---|---|
| A | 53,6 (50,4–66,4) | 11,1 (10,3–12,6) | 29,4 (27,3–32,0) | 279,6 (263,0–299,9) |
| B3 | 59,4 (56,7–60,4) | 10,8 (10,5–12,2) | 28,2 (26,8–31,8) | 284,1 (259,9–285,1) |

I due intervalli si sovrappongono: **nessuna differenza dimostrabile** tra A e B3 a quattro superfici (la mediana dello script di B3 è +11 %, dentro il rumore). I task totali includono il lavoro del browser e dell'interfaccia, non solo del renderer.

**Costo di un'azione dell'interfaccia** (CPU del thread principale in due frame dopo il click; include commit di React, `bridge.update`, style/layout):

| Azione | n | Mediana (ms) | p95 (ms) |
|---|---|---|---|
| cambio variante | 60 | 34,1 | 43,6 |
| cambio preset | 20 | 45,6 | 56,9 |
| cambio dimensione | 20 | 23,1 | 48,1 |
| cambio modalità | 12 | 21,9 | 40,4 |

Sono costi di una build di sviluppo; il dato utile è che **sono dell'ordine di una o due frame e non crescono** con le ripetizioni (vedi sotto). Il tempo *dentro* il dispatch del click è ≈ 0,2 ms (React rimanda il commit): il costo reale è quello della finestra.

**Fuga e pulizia** (CDP dopo GC forzato):

| Momento | Nodi DOM | Listener JS | Heap (MB) |
|---|---|---|---|
| Solo Jello Lab | 3 015 | 509 | 18,6 |
| Review aperta (Soft, side by side) | 4 184 | 652 | 20,2 |
| prima di 300 cambi A↔B3 | 4 193 | 652 | 21,2 |
| dopo 300 cambi A↔B3 | **4 193** | **652** | 21,4 |
| dopo «Torna al Lab» | 3 031 | **509** | 20,6 |

Nessuna crescita di nodi o listener con 300 cambi; al ritorno i **listener tornano esattamente a 509**. Restano **16 nodi** in più rispetto al Lab da solo e circa 2 MB di heap in più (le cose caricate la prima volta, un `Blob` di stile, ecc.): **non attribuiti con certezza**, non dichiarati «non-leak». Il test E2E verifica inoltre che il numero di nodi del renderer sia costante per variante su 48 cambi, che a riposo ci siano **0 RAF in un secondo**, che dopo «Torna al Lab» non resti alcun elemento della Review e che `window.__jelloReview` sia rimosso.

## 3. Cose richieste dal brief e dove stanno

| Richiesta | Esito |
|---|---|
| Nessun RAF continuo a riposo | **verificato** (0 RAF/s nel workspace; 0 frame inattivi nello strumento del renderer) |
| Nessun loop React per frame | **per costruzione**: il tempo, il cursore e le letture `x`/picco della timeline sono scritti con ref sul DOM dal `TimelineController`; il Play usa un RAF proprio dell'interfaccia solo mentre è attivo. **Non misurato** con il profiler di React: nessuna prova numerica |
| Superfici senza stato mutabile condiviso | verificato dai test: documenti clonati per cella, `sameAs` calcolato sulle copie; il coordinatore è condiviso di proposito (un solo RAF) |
| Nessun listener dopo destroy | verificato (509 → 509) |
| Osservatori rilasciati | il renderer li disconnette in `destroy()` (test M6.4.3); il workspace disconnette il suo `IntersectionObserver` all'unmount; non ho un contatore diretto degli osservatori |
| Costo del cambio variante / dimensione | §2 |
| Memoria | misurabile solo come heap grossolano: nessuna diagnosi fine |

## 4. Limiti

Build di sviluppo; un solo motore e una sola macchina; niente GPU/paint; heap a livello Studio non diagnosticato (stesso limite di M6.4.3); il costo del workspace dipende dal numero di superfici montate (fino a 4 + 4 miniature).
