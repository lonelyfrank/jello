# Procedura di prova su dispositivi Android

Nessuna di queste prove è stata eseguita (né nella milestone 1 né nella milestone Navbar). Lo scopo è renderle ripetibili:
stessi scenari, stessi URL, risultati annotati nello stesso formato.

## Dispositivi

| Ruolo | Dispositivo | Da annotare |
| ----- | ----------- | ----------- |
| Riferimento | Pixel 7 Pro | versione Android, Chrome, WebView (Impostazioni → App → Android System WebView) |
| Meno potente | un Android di fascia bassa (es. 4 GB RAM, SoC economico) | modello, SoC, RAM, versioni |

## Preparazione

```sh
npm run build
npx vite preview --host 127.0.0.1 --port 4173
adb devices                        # il telefono deve comparire
adb reverse tcp:4173 tcp:4173      # il telefono raggiunge http://127.0.0.1:4173
```

Telefono: batteria > 50%, non in carica, luminosità fissa, risparmio energetico disattivato,
nessuna app in primo piano. Riavviare Chrome prima di ogni serie.

Debug remoto: su desktop `chrome://inspect` → il tab del laboratorio → Performance
(registrare 10 s) e Rendering → "Frame Rendering Stats".

## Scenari (Chrome Android)

Aprire ciascun URL, attendere 3 s, premere **Misura frame (5 s)** nel pannello "Stato del
renderer" e copiare la riga risultante.

| # | URL | Azione durante la misura |
| - | --- | ------------------------ |
| 1 | `/?scene=blocks&components=0&animate=0` | nessuna |
| 2 | `/?scene=blocks&components=0&animate=0` | trascinare la capsula in cerchio |
| 3 | `/?scene=blocks&components=0&animate=1` | nessuna |
| 4 | `/?scene=blocks&components=0&animate=1` | trascinare |
| 5 | `/?scene=blocks&components=1&animate=0` | nessuna |
| 6 | `/?scene=blocks&components=1&animate=0` | trascinare |
| 7 | `/?scene=blocks&components=1&animate=1` | nessuna |
| 8 | `/?scene=blocks&components=1&animate=1` | trascinare |
| 9 | `/?scene=photo&path=satin` | trascinare (riferimento satinato) |

Verifiche visive, con screenshot (`adb exec-out screencap -p > nome.png`):

- `/?preset=optics&scene=grid&animate=0&components=0` con percorso Rifrazione e poi Satinato:
  la griglia si piega solo sul perimetro; il centro è identico.
- `/?preset=optics&scene=coords&animate=0&components=0`: il colore cambia solo nella fascia.
- Foreground nitido; allineamento dopo scroll del contenuto e rotazione dello schermo.
- Impostazioni → Accessibilità: "Rimuovi animazioni" → nessuna elasticità; "Testo ad alto
  contrasto" e colori forzati, dove disponibili.
- Temperatura: ripetere lo scenario 8 dopo 5 minuti d'uso continuo.

## Android WebView

Serve un'app host con una WebView che carichi `http://127.0.0.1:4173/` (con `adb reverse`).
Non è inclusa in questa milestone. Requisiti minimi dell'app di prova: JavaScript attivo,
`WebView.setWebContentsDebuggingEnabled(true)` per `chrome://inspect`, accelerazione hardware
attiva (predefinita). Ripetere gli stessi scenari e annotare la versione di WebView.
L'UA della WebView contiene `; wv)`: il laboratorio la riconosce e non usa record desktop.

## Formato dei risultati

Aggiungere un file `docs/perf/device-<data>-<modello>.md`:

```
Dispositivo / Android / Chrome o WebView:
Scenario 1: <riga copiata da "Misura frame">
...
Osservazioni visive: ...
Screenshot: ...
```

Non riportare FPS medi senza mediana e p95, e non estendere i risultati di un dispositivo agli altri.

## Scenari navbar (da eseguire)

| URL | Cosa osservare |
| --- | -------------- |
| `/?object=navbar&scene=app&animate=0` | Barra sopra la barra dei gesti / safe area (con `viewport-fit=cover`), target al tocco, leggibilità delle etichette sopra le card colorate. |
| `/?object=navbar&scene=app&animate=0&compare=1` | Stesso oggetto nei due riquadri, selezione e scroll sincronizzati. |
| `/?object=navbar&scene=grid&animate=0` | Rifrazione sul perimetro e taglio vicino al fondo della sorgente durante la pressione. |
| `/?object=navbar&scene=app&animate=1` | Frame con sfondo animato (pannello Diagnostica → "Misura frame"). |

Annotare anche: scroll del contenuto trascinando sopra la barra (sul desktop è inoltrata solo
la rotella), risposta alla pressione e movimento dell'indicatore con "Rimuovi animazioni"
attivo nelle impostazioni di accessibilità.

## Anteprima leggera e sincronizzazione (dalla versione 0.2.0)

Da eseguire su Pixel 7 Pro, poi su un dispositivo meno potente. Procedura di collegamento in
[phone-preview.md](phone-preview.md).

1. `preview.html?material=navbar&object=navbar&scene=app`: barra in basso, safe area, tab attiva,
   pressione; annotare il percorso effettivo mostrato in basso.
2. Sincronizzazione: avviare dal laboratorio, aprire il link sul telefono, muovere uno slider e
   cambiare voce della navbar; poi spegnere il Wi-Fi del telefono per 10 s e riaccenderlo:
   l’anteprima deve tornare allo stato corrente senza ricaricare.
3. Immagine locale nel laboratorio (scena Foto): deve comparire sul telefono (URL del relay).
4. `preview.html?mode=scene`: WebGL2 sul telefono, lente trascinabile, «Misura frame» non
   disponibile qui: annotare l’intervallo tra frame dal pannello del laboratorio collegato via
   `chrome://inspect` oppure con il profiler di Chrome remoto.
5. App Capacitor (`apps/android-preview`): stessi punti 1–4 nella WebView; annotare la versione
   di Android System WebView (Impostazioni → App → Android System WebView).

Registrare per ogni punto: dispositivo, versione Android, versione Chrome/WebView, runtime Jello
(`0.2.0`), backend effettivo, esito. Un risultato su emulatore va etichettato come emulatore.
