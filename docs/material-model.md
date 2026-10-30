# Modello del materiale Jello

Parametri e modello ottico sono di Jello. Non riproducono lo shader di Apple e non
ne usano i nomi o i valori: descrivono una lente geometrica deterministica,
calcolata in pixel CSS, e un materiale (blur, tinta, luce, ombra) separato da essa.

La fonte di verità dei parametri è [`src/core/params.ts`](../src/core/params.ts); le tabelle sotto ne
sono generate e un test verifica che ogni chiave sia documentata qui.

## Documento `jello-material` (schema 2)

Dalla versione 0.2.0 del runtime un materiale è un documento versionato
([`src/model/document.ts`](../src/model/document.ts)) che separa:

| Sezione | Contenuto | Origine |
| --- | --- | --- |
| `material` | proprietà visive della famiglia (per Glass: ottica, tinta, luce, ombra) | parametri dei gruppi optics, material, light, shadow |
| `geometry` | forma, dimensioni, raggio (la maschera deriva da questi) | gruppo shape |
| `behavior` | molla, elasticità, pressione | gruppo motion |
| `quality` | `profile` (economy, balanced, quality), `dprCap`, `internalScale`, `adaptive` | [`src/model/quality.ts`](../src/model/quality.ts) |
| `source` | `{ kind: 'dom' }` oppure `{ kind: 'texture', texture: pattern \| image \| external }` | — |
| `target` | `backend` richiesto (`auto`, `css`, `svg`, `webgl2`) e `fallback` finale (`css`, `opaque`) | — |
| intestazione | `format`, `schemaVersion`, `id`, `name`, `family`, `familyVersion`, `runtime.min` | — |

La sezione di ogni parametro è derivata dal suo gruppo nella tabella: valori iniziali, intervalli,
unità, descrizioni, validazione e `affects` hanno **una sola fonte**. Zod valida l’involucro; i
valori dei parametri passano da `checkValue` della tabella. Un documento è accettato per intero
o rifiutato con tutti i motivi (import atomico): valori mancanti prendono il valore iniziale e
sono segnalati, chiavi sconosciute sono ignorate e segnalate, versioni più recenti (schema,
famiglia, `runtime.min`) sono rifiutate con un messaggio che nomina entrambe le versioni.

**Famiglie.** `glass` e `solid` sono disponibili (Solid: [Material Core](material-core.md); il
documento Solid non ha `quality`, `source` né `target`). `jelly` è registrata come *in sviluppo*: il
parser la rifiuta («non è ancora disponibile») e il laboratorio la mostra disattivata. Una famiglia
futura avrà la propria sezione `material`, senza ereditare l’ottica del vetro.

**Migrazione da `jello-glass` v1.** I file v1 (`{ format, version: 1, params }`) sono migrati
senza perdere parametri (24 su 24, verificato su tutti i preset e su un file personalizzato in
`tests/unit/model.test.ts`). L’id è derivato dal contenuto. L’export inverso (v2 → v1) restituisce
gli stessi parametri ed elenca i campi non rappresentabili (id, nome, qualità non predefinita,
sorgente, destinazione, note).

**Profili qualità** (valori espliciti):

| | Economy | Balanced (predefinito) | Quality |
| --- | --- | --- | --- |
| DPR massimo (WebGL2) | 1 | 1,5 | 2 |
| Risoluzione interna WebGL2 | 50 % | 75 % | 100 % |
| Mappa (px per px CSS, SVG e WebGL2) | 0,5 | 1 | 1 |
| Campioni blur per passata | 5 | 9 | 13 |
| Budget sorgenti dinamiche | 30 fps | 60 fps | 60 fps |
| Aberrazione cromatica | spenta | consentita | consentita |
| Cache mappe | 8 | 32 | 48 |

Balanced mantiene la risoluzione della mappa SVG delle milestone precedenti. La riduzione
automatica (`adaptive`) è spenta per default; se attivata, abbassa la scala interna WebGL2 quando
i frame superano il budget e lo mostra nel pannello (scala, numero di riduzioni).

**Supporto per backend** ([`src/model/support.ts`](../src/model/support.ts)): CSS ignora
`band`, `refraction`, `profile`, `dome`, `chroma`, `pressRefraction`; SVG supporta tutto; WebGL2
approssima blur, luce, direzione della luce, ombra e luce di contatto. Il laboratorio lo mostra
per il backend effettivo, il manifest dei pacchetti lo riporta.

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
  `smooth` = `t²(3 − 2t)`, `linear` = `t`, `bump` = `sin²(πt)` (massimo a metà fascia).
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
  capsula libera (nel laboratorio il gruppo si chiama "Geometria"). Navbar, pulsante, selettore
  e cursore dello slider prendono dimensioni dal proprio layout e sono sempre capsule; ereditano
  ottica, materiale, luce, ombra e movimento. In modalità Navbar il laboratorio disabilita
  `width`, `height`, `shape`, `radius` e `stretch` (la barra non si trascina).
- **Inserimento manuale.** Il campo numerico del laboratorio accetta solo valori finiti,
  nell'intervallo e sul passo (`parseNumberInput`). L'import JSON resta come nella milestone 1
  (tipo e intervallo, senza controllo del passo) per non rifiutare file già esportati.
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

## Preset

Preset ufficiali: `jello` (Jello · iniziale), `optics` (Ottica nuda), `satin` (Satinato), `deep`
(Lente marcata) e `navbar` (Jello · navbar). I primi quattro sono invariati dalla milestone 1. `navbar`: `band` 16, `refraction` 10, `profile` smooth, `blur` 4, `saturation` 160, `tint`
#ffffff a 0,14, `light` 0,65 a 330°, `shadow` 0,2 / 26 px / 8 px, `damping` 0,8, `stretch` 0,
`pressScale` 1,02, `pressRefraction` 0,4, `pressLight` 0,45. È una calibrazione a vista sulla
navbar del laboratorio, non la copia di un altro materiale.

### Preset rimossi

`cable` e `bt` erano approssimazioni di materiali di altri progetti, distribuite durante la fase
sperimentale: non fanno più parte della libreria ufficiale. `src/migration/legacy.ts` conserva solo
i loro id e parametri, per compatibilità:

- un URL con `preset=` o `material=` uno di questi id, o un progetto salvato che l’aveva aperto,
  apre il sostituto (`satin`, `navbar`) come **bozza non salvata con i parametri originali** e lo
  dice; «Salva come copia» la conserva come materiale personale. Nulla viene scritto da solo;
- un materiale personale che ha proprio quell’id resta dell’utente: ha la precedenza;
- le componenti che li usavano tengono la propria copia del materiale (stato «incluso»).

