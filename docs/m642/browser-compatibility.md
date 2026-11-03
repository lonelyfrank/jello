# M6.4.2 — Compatibilità browser

Esito della verifica finale (HEAD `09036f8`, `npm run test:e2e:local`, 16,2 min): **931 passati · 131 saltati · 0 falliti · 0 instabili**.

| Progetto Playwright | Motore | Passati | Saltati | Falliti |
|---|---|---|---|---|
| `chromium` | Chromium 156, Desktop Chrome, 1280×860, DPR 1 | 354 | 0 | 0 |
| `firefox` | Firefox 157, Desktop Firefox, 1280×860, DPR 1 | 308 | 46 | 0 |
| `mobile-emulated` | Chromium 156 con profilo **Pixel 7** (412×915, DPR 2,625, touch) | 269 | 85 | 0 |
| `webkit` | — | **NOT RUN** | — | — |

**WebKit: NOT RUN.** `browserType.launch: Host system is missing dependencies to run browsers` (riverificato il 2026-11-03 con un lancio diretto di `webkit.launch()`). Per riprodurre: `sudo npx playwright install-deps webkit && npx playwright test --project=webkit`. Il progetto `webkit` è definito in `playwright.config.ts` e **non** fa parte di `test:e2e:local` (voluto). Nessun risultato WebKit è dichiarato superato in questa milestone, né per lo Studio né per il consumer.

**`mobile-emulated` non è un telefono.** È Chromium desktop con viewport, DPR e touch emulati. Non verifica: WebView Android, Safari iOS, prestazioni, tastiera virtuale, gesture di sistema, `prefers-*` reali.

## Saltati (131) — nessuno trasformato in successo

| N | Spec | Dove | Motivo dichiarato nel codice |
|---|---|---|---|
| 56 | `studio-responsive.spec.ts` | firefox, mobile | «layout rules are checked once, on desktop Chromium» (7 viewport × 4 test, già eseguiti su Chromium) |
| 33 | **`m642-control-effect.spec.ts`** (nuovo) | mobile | «the Inspector is a drawer on phones; the control → render chain is the same code, checked once on desktop engines» (la catena parametro → renderer è identica; Chromium e Firefox la eseguono entrambi) |
| 18 | **`m642-a11y.spec.ts`** (nuovo) | firefox, mobile | «viewport matrix is driven explicitly below, once, on desktop Chromium» (i 6 viewport sono già iterati dentro il test) |
| 16 | **`m642-builder.spec.ts`** (nuovo) | firefox, mobile | idem (5 larghezze iterate nel test) |
| 4 | `jelly-studio.spec.ts` | mobile | nessuna tastiera hardware; semantica del mouse; download e rendering del consumer su viewport desktop; flusso desktop |
| 1 ciascuno | `fallback.spec.ts` (firefox: emulazione solo via CDP Chromium); `projects.spec.ts`, `release-gate.spec.ts`, `studio-redesign.spec.ts` (mobile: il selettore progetto è nel breadcrumb, nascosto sui telefoni; download su desktop; separatori solo desktop) | | |

Gli skip sono saliti da 64 a 131 per **sole** specifiche nuove che dichiarano di essere eseguite una volta (Chromium) perché iterano i viewport da sé o perché l'Inspector è un cassetto sui telefoni. I test nuovi di `m642-studio.spec` (16) e `m642-resilience.spec` (3) girano su **tutti e tre** i progetti, compreso il telefono emulato (usano `showPanel` per aprire il cassetto).

## Cosa è verificato per motore

| Area | Chromium | Firefox | Telefono emulato |
|---|---|---|---|
| Studio (tutti i flussi, 931 test) | ✓ | ✓ | ✓ |
| Matrice «controllo → effetto» (Glass 18 + Solid 10 parametri statici, 4 di movimento, timing Solid) | ✓ | ✓ | — (skip dichiarato) |
| Sweep strutturale 6 viewport × 8 aree, tema chiaro/scuro, contrasto, focus | ✓ | — | — |
| Reset alla base, vocabolario Jello, scene di prova, confine d'errore dei chunk, layout reset | ✓ | ✓ | ✓ |
| Consumer React, Vanilla, Desktop, esempio navbar (progetti indipendenti) | ✓ | ✓ | ✓ |
| Pacchetti Jello (4) · integrità, mount, RAF, tastiera, destroy | ✓ | ✓ | — |
| Raster Stage (`raster.spec`, registrazione in `verification/*.json`) | ✓ (156) | ✓ (157) | ✓ (156, emulato) |
| WebGL2 (`webgl.spec`, `export.spec` WebGL2) | ✓ | ✓ | ✓ |
| `forced-colors` Solid (`solid.spec:189`) | ✓ | ✓ (lo skip condizionale `solid.spec:193`, «Questo motore non emula forced-colors», **non è scattato** in nessun motore) | ✓ |
| Matrice di screenshot | ✓ | — | — (390×844 emulato in Chromium) |

Differenze di motore osservate (misurate, non sono difetti): intervalli di frame sotto 60 modifiche rapide p50 16,6 ms Chromium vs 26 ms Firefox (headless, `performance.md`); `longtask` non esposto da Firefox; i contatori DOM/listener richiedono CDP (solo Chromium).

## Non verificato

Safari/WebKit (qualsiasi), iOS, Android WebView e Chrome Android reali, browser senza `ResizeObserver`/`IntersectionObserver`/`color-mix` oltre ai test di fallback esistenti (`solid.spec:218-233`, `fallback.spec`), Firefox con matrice di screenshot, Chromium di versioni diverse dalla 156.
