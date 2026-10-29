# Modello del materiale Jello

Parametri e modello ottico sono di Jello. Non riproducono lo shader di Apple e non
ne usano i nomi o i valori: descrivono una lente geometrica deterministica,
calcolata in pixel CSS, e un materiale (blur, tinta, luce, ombra) separato da essa.

La fonte di verità è [`src/core/params.ts`](../src/core/params.ts); questa tabella ne è
generata e un test verifica che ogni chiave sia documentata qui.

## Modello ottico

Per ogni punto `P` della lente, relativo al centro, la sorgente viene campionata in

```
P' = P + refraction · v(P)
```

- `sd(P)` è la distanza con segno dal rettangolo arrotondato (negativa all'interno).
- `depth = −sd` è la profondità dal bordo. Dentro la fascia (`depth < band`):
  `t = 1 − depth / band` (1 sul bordo, 0 alla fine della fascia) e
  `v = profile(t) · n(P)`, dove `n` è la normale uscente.
- Oltre la fascia `v = 0`: **il centro è neutro**, salvo `dome > 0`, che aggiunge
  `−dome · (x / hw, y / hh) · clamp(depth / band, 0, 1)` (ingrandimento verso il centro,
  nullo sul bordo).
- Profili: `circle` = `1 − √(1 − t²)` (bordo convesso, transizione piatta verso il centro),
  `smooth` = `t²(3 − 2t)`, `linear` = `t`, `bump` = `sin²(πt)` (massimo a metà fascia,
  lo stesso andamento usato da BT).
- La normale è calcolata su un rettangolo con raggio `max(radius, 1,25 · band)` (limitato a
  metà del lato corto): evita la piega lungo la diagonale degli angoli quando la fascia è
  più ampia del raggio. Il contorno usa il raggio reale.
- `v` è normalizzato in [−1, 1] e codificato a 8 bit: `R = 128 + 127·vx`, `G = 128 + 127·vy`,
  `B` = copertura della forma (anti-aliasing di 1 pixel della mappa), `A = 255` sempre.
  Il neutro 128 introduce uno scarto di `refraction · 0,002` px, trascurabile.
- `refraction` non è nella mappa: cambiarla aggiorna un attributo, non rigenera nulla.
  Positivo = il bordo campiona verso l'esterno (il contenuto oltre il bordo entra
  compresso nella fascia); negativo = verso l'interno (il bordo ingrandisce).

Stadi (`affects`): `map` rigenera la mappa (con cache per chiave geometrica), `filter`
cambia attributi del filtro SVG, `surface` cambia variabili CSS dello strato materiale,
`motion` è letto solo dal ciclo di animazione. Posizione e scala temporanea della lente
non fanno mai parte della chiave della mappa.

## Parametri

### Forma

| Chiave | Nome | Unità | Intervallo | Iniziale | Stadio | Descrizione |
|---|---|---|---|---|---|---|
| `shape` | Forma | — | capsule / rounded | capsule | map | capsule: raggio = metà del lato corto; rounded: usa il raggio indicato. |
| `width` | Larghezza | px | 80 – 480 (passo 1) | 280 | map | Larghezza della capsula trascinabile in pixel CSS. |
| `height` | Altezza | px | 40 – 240 (passo 1) | 104 | map | Altezza della capsula trascinabile in pixel CSS. |
| `radius` | Raggio | px | 0 – 120 (passo 1) | 32 | map | Raggio degli angoli per la forma rounded (limitato a metà del lato corto). |

### Ottica

| Chiave | Nome | Unità | Intervallo | Iniziale | Stadio | Descrizione |
|---|---|---|---|---|---|---|
| `band` | Fascia curva | px | 2 – 80 (passo 1) | 26 | map | Ampiezza della fascia perimetrale in cui la superficie è curva e devia la luce. |
| `refraction` | Rifrazione | px | -40 – 80 (passo 0.5) | 22 | filter | Spostamento massimo del campionamento sul bordo. Positivo: il bordo mostra contenuto esterno compresso; negativo: lo ingrandisce. |
| `profile` | Profilo | — | circle / smooth / linear / bump | circle | map | Andamento della deviazione nella fascia: circle (bordo convesso), smooth, linear, bump (sin², massimo a metà fascia). |
| `dome` | Lente centrale | — | 0 – 1 (passo 0.01) | 0 | map | Ingrandimento verso il centro. 0 = centro neutro. |
| `chroma` | Aberrazione cromatica | — | 0 – 1 (passo 0.01) | 0 | filter | Separazione dei canali RGB nella fascia. Opzionale, disattivata nel preset iniziale. |

### Materiale

| Chiave | Nome | Unità | Intervallo | Iniziale | Stadio | Descrizione |
|---|---|---|---|---|---|---|
| `blur` | Blur | px | 0 – 40 (passo 0.5) | 2 | filter | Deviazione standard della sfocatura del contenuto sotto la lente. |
| `saturation` | Saturazione | % | 0 – 300 (passo 1) | 130 | filter | Saturazione del contenuto sotto la lente (100 = invariata). |
| `tint` | Tinta | — | #rrggbb | #ffffff | surface | Colore della tinta sovrapposta al materiale. |
| `tintOpacity` | Opacità tinta | — | 0 – 1 (passo 0.01) | 0.08 | surface | Opacità della tinta (0 = vetro chiaro). |

### Luce

| Chiave | Nome | Unità | Intervallo | Iniziale | Stadio | Descrizione |
|---|---|---|---|---|---|---|
| `light` | Luce | — | 0 – 1 (passo 0.01) | 0.55 | surface | Intensità del riflesso sul perimetro. |
| `lightAngle` | Direzione luce | ° | 0 – 360 (passo 1) | 315 | surface | Direzione da cui arriva la luce: 0 = alto, in senso orario. |

### Ombra

| Chiave | Nome | Unità | Intervallo | Iniziale | Stadio | Descrizione |
|---|---|---|---|---|---|---|
| `shadow` | Ombra | — | 0 – 1 (passo 0.01) | 0.22 | surface | Opacità dell’ombra esterna. |
| `shadowBlur` | Sfocatura ombra | px | 0 – 80 (passo 1) | 28 | surface | Raggio di sfocatura dell’ombra. |
| `shadowOffset` | Distanza ombra | px | 0 – 40 (passo 1) | 10 | surface | Spostamento verticale dell’ombra. |

### Movimento

| Chiave | Nome | Unità | Intervallo | Iniziale | Stadio | Descrizione |
|---|---|---|---|---|---|---|
| `stiffness` | Rigidità | 1/s² | 40 – 1200 (passo 10) | 420 | motion | Rigidità della molla che insegue il puntatore. |
| `damping` | Smorzamento | ζ | 0.1 – 1.5 (passo 0.01) | 0.68 | motion | Rapporto di smorzamento (1 = critico, <1 = rimbalzo). |
| `stretch` | Elasticità | — | 0 – 0.4 (passo 0.01) | 0.12 | motion | Deformazione massima dovuta alla velocità di trascinamento. |
| `pressScale` | Scala alla pressione | × | 1 – 1.15 (passo 0.005) | 1.05 | motion | Ingrandimento della superficie durante la pressione (il foreground non scala). |
| `pressRefraction` | Rifrazione alla pressione | — | 0 – 1 (passo 0.01) | 0.3 | motion | Rifrazione aggiunta durante la pressione, come frazione del valore base. |
| `pressLight` | Luce alla pressione | — | 0 – 1 (passo 0.01) | 0.35 | motion | Luce locale aggiunta nel punto di contatto. |

## Note sui parametri

- **Forma della capsula trascinabile.** `width`, `height`, `shape` e `radius` valgono per la
  capsula libera. Pulsante, selettore e cursore dello slider prendono dimensioni dal proprio
  layout e sono sempre capsule; ereditano ottica, materiale, luce, ombra e movimento.
- **Blur e saturazione** sono applicati dentro il filtro nel percorso rifrangente (prima
  della deviazione) e con `backdrop-filter` nel percorso satinato. In entrambi i casi
  `blur` è una deviazione standard in px CSS.
- **Luce.** `lightAngle` indica la direzione da cui arriva la luce (0° = alto, senso orario).
  Produce un anello sottile più chiaro sul lato illuminato, un riflesso debole sul lato
  opposto e un filo interno spostato verso la luce. È solo luce: con `light = 0` sparisce.
- **Pressione.** Durante la pressione la superficie scala fino a `pressScale`, la rifrazione
  cresce di `pressRefraction × refraction` e compare una luce locale `pressLight` nel punto
  di contatto. La mappa viene stirata, non rigenerata. Il foreground non scala.
- **Elasticità.** `stretch` deforma la superficie in base alla velocità (fino a ±stretch
  lungo la direzione del moto). Con movimento ridotto è disattivata, la molla salta al
  bersaglio e la pressione cambia solo la luce.
- **Aberrazione cromatica** (`chroma > 0`) sostituisce un solo `feDisplacementMap` con tre
  passaggi a scale `1 ± 0,12·chroma`, uno per canale. Triplica il costo della lente; è a 0
  nel preset iniziale.
