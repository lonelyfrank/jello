# M6.4.2 — Regressione visiva: matrice e review

**Processo (§15.3).** La baseline non è un file che si aggiorna da solo.
1. `scripts/m642-screenshots.mjs` genera la matrice (102 immagini) da un'istanza servita: Chromium 156, profilo isolato, DPR 1, `animate=0`, movimento ridotto dove l'immagine è un fermo.
2. La stessa matrice è generata da una build di **`origin/main` (`7692b4c`)** in un `git worktree` separato (poi rimosso), porta diversa.
3. `scripts/m642-compare.mjs <baseline> <candidato>` confronta pixel per pixel (soglia 12/255 per canale, la misura del rumore di anti-aliasing) e scrive `visual-diff.json`. **Non decide nulla**: ogni file `changed` resta «unreviewed» finché non è giudicato qui.
4. Le immagini in `screenshots/` sono quelle del **candidato** e un **registro**, non una baseline per test automatici: le baseline automatiche del progetto restano quelle raster di `tests/e2e/raster.spec.ts` (`verification/*.json`), che **non sono state toccate né rigenerate**.

Risultato: **102 immagini · 47 identiche · 55 cambiate · 0 mancanti · 0 con dimensione diversa.**

## Cambiamenti giudicati

| Gruppo (N) | Quota pixel | Cosa è cambiato | Intenzionale? | Giudizio |
|---|---|---|---|---|
| `material-glass-*` su **dark / light / gradient** (12) · `material-solid-*` su **dark / light** (8) | 96–98 % | prima: pagina **bianca** vuota; ora lo sfondo di prova dichiarato (M642-20). Si veda `screenshots/material-glass-satin-dark.png` e il suo gemello nella baseline | **Sì** | **Approvato.** È la correzione del difetto. Il materiale sopra è lo stesso (vedi riga sotto) |
| `material-glass-*` su **text / photo / uniform** (12) | 0 % | — | — | **Identiche a `main`**: nessuna regressione del renderer Glass nei tre sfondi già corretti |
| `component-button-solid-*` (4 su 8; i 4 Glass sono identici) | 0,022 % | rumore sparso (50 px su 225 k, bounding box = tutta l'immagine) | No (rumore) | Non è un cambiamento: ri-rasterizzazione del testo |
| `studio-desktop-01-home-first-launch`, `studio-mobile-01-…` | 12,2 % / 19,2 % | Material Gallery con 8 preset; tile «Jello β» al posto di «Jello presto»; nota «Le scorciatoie grigie…»; un solo titolo principale | **Sì** (M642-01, 02, 04, 09) | **Approvato.** Verificato a occhio su `studio-desktop-01` (layout intatto, tile con tag β) |
| `studio-*-03-home-project`, `studio-*-04-library-all`, `studio-*-05-library-jello` | 0,06–1,76 % | tile Jello β; conteggi (3 materiali nel kit, «Diagnostica» assente); la famiglia Jello mostra solo «Tutti» e «Materiali» | **Sì** (M642-01, 03, 07, 08) | **Approvato** |
| `studio-desktop-09-jello-lab` | 0,14 % | «Base: Jello · Soft» e «Ripristina «Jello · Soft»» | **Sì** (M642-05) | **Approvato** |
| `jello-compare-*` (12) · `jello-env-forced-colors` | 0,90–0,94 % | didascalie «Jello · Soft/Candy/Clear/Dense» al posto di «Jelly Soft…» | **Sì** (M642-05) | **Approvato.** Il corpo dei bottoni è invariato (bbox limitato alle didascalie) |
| `studio-desktop-02/06/07/08` | 0,003–0,07 % | contatori «I miei» 4→3 (`bbox` 235,289–241,297) e regione in basso a destra (1015–1171 × 840–851) = **orario «Salvato alle HH:MM:SS»** | In parte (contatore) / No (orario) | Approvato / rumore |
| `jello-motion-jelly-candy-{2,4,5}` | 0,055–0,177 % | fotogrammi dinamici campionati a ritardi fissi: jitter di tempistica (10–32 px) | No | Rumore di campionamento; il motore non è cambiato |

## Cosa la matrice NON dimostra

- Una sola dimensione (1280×860 e 390×844) e **un solo motore** (Chromium); Firefox ha le sue baseline raster (`verification/firefox.json`) e i suoi test di parità, ma non è nella matrice.
- Gli stati hover/pressed dei materiali Glass/Solid sono quelli del Builder (`canvas-states`); non c'è focus-visibile nelle immagini.
- Le miniature della Library non sono nella matrice come immagini separate (sono visibili nelle schermate intere).
- Il tema chiaro della chrome dello Studio non è nella matrice (le schermate sono con tema «Sistema»): è coperto dalla sonda strutturale, non da un confronto visivo.

## Riprodurre

```bash
npm run build && npx vite preview --port 4173 &
node scripts/m642-screenshots.mjs /tmp/candidate
# baseline: git worktree add /tmp/base 7692b4c && (cd /tmp/base && ln -s <repo>/node_modules . && npm run build:lib && npm run build:jelly && npx vite build && npx vite preview --port 4180 &)
BASE=http://127.0.0.1:4180/ node scripts/m642-screenshots.mjs /tmp/baseline
node scripts/m642-compare.mjs /tmp/baseline /tmp/candidate visual-diff.json
```
