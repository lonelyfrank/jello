# M6.4.2 — Qualità dei materiali (Glass, Solid, Jello)

Metodo e limite dichiarato: i numeri sono **misurati** su raster dello Stage (Chromium 156 headless, DPR 1, `animate=0`, soglia di rumore 12/255 per canale, vedi sotto) o calcolati dal modello deterministico; i giudizi «percettivi» sono **miei, da immagini** (`screenshots/`) e non sostituiscono una review di un designer. Nessun valore numerico di nessun preset è stato modificato in M6.4.2.

**Soglia di rumore.** Ricreare un elemento ri-rasterizza il testo con un'anti-aliasing sub-pixel diversa: misurato sul bottone Solid, differenza massima 7/255, media 1,4, ~100 px. La soglia 12 separa quel rumore da un cambiamento reale (usata in `tests/e2e/m642-control-effect.spec.ts` e in `scripts/m642-compare.mjs`).

## 1. Ogni controllo operativo fa quello che dice (§4.4, §6.1)

Prova: `tests/e2e/m642-control-effect.spec.ts` (Chromium + Firefox). Per ogni parametro: si modifica **dall'Inspector** (il controllo vero), si cattura lo Stage, si verifica che cambi (>100 px sopra soglia), si preme il **suo ↺** e si verifica che lo Stage torni alla baseline (≤10 px).

| Famiglia | Parametri statici | Esito | Note |
|---|---|---|---|
| Glass | shape, width, height, radius, band, refraction, profile, dome, chroma, blur, saturation, tint, tintOpacity, light, lightAngle, shadow, shadowBlur, shadowOffset (18) | **18/18** | `radius` è `disabled` con nota finché la forma è capsula: il test lo verifica e poi passa a `rounded` |
| Solid | fill, foreground, finish, borderColor, borderWidth, elevation, shadowColor, shadowOpacity, shape, radius (10) | **10/10** | `finish` su Solid · Dark (vedi O-1); `shadowColor` dopo aver portato elevazione 5 e opacità 1 (l'effetto del colore dipende dall'ombra visibile) |

| Parametri di movimento | Cosa è misurato | Esito |
|---|---|---|
| Glass `pressScale` | scala della capsula tenuta premuta = valore impostato (1,15 → 1,15; 1 → 1,00, ±0,005) | PASS |
| Glass `pressLight` | `--jello-press-light` sulla superficie = valore; ↺ → 0,35 | PASS |
| Glass `pressRefraction` | scala di `feDisplacementMap` premuto / a riposo = 1 + valore (1 → ×2; 0 → ×1) | PASS |
| Glass `stiffness` | a 60 ms dalla pressione una molla rigida (1200) è >2× più avanti di una morbida (40) | PASS |
| Glass `damping`, `stretch` | **non verificati singolarmente in E2E.** Letti nel percorso di codice (`core/surface.ts:217-226, 248-256`); `stepSpring` è coperto da `spring-and-path.test.ts`; lo stretch in generale da `interaction.spec` («pressing stretches the existing map…») | PARTIAL |
| Solid `duration`, `easing` | `transition-duration` / `-timing-function` calcolati su `.jello-solid-host`: 0,14 s → 0,6 s; `standard` → `cubic-bezier(0.05, 0.7, 0.1, 1)`; ↺ li ripristina | PASS |

Convalida dei valori (§4.3), eseguita nel browser su `#num-blur` (preset Frosted, 0–40 px): `12.5` ✓ · `7,5` ✓ (virgola) · `-5` → «Fuori intervallo (0 – 40): non applicato.» e il valore resta 7,5 · `999` idem · campo vuoto → «Valore vuoto: non applicato.» · `abc` → «Non è un numero: non applicato.» · `1e2` → fuori intervallo · uscita dal campo con testo non valido → ripristino e «Valore non valido scartato: resta 7.5 px.» · ↑ e Shift+↓ = ±1 e ±10 passi · 60 modifiche rapide (667 ms) senza errori e con documento esportato valido. Il documento non viene mai toccato da un valore incompleto. (Sonda: `tools/inspector.mjs`.)

**Ripristino (§4.2).** Vedi M642-17: ↺ torna ora al valore della base (preset incluso o preset di origine della copia), non al default generico; «Ripristina «Glass · Frosted»» riporta l'intero preset; «Valori di base Glass» riporta ai default di famiglia. Test: `m642-studio › reset goes back to the base…`.

## 2. Glass

**Backend richiesto/effettivo/capacità (§5.2).** L'Inspector mostra «richiesto X → effettivo Y (opaco)» (`Properties.tsx:355`), per ogni parametro il livello «supportato / approssimato / ignorato» con motivo (`model/support.ts`): con CSS `band, refraction, profile, dome, chroma, pressRefraction` sono *ignorati* («CSS non devia il contenuto: nessuna lente»); con WebGL2 `blur, light, shadow…` sono *approssimati* (gaussiana separabile, riflesso nello shader…). Il catalogo non attribuisce al backend DOM capacità della scena WebGL2. Prove esistenti: `fallback.spec.ts`, `webgl.spec.ts` (fallback CSS con motivo, perdita di contesto, errore shader), `export.spec.ts`.

**Sfondi di prova (§5.3).** Uniforme, gradiente, testo, fotografia (asset locale CC0 già nel repository), scuro, chiaro, in `screenshots/material-glass-*`. Prima di M6.4.2 le voci «Jello Dark», «Jello Light», «Gradient», «Checker» e «Contrast» di «Sfondo di prova» disegnavano una pagina bianca (M642-20): ora sono verificate da test. Contenuto in movimento, contenitori piccolo/grande e superfici sovrapposte: coperti dalle prove esistenti (`interaction.spec`, `components.spec`, `navbar.spec`, `raster.spec`); non ripetuti qui.

**I preset differiscono per trattamento, non solo per nome (§5.4).** Quota di pixel dello Stage che cambia fra due preset (soglia 12), per sfondo:

| Coppia | uniforme | gradiente | testo | foto | chiaro | scuro |
|---|---|---|---|---|---|---|
| Default / Frosted | 0,63 % | 17,4 % | 10,6 % | 14,9 % | 6,5 % | 17,3 % |
| Default / Refractive | 0,22 % | 0,57 % | 6,6 % | 9,8 % | 3,9 % | 4,6 % |
| Default / Subtle | 0,61 % | 16,4 % | 4,0 % | 9,5 % | 3,7 % | 16,4 % |
| Frosted / Refractive | 16,1 % | 17,5 % | 13,6 % | 16,3 % | 6,8 % | 17,5 % |
| Frosted / Subtle | 0,66 % | 0,75 % | 7,6 % | 11,2 % | 5,6 % | 7,1 % |
| Refractive / Subtle | 0,98 % | 17,6 % | 8,5 % | 14,3 % | 5,1 % | 17,5 % |

Lettura onesta: **su fondi lisci (uniforme, gradiente) le coppie Default≈Refractive e Frosted≈Subtle sono quasi indistinguibili (< 1 %)**, perché la rifrazione non ha struttura da deviare: la differenza compare su testo e fotografia (4–16 %). È una proprietà fisica del trattamento, non un difetto di denominazione; l'unica coppia che resta vicina anche su testo è **Default / Subtle (4,0 %)**: le descrizioni del catalogo le distinguono (centro neutro e leggibile per superfici ampie vs rifrazione moderata di default) ma l'evidenza visiva è la più debole. *Proposta, non applicata:* verificare con un designer se Subtle debba avere banda più stretta o blur maggiore; ogni modifica richiede nuova baseline raster per il motore verificato (`verification/*.json`).

Frosted vs Refractive differiscono per trattamento (blur+saturazione senza rifrazione contro rifrazione forte con blur contenuto): 13,6–17,5 % su tutti gli sfondi tranne «chiaro» (6,8 %).

## 3. Solid

Famiglia autonoma (renderer CSS, nessun filtro SVG, nessun termine «Glass/Refraction» nei suoi controlli: `Inspector` mostra solo fill, border, elevation, shadow, shape, motion; Properties dichiara «Solid usa il proprio renderer CSS: nessuna rifrazione, sorgente, backend ottico o qualità WebGL2»).

| Coppia | chiaro | scuro |
|---|---|---|
| Matte / Dark | 1,83 % | 1,63 % |
| Matte / Accent Blue | 1,61 % | 1,62 % |
| Matte / Outlined | **0,14 %** | **0,10 %** |
| Dark / Accent Blue | 1,78 % | 1,59 % |
| Dark / Outlined | 1,84 % | 1,63 % |
| Accent Blue / Outlined | 1,64 % | 1,63 % |

(La percentuale è dell'intero Stage, di cui il bottone è una piccola parte.) **Matte e Outlined sono la coppia più vicina** (0,10–0,14 %): si distinguono per bordo più marcato, riempimento più chiaro e assenza di ombra (`solid-outline` non usa `shadow`/`elevation`, verificato da `validateCatalog`), non per colore. È coerente con il trattamento dichiarato; l'evidenza visiva è bassa su uno Stage chiaro. *Nessuna modifica.*

**Stati (§6.3).** Differenza dal default, bottone Solid in Builder (`screenshots/component-button-solid-*`): hover max 23/255 (fill `#f1f3f5 → #e7eaee` + elevazione 2: **sottile**, O-2), pressed max 46, disabled max 141. Glass: hover 47, pressed 32, disabled 155. `disabled` mantiene il componente visibile e leggibile (opacità, `aria-disabled`, nessuna interazione): `solid.spec.ts`, `components.spec.ts:161,441,511`. Il focus resta riconoscibile quando l'estetica è modificata e con `forced-colors`: `solid.spec.ts` (test `forced-colors`, eseguito in Chromium; saltato in motori che non lo emulano, vedi `browser-compatibility.md`). Override di stato: coperti da `solid.test.ts` e `components.spec.ts`.

## 4. Jello (sperimentale)

Resta `planned` nel registro produttivo (`FAMILIES`), non importato dal runtime produttivo (grafo import: 45 file raggiungibili da `src/runtime/index.ts`, 0 sperimentali), caricato solo con `import()` dinamico. Il documento persistito non contiene stato di simulazione (`jelly-studio.test.ts`, `jelly-model.test.ts`).

### 4.1 Differenze meccaniche — **calcolate** (modello deterministico, griglia 1 ms)

`scripts/m642-jello-motion-metrics.mjs` → `jello-motion-metrics.json`. Scenario: pressione, tenuta 600 ms, rilascio, osservazione 3 s.

| Preset | `responseMs` | ζ | `maxDeformation` | picco di pressione | rimbalzo dopo il rilascio | tempo a riposo |
|---|---|---|---|---|---|---|
| Soft | 360 | 0,65 | 0,060 | 0,0417 | 0,0027 | 587 ms |
| Clear | 360 | 0,65 | 0,060 | 0,0417 | 0,0027 | 587 ms |
| Candy | 360 | 0,40 | 0,090 | **0,0733** | **0,0155** (×5,7) | 927 ms |
| Dense | 220 | 1,05 | 0,035 | 0,0227 | **0** (sovrasmorzato) | **330 ms** |

(frazioni del lato corto; a un Button medio di 44 px: Soft ≈ 1,8 px, Candy ≈ 3,2 px, Dense ≈ 1,0 px.)

- **Soft e Clear sono meccanicamente identici**; differiscono solo per i parametri ottici. Non è un difetto: «Clear» è definito come più traslucido.
- **Candy** ha la risposta elastica più evidente (picco ×1,8, rimbalzo ×5,7, ~1 s): coerente con «carattere giocoso, risposta elastica evidente».
- **Dense** è il più corto e senza rimbalzo: coerente con «comportamento meccanico meno vivace».
- **Soft** ha un rimbalzo di 0,0027 (≈ 0,1 px): non percepibile. La «risposta morbida e controllata» è un ritorno liscio, non un rimbalzo; la deformazione di pressione (≈ 1,8 px) è leggibile ma modesta.

### 4.2 Identità visiva — **giudizio da immagini** (`screenshots/jello-compare-*`, `jello-motion-*`, contact-sheet nel report di consegna)

- Il corpo è riconoscibile come gel (bordo più denso in basso, luce diffusa in alto, ombra morbida colorata), distinto da Glass: nessuna rifrazione, nessun backdrop (dichiarato nel catalogo e nel pacchetto).
- Le differenze fra preset sono **dominate da tinta e opacità** (lilla, rosa saturo, grigio-azzurro, verde). Candy è l'unico con bordo basso nettamente più scuro; Dense non appare «più corposo» di Soft a parità di dimensioni: la sensazione di corpo è data da trasmissione bassa e diffusione alta, poco visibili su fondo chiaro.
- **Le bolle** (decorative, statiche, deterministiche per seed) sono presenti ma **di basso contrasto**: a dimensione media si vedono 2–3 piccole circonferenze, più leggibili su Clear e Dense. Riproducibilità col seed e stabilità delle identità al resize: vedi §4.3. Nessuna ricreazione continua dei nodi: durante la tenuta e il rimbalzo il numero di nodi del documento resta 5338 → 5338 (`performance.md`).
- Sequenza press → hold → release → rebound → rest per i quattro preset: `screenshots/jello-motion-<preset>-{1-idle…6-rest}.png` (campionamento a ritardi fissi da eventi reali: i fotogrammi dinamici variano di ~0,1 % fra due esecuzioni identiche, per jitter di tempistica).
- Ambienti: ridotto movimento (profilo statico), fallback CSS (SVG non disponibile), opaco, trasparenza ridotta, `forced-colors: active` (emulato in Chromium): `screenshots/jello-env-*.png`.

**Valutazione, non correzione (§7.3).** Nessun preset è stato modificato. Proposte di tuning da sottoporre a un designer, ciascuna da trattare come milestone con regressione propria:
1. Soft: aumentare `releaseImpulse` o `maxDeformation` se si vuole un ritorno percepibile.
2. Dense: aumentare il contrasto dei bordi/diffusione se «corposo» deve leggersi anche su fondo chiaro.
3. Bolle: valutare un minimo di contrasto/raggio per il livello Base.

### 4.3 Motion, lifecycle e fallback

**Coperto da test esistenti, passati** (citati per nome, non rieseguiti uno per uno):
- idle / pressione / tenuta / rilascio / rimbalzo / riposo / nessun RAF / un solo click nativo: `jelly-studio.spec.ts:122`;
- tastiera Space/Enter e semantica nativa: `:143`; pointer-leave annulla, `disabled` non si muove: `:164`;
- pressioni ripetute: `jelly-motion.test.ts:55` («dissipates energy with no input and bounds rapid alternating input»); stati zero/disabled e riduzione atomica dei limiti: `:60`; oscillatore deterministico con soluzioni note: `:19`;
- bolle deterministiche per seed attraverso preset, confronto e reset: `jelly-studio.spec.ts:181`; identità stabili al cambio qualità/resize: `jelly-visual.test.ts:29`;
- reduced motion / reduced transparency / forced colors di sistema: `jelly-studio.spec.ts:239`; backend e fallback dichiarati: `:209`;
- rilascio di tutto quando l'area viene lasciata, anteprima nascosta sospesa, nessun RAF: `:327`.

**Misurato in M6.4.2 sul pacchetto consumer indipendente** (`scripts/m642-verify-jelly-package.mjs`, 4 pacchetti × Chromium/Firefox × movimento normale/ridotto = 16 esecuzioni, `package-verification.json`): 0 RAF a riposo in 1,5 s; 0 RAF 1,2 s dopo il rimbalzo; Space+Invio = 2 click nativi; la pressione è registrata; `disabled` non preme; `destroy()` lascia 0 nodi `.jelly-decoration`, rimuove la classe e **0 RAF** anche premendo dopo; 0 errori console. Con movimento ridotto lo stato è «moto static».

**Non verificato singolarmente**: cambio di viewport *durante* il moto (coperto indirettamente da ResizeObserver + `jelly-visual.test.ts:29`); cancel via `pointercancel` sul pacchetto consumer.

### 4.4 Preview nel Builder (§7.6)

`jelly-studio.spec.ts:345` «Builder: Jelly trial on a Button leaves the component untouched and keeps its own snapshot»; `m642-resilience.spec` verifica che con il chunk mancante il documento del componente sia **byte-identico** prima/dopo. Non cambia `material.family` né `material.preset`, non compare nell'export produttivo (`jelly-studio.spec.ts:270` «the stable database was never given a Jelly record»).

### 4.5 Visibilità (§7.7)

Jello β è nella rail (`#ws-jelly`), nella Home (tile «Jello β», ora funzionante), nella Library (pill «Jello · sperimentale» con 4 card live e «Apri nel Jello Lab»). Il Jello Lab dichiara: sperimentale, non ufficiale, «il Button resta nativo», limiti (nessuna rifrazione né backdrop, solo SVG/CSS, niente WebGL2/Android), pacchetto web separato. Funzioni non disponibili: quelle del manifest `backends.unsupported` (`webgl2, android-native, refraction, drift, volumetric-simulation, typescript-types`).
