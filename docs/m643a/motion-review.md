# M6.4.3.A — Risposta elastica

> Misure dell'oscillatore del modello (la stessa funzione pura che la superficie esegue) e letture dalle superfici reali nel workspace. Non dicono come il movimento **si sente**: quello lo giudica chi guarda (Play/Step/cursore nella modalità «Movimento»). Nessun valore è stato cambiato.

## 1. Valori per variante (scenario: pressione a 0 ms, tenuta 600 ms, rilascio, osservazione 3 s; griglia 1 ms)

I px sono calcolati sul lato corto di un Button 160×44 (44 px). B1 ha il movimento di A; B3 quello di B2 (`docs/m643/motion-metrics.json`, confermati dal test `m643a-review.test.ts` contro `motionMetrics()`).

| Preset | Var. | tempo / ζ / deform. max / impulso | Picco press | 90 % a | Swing di rilascio | Swing a | Riposo |
|---|---|---|---|---|---|---|---|
| Soft | A (= B1) | 360 / 0,65 / 0,06 / 0,15 | 0,0417 (1,83 px) | 143 ms | 0,0027 (**0,12 px**) | 222 ms | 587 ms |
| Soft | B2 (= B3) | 380 / 0,52 / 0,065 / 0,22 | 0,0485 (2,13 px) | 132 ms | 0,0067 (**0,29 px**) | 199 ms | 764 ms |
| Clear | A (= B1) | 360 / 0,65 / 0,06 / 0,15 | 0,0417 (1,83 px) | 143 ms | 0,0027 (0,12 px) | 222 ms | 587 ms |
| Clear | B2 (= B3) | 320 / 0,70 / 0,055 / 0,12 | 0,0374 (1,65 px) | 134 ms | 0,0017 (0,07 px) | 213 ms | **413 ms** |
| Candy | A = B1 = B2 = B3 | 360 / 0,40 / 0,09 / 0,15 | 0,0733 (3,23 px) | 112 ms | 0,0155 (0,68 px) | 182 ms | 927 ms |
| Dense | A (= B1) | 220 / 1,05 / 0,035 / 0,05 | 0,0227 (1,00 px) | 146 ms | 0 | — | 330 ms |
| Dense | B2 (= B3) | 270 / 1,10 / 0,04 / 0,04 | 0,026 (1,14 px) | **190 ms** | 0 | — | 433 ms |

## 2. Lettura dalle superfici reali (test E2E, Chromium e Firefox)

Con la timeline del workspace (orologio manuale, renderer reale) lo spostamento `x` letto dalla superficie coincide con il modello:

- **Soft, tenuta a 600 ms:** A `x = 0,039`, B2 `x = 0,0423` (stato di regime della pressione, sotto il picco di 0,0417/0,0485 che si tocca prima dell'assestamento).
- **Rimbalzo:** A e B3 vanno dal lato opposto (`x < 0`), B3 più di A (swing 0,0067 contro 0,0027); **Dense non ha rimbalzo** (`x ≥ 0`); **Candy rimbalza più di Soft**.
- **Riposo:** dopo la fase «Rest» `|x| < 1e-4` e il `ManualClock` non ha callback in attesa: le superfici sono ferme.
- **Cursore:** tornare a un istante già visitato dà **lo stesso fotogramma** (stesso `x`, stesso tracciato SVG).
- **Movimento ridotto**, simulato o di sistema: `x = 0` in tutte le superfici.

## 3. Valutazione per preset (giudizio dell'agente sui dati, non una decisione)

| Preset | Coerenza con l'identità | Cosa mostrano i dati |
|---|---|---|
| **Soft** | «pressione cedevole, recupero morbido» | B2/B3 cedono un po' di più (+16 %, 2,1 px) e si assestano più lentamente (764 contro 587 ms). Il rimbalzo oltre il riposo è **0,29 px: sotto la soglia di percezione a 44 px**; resta un assestamento, non un rimbalzo. Per ottenere un rimbalzo percepibile servirebbe ζ ≈ 0,40 (0,51 px, riposo 956 ms, già vicino a Candy: sensibilità calcolata in M6.4.3). **Raccomandazione: non aumentare elasticità e overshoot**; l'assestamento più lungo di B2 è il cambiamento che si sente, e va giudicato a occhio. |
| **Clear** | «relativamente rapido e controllato» | B2 è il più rapido a riposo (413 ms contro 764 di Soft in B2) e cede meno: è la differenza **meccanica** che separa Clear da Soft (in A i due sono identici). Percettibilità non provata. |
| **Candy** | «gommoso-elastico, ritorno leggibile» | Invariato per decisione: 3,2 px di compressione, 0,68 px di rimbalzo, 927 ms. Non c'è evidenza per aumentarlo; anche qui l'elasticità percepita viene da compressione e durata, non dall'oltrepassamento. |
| **Dense** | «risposta più smorzata, nessun rimbalzo» | B2 mantiene ζ > 1 (nessun rimbalzo) ma risponde più lentamente (90 % a 190 contro 146 ms) e si assesta in 433 ms: più «pesante» ma meno pronto. Da valutare se la maggiore inerzia è voluta o se pesa sulla reattività percepita. |

## 4. Cosa non è misurato

- La **sensazione** del movimento (giudizio visivo e tattile): nessun osservatore indipendente.
- Frequenza di aggiornamento reale su telefoni e display ad alta frequenza.
- Più superfici in movimento sul percorso di rilascio con input reale su touch (solo mouse e tastiera).
- Il rimbalzo relativo a Button di altre altezze: i px scalano con il lato corto (a 96 px Soft B3 oscilla di 0,64 px, ancora sotto il pixel intero).

## 5. Riproduzione

Workspace → «Movimento» → scegli il preset → Play, oppure fasi (Hold, Release, Rebound, Rest) e cursore; la misura `x` e il picco osservato sono sotto ogni cella (Avanzata aggiunge la tabella del modello). Immagini del rilascio per tutti i preset: `docs/m643a/screenshots/timeline_<preset>_light_md_t<ms>_dpr1.png` (0, 70, 140, 300, 600, 700, 880, 1200 ms), elencate in `screenshots/manifest.json`.
