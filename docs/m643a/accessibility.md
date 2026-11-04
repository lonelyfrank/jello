# M6.4.3.A — Accessibilità

> Una misura raster o un test E2E non sono una dichiarazione di conformità WCAG. Qui ogni voce dice **cosa** è stato verificato, **come** e **da chi** (automatico / manuale). Cosa non è stato verificato è `NOT TESTED`.

## 1. Contrasto dell'etichetta per stato (nuova misura)

`docs/m643a/tools/contrast-states.mjs` → `contrast-states.json`. Rapporto di contrasto WCAG tra il colore dell'etichetta **dello stato** (risolto dal documento, quindi con gli override di disabilitato e premuto) e i pixel *dietro* l'etichetta (etichetta nascosta, banda centrale), 5° percentile. A e B3 × 4 preset × 80×32 e 160×44 × sfondi chiaro, scuro, gradiente (24 casi per riga). **È una stima raster**, non una misura di conformità: non copre l'antialiasing del testo, il peso del carattere, lo sfondo reale sotto un Button traslucido né gli sfondi «testo» e «strutturato».

| Stato | A: minimo P5 | A: casi sotto 4,5 | B3: minimo P5 | B3: casi sotto 4,5 |
|---|---|---|---|---|
| idle | 4,54 | 0 / 24 | 4,81 | 0 / 24 |
| hover | 4,80 | 0 / 24 | 4,90 | 0 / 24 |
| **premuto (hold)** | **4,08** | **4 / 24** | **4,14** | **2 / 24** |
| disabilitato | 1,58 | 8 / 24 | 1,72 | 8 / 24 |

**Trovato in questa fase:**

1. **Stato premuto su sfondo scuro, Candy: P5 4,08–4,20 in A e 4,14–4,29 in B3**, quindi sotto 4,5 (le mediane sono ≥ 5). Non è introdotto da B3: c'era già in A (M6.4.3 misurava solo l'idle). B3 non lo risolve. Causa plausibile: l'override dello stato premuto scurisce la tinta (×0,84) mentre il colore dell'etichetta di Candy resta scuro (`#180912`).
2. **Clear premuto su scuro: A 4,39–4,41 (sotto), B3 sopra 4,5.** B3 lo migliora.
3. **Disabilitato: 1,6–3,0 su sfondo scuro** (con B3 poco meglio di A). Il testo disabilitato è esentato dal criterio WCAG 1.4.3, ma una etichetta quasi illeggibile è comunque un problema d'uso da segnalare al reviewer.

Candy premuto su scuro e il disabilitato su scuro vanno tra le **correzioni richieste candidate** (`preset-evaluation.md`), non applicate.

## 2. Verifiche automatiche del workspace (E2E, Chromium e Firefox)

| Voce | Verifica |
|---|---|
| Tastiera | Tab raggiunge i controlli e i Button; **Spazio** e **Invio** premono la cella focalizzata, sono rispecchiati sulle altre e producono **un solo click nativo** |
| Focus visibile | `outline-style` ≠ `none` sul Button dopo focus da tastiera |
| Nomi accessibili | nessun `button`, `select`, `input` o `textarea` del workspace senza nome (etichetta, `aria-label`, testo o `title`) |
| Solo icona | il Button ha `aria-label` e nessun testo; la decorazione SVG è `aria-hidden` e senza testo |
| Inspector | sezioni `<details>/<summary>` native, apribili con Invio |
| Movimento ridotto | simulato dal workspace (profilo static) **e** preferenza di sistema emulata (`emulateMedia`): nessuna deformazione; la timeline spiega perché |
| Area di interazione | la hitbox è il box del Button e **non cambia** durante la deformazione (confronto del `boundingBox` a riposo e premuto) |
| Etichette lunghe, tre dimensioni, cinque sfondi | nessuna sovrapposizione fra celle e nessuno scroll orizzontale della pagina; su telefono emulato (Pixel 7) nessuno scroll orizzontale |
| Stati | l'attributo `disabled` è quello del Button nativo; lo stato forzato vale per tutte le celle |
| Trasparenza ridotta, forced colors | coperti dalla suite esistente (`jelly-studio.spec`: «honours the system reduced-motion, reduced-transparency and forced-colors preferences»), rieseguita in questa milestone; **non riesaminati** nel workspace |

## 3. Verifiche manuali — da fare

Nessuna è stata fatta in questa fase (nessun reviewer umano ha lavorato):

- prova da tastiera su una macchina reale, con attenzione all'ordine di Tab nel palco e nell'Inspector;
- ingrandimento del testo del browser e zoom di pagina al 200 %;
- modalità ad alto contrasto del sistema operativo.

## 4. NOT TESTED

- **Lettore di schermo** (NVDA, JAWS, VoiceOver, TalkBack): nessuno.
- **Conformità WCAG** formale: non dichiarata.
- Contrasto su sfondi «testo» e «strutturato», e in hover/premuto/disabilitato **con etichetta visibile e antialiasing reale**.
- Dispositivi fisici touch (il `mobile-emulated` è emulazione di viewport e touch).
- Contrasto non testuale (bordo del Button contro lo sfondo, WCAG 1.4.11): non misurato; i dati di bordo di `comparison-matrix.md` non lo sostituiscono.
