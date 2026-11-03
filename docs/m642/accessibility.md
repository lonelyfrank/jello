# M6.4.2 — Accessibilità

**Dichiarazione di limite.** I controlli sotto sono automatici o sonde DOM mirate. Non costituiscono un audit WCAG e **non si dichiara conformità**: mancano lettori di schermo reali, navigazione con ingrandimento, strumenti di contrasto sui pixel e una persona che usi davvero il prodotto con tecnologie assistive. La checklist manuale in fondo dice cosa resta da fare.

## 1. Verifiche automatiche (nuove, `tests/e2e/m642-a11y.spec.ts`, Chromium desktop)

**Sweep strutturale** — 6 viewport (320×640, 390×844, 768×1024, 844×390 landscape basso, 1024×768, 1440×900) × 8 aree (Home, Builder, Material Lab, Library, Preview & Test, Jello β, Asset, Impostazioni), più il primo avvio. Per ogni pagina:

| Controllo | Criterio |
|---|---|
| nome accessibile | ogni `button`, `input`, `select`, `textarea`, `a[href]`, `[role=button/tab/switch/slider/menuitem]` visibile ha un nome non vuoto, calcolato da `aria-labelledby` → `aria-label` → `<label>` → testo → `title` |
| riferimenti | **nessun `aria-labelledby` verso un id inesistente** (ha trovato M642-12) |
| `id` duplicati | nessuno |
| titoli | **un solo `<h1>` visibile** per pagina (ha trovato M642-09) |
| overflow | nessuno scroll orizzontale della pagina |
| console | nessun `console.error`, `pageerror`, `requestfailed` |

Esito: **pulito dopo le correzioni** in tutti i viewport e le aree. Prima delle correzioni: due `<h1>` al primo avvio (M642-09) e il campo «Raggio (px)» del Builder senza nome corretto (M642-12; non emergeva nello sweep iniziale perché compare solo selezionando «Raggio in px», ora coperto da un test dedicato).

**Temi.** `light theme` e `dark theme` (Impostazioni → «Tema dell'interfaccia di prova»): stesso sweep delle 8 aree a 1280×860, più il rapporto di contrasto WCAG fra i token `--text`/`--muted` e `--surface`/`--surface-raised` di ogni area: **tutti ≥ 4,5:1** in entrambi i temi (soglia AA per testo normale). È una misura sui **token**, non sui pixel di ogni componente.

**Focus da tastiera.** `keyboard: every tab stop of the Home and of the Library shows a focus indicator`: 30 Tab in Home e 30 in Library, ognuno con `outline` visibile, `box-shadow` o l'anello del contenitore (`:focus-within` / card con pulsante esteso); nessun punto di focus senza indicatore. Ordine di focus: segue l'ordine DOM (rail → hero → categorie → griglia); `grep` non trova `tabindex` positivi in `src/`.

**Rail e aree bloccate** (M642-02, M642-11): le voci bloccate sono focalizzabili (`aria-disabled`, non `disabled`), descritte da «Serve un progetto…» e non scattano; la rail usa solo `aria-current="page"` (non `aria-pressed`).

**Bersagli** (§10.5): nel Builder, nessun bersaglio interattivo sotto 24×24 px (WCAG 2.2 · 2.5.8, minimo AA) per i 3 componenti × 5 larghezze (`m642-builder.spec`). Nei 6 viewport le uniche eccezioni sono input file nascosti (1×1, non interattivi). Nella Library il «pulsante nome» è esteso a tutta la card via CSS (misura 17 px d'altezza intrinseca, area attiva = card).

## 2. Verifiche esistenti rilevanti (passate)

| Tema | Prova |
|---|---|
| Semantica del Button (Jello): host nativo, Spazio/Invio = click nativo, focus del `<button>` | `jelly-studio.spec:143`; consumer Jello: 2 click nativi in 16 esecuzioni |
| Focus visibile quando l'estetica cambia; `disabled` distinto e leggibile | `solid.spec:189`, `components.spec:161,441,511`, `react-consumer.spec:139` («the ring is the definition's») |
| Tastiera sul consumer React (frecce, Invio, focus visibile) | `react-consumer.spec:69` |
| `prefers-reduced-motion` | `solid.spec:113`, `fallback.spec:83-115`, `navbar.spec:385`, `jelly-studio.spec:239`, `vanilla-consumer.spec:111`, consumer Jello (moto «static») |
| `prefers-reduced-transparency` | `fallback.spec`, `jelly-studio.spec:209,239`, `vanilla-consumer.spec:111` |
| `forced-colors` | `solid.spec:189` (bordo visibile, testo colore di sistema; **saltato dove il motore non lo emula**: vedi `browser-compatibility.md`), `fallback.spec:59`, `navbar.spec:400`, `desktop-navigation.spec:310`, `jelly-studio.spec:239`, `screenshots/jello-env-forced-colors.png` |
| Errori annunciati | campi del Material Lab: `aria-live="polite"` sempre montato + `aria-invalid`; **campi del Builder: ora lo stesso** (M642-13: prima il `<p role=status>` compariva insieme all'errore e non era annunciato in modo affidabile) |
| Dialog di import/export: focus intrappolato e conferma distruttiva | `projects.spec:94` «keeps focus inside the dialog» |
| Percorsi raggiungibili da tastiera (sezioni e flussi) | `projects.spec:325` «keyboard: the section buttons and the flows are reachable without a mouse» |
| Menu azioni del progetto: `role=menu`, `Esc` chiude | solo lettura del codice (`Home.tsx`); non c'è un test dedicato |

## 3. Problemi noti non corretti (P2)

- La rail mostra lo stato di salvataggio dell'archivio **stabile** anche nell'area Jello β (`studio-ux-review.md` §4).
- Lo skip link («Vai al contenuto» → `#main`) esiste in Home e Library; verificato solo per lettura di `App.tsx`, non con un test (esistono per Material Lab «Vai alle proprietà», Builder «Vai all'inspector», Jello «Vai all'inspector Jello»).
- I campi numerici del Builder non hanno frecce ↑/↓ (M642-13).
- Il testo del Button di esempio nel Jello Lab è «Jelly»: contenuto dimostrativo, non interfaccia.

## 4. Checklist manuale (da eseguire da una persona; **NON ESEGUITA**)

- [ ] Lettore di schermo (NVDA/Orca/VoiceOver): rail, Library (card, preferiti), Inspector (valori, errori, ↺), dialog di import/export, banner di conflitto del Jello lab e di guasto di un'area sperimentale.
- [ ] Zoom 200 % e 400 % su Home, Library, Builder, Material Lab: nessuna perdita di funzione, nessuno scroll in due direzioni (WCAG 1.4.10).
- [ ] Contrasto **sui pixel** di: testo dei preset Glass su sfondi di prova, badge di stato, tag «β», testo disabilitato, anelli di focus sul tema chiaro.
- [ ] Navigazione solo tastiera di un percorso completo: nuovo progetto → Builder → materiale → export, incluso l'uso del trascinamento dei separatori con tastiera (Home/End già gestiti).
- [ ] Movimento ridotto, trasparenza ridotta e colori forzati su un sistema operativo reale (le emulazioni DevTools possono differire).
- [ ] Target touch ≥ 44 px su telefono reale (la soglia automatica è 24 px).
