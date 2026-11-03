# Progetti, asset e flussi guidati

Il laboratorio organizza il lavoro in **progetti**. Un progetto raggruppa i materiali e le
componenti personali, i suoi asset (colori, icone, font) e qualche impostazione. I preset e i
template inclusi vivono nel codice e non appartengono a nessun progetto.

## Pagine

| Pagina | Cosa mostra |
| --- | --- |
| **Home** | Progetti recenti (griglia o elenco), materiali e asset del progetto attivo, esito delle verifiche raster (letto dai record in `verification/`), azioni rapide. Al primo avvio, senza progetti, tre modi di iniziare. |
| **Materiali** | L'editor di materiali: libreria (Jello · I miei · Preferiti), anteprima, pannello *Parametri* / *Rendering*. |
| **Componenti** | Il Component Builder. |
| **Asset** | Colori, icone e font del progetto, con pannello di dettaglio. |
| **Impostazioni** | Impostazioni del progetto, dove stanno i dati, riferimento degli stati dell'interfaccia. |

La navigazione tra le pagine è nell'intestazione (Materiali · Componenti · Asset) e nel logo (Home).
L'indirizzo ricorda la pagina (`page=`) e il progetto (`project=`); senza `page`, un indirizzo con
parametri di scenario apre l'editor, un indirizzo nudo riapre l'ultima pagina usata.

## Dati

- `ProjectDoc` (`src/project/types.ts`, formato `jello-project`, versione 1): nome, destinazione
  (Web · Android · Web + WebView), tema dell'anteprima, percorso di rendering predefinito, preferiti
  e asset. Validato con zod all'uscita dallo storage e all'ingresso da file.
- Materiali e componenti restano nei loro store, con un `projectId` opzionale. I record scritti prima
  dei progetti non lo hanno: il primo progetto li adotta (e se non c'è, ne viene creato uno).
- IndexedDB versione 4: nuovo store `projectdocs`. Nessuna migrazione distruttiva.
- I font `.woff2` caricati stanno nello store `assets` esistente, per SHA-256.

### Riferimenti ai materiali

Una componente segue un materiale della libreria tramite `material.preset`. Invarianti
(`src/project/references.ts`):

1. Ogni materiale e ogni componente appartiene a un solo progetto (`projectId`).
2. `material.preset` è `null`, l'id di un preset incluso (nel codice, uguale per tutti i progetti, non
   modificabile) oppure l'id di un materiale **dello stesso progetto**. Non esistono collegamenti tra
   progetti.
3. Gli id dei preset inclusi sono riservati: un riferimento a uno di essi è sempre al preset incluso.
4. Duplicare o importare dà ai materiali id nuovi; ogni riferimento è riscritto con la mappa
   «id originale → id nuovo» della stessa operazione, mai per nome o per tentativi.
5. Un riferimento non risolvibile (materiale mancante nel file, eliminato, o ambiguo perché due
   materiali copiati avevano lo stesso id) viene scollegato: la componente tiene il suo documento
   incorporato, quindi l'aspetto non cambia, e smette di seguire. L'operazione lo dice.

La propagazione (`src/lab/material-links.ts`) aggiorna solo le componenti del progetto del materiale,
collegate e senza valori propri (`outdated`). All'avvio, le componenti che versioni precedenti avevano
lasciato collegate a un materiale di un altro progetto (duplicazioni e import prima di M6.H) vengono
scollegate una volta, con un avviso. Un collegamento a un materiale solo mancante resta com'è e appare
come «incorporato».

### Salvataggio

- Ogni operazione logica è **una transazione IndexedDB** su tutti gli store che tocca
  (`Repository.commit`): creare, duplicare, importare o eliminare un progetto; eliminare un materiale
  o una componente; l'autosave. O tutto o niente; un errore (quota, transazione annullata) non lascia
  record parziali e il laboratorio non mostra il risultato prima del commit.
- Le modifiche a materiali, componenti e documenti di progetto sono tenute in memoria e marcate
  «da salvare»; l'autosave le scrive tutte insieme e toglie il segno solo a ciò che non è cambiato
  durante la scrittura. Un salvataggio fallito non toglie niente: il successivo riprova. Cambiare
  progetto non perde modifiche in attesa.
- Le operazioni di progetto sono serializzate con l'autosave (`Autosaver.exclusive`): un autosave
  partito prima di un'eliminazione non può riscrivere ciò che è stato eliminato.
- Due schede sullo stesso database non si sincronizzano: l'ultima scrittura vince (limite noto).

### Contenuti non fidati

Tutto ciò che arriva da un file o da IndexedDB è non fidato.

- **Icone SVG**: il markup passa da un'unica allowlist (`validateSvgBody`, `src/components/icons.ts`):
  solo forme e attributi di presentazione, nessuno script, evento, stile, link, `url()`, entità,
  `foreignObject` o immagine; `viewBox` di quattro numeri; profondità e numero di nodi limitati. Si
  salva e si esporta solo la riserializzazione. `parseProject` lo applica a ogni icona del progetto,
  sia da `.jello` sia da IndexedDB: un'icona rifiutata viene rimossa (quarantena) e segnalata
  (import: avvisi; avvio: *Impostazioni*), il resto del progetto resta. Il laboratorio disegna le icone
  come elementi React dall'albero validato (`SafeSvg`), mai come HTML.
- **Pacchetti `.jello`** (`src/project/unzip.ts`): indice centrale e intestazioni locali verificati
  prima di decomprimere (firme, metodi, nomi, dimensioni, offset, voci sovrapposte, percorsi duplicati
  anche dopo normalizzazione, percorsi assoluti o con `..`); decompressione in streaming interrotta appena
  una voce supera la dimensione dichiarata; CRC verificato; limiti di 2000 voci, 8 MB per voce e 64 MB in
  totale. ZIP64, archivi multi-volume e voci cifrate sono rifiutati con un messaggio esplicito.
- La pagina dichiara una Content-Security-Policy `script-src 'self'; object-src 'none'; base-uri 'self'`.

### Asset

- **Colori**: palette di colori con nome, token CSS (`--jello-…`, unico nel progetto, anche tra colori
  e stili tipografici), HEX e opacità. Contrasto WCAG su bianco e su grafite, valori RGB · HSL ·
  OKLCH, componenti che usano esattamente quel colore.
- **Icone**: raccolte; la raccolta *Jello · tratto* è quella incorporata e non si modifica. Gli SVG
  caricati passano dallo stesso parser delle icone dei componenti (nessuno script, stile, link o
  effetto; massimo 200 KB). Un colore fisso viene segnalato e si può convertire in `currentColor`.
- **Font**: famiglie (Google Fonts collegato, file `.woff2`, font di sistema) e scala tipografica con
  token. Il laboratorio non scarica font: l'anteprima usa quelli installati.

### Selettore colore

Un solo popover per tinta del materiale, colori delle componenti e asset: *Visivo* (quadrato,
tonalità, HEX, opacità, contagocce dove c'è, recenti), *Valori* (RGB · HSL · HEX · OKLCH, incolla un
valore in qualsiasi formato) e *Token* del progetto. In OKLCH un valore fuori dalla gamma sRGB è
segnalato insieme al colore a cui diventa.

## Flussi guidati

Passi con indicatore, *Indietro* / *Continua*, uscita in ogni passo. Nulla viene applicato prima
dell'ultima conferma.

- **Nuovo progetto** — nome e destinazione · punto di partenza (Kit Jello con preset scelti e
  navbar di esempio, Progetto vuoto, Da un file, Duplica un progetto) · riepilogo.
- **Importazione** — sorgente (file, trascinamento sulla finestra, JSON incollato) · verifica ·
  conflitti · esito. Un file non valido è rifiutato per intero, con gli errori; un documento
  parziale non viene mai applicato. Accetta materiali (`jello-glass` v1 e `jello-material` v2),
  componenti, pacchetti `.jello`, icone `.svg` e font `.woff2`.
- **Esportazione del progetto** — contenuto (materiali, componenti, colori, icone, font; opzione
  «solo gli asset usati dai componenti») · formato · esito con elenco dei file e *Scarica*.

### Conflitti

Si riconoscono per nome (materiali, componenti, icone, font) e per token con valore diverso (colori).
Per ogni conflitto: *Mantieni entrambi* (la copia importata prende un nome o un token libero),
*Sostituisci* (dove ha senso) o *Salta*; «Applica la stessa scelta a tutti».

## Formati di esportazione

| Formato | Contenuto |
| --- | --- |
| `.jello` | ZIP (voci non compresse, deterministico; in lettura anche deflate): `progetto.json`, `materiali/*.json`, `componenti/*.json`, `asset/icone/<raccolta>/*.svg`, `asset/token.json`. Si reimporta così com'è. |
| JSON dei materiali | Un file `jello-material` per materiale (ZIP se più di uno). |
| Variabili CSS | `:root { … }` con colori, famiglie e scala tipografica; il link Google Fonts è in un commento. |
| Componenti Vue | In arrivo. |

La lettura di un `.jello` rifiuta percorsi con `..`, `/` iniziale o `\`, limita numero e dimensione
delle voci e legge sia voci non compresse sia compresse (`deflate`) dove il browser ha
`DecompressionStream`.

## Verifiche

`tests/unit/project.test.ts` (colori, documento, pacchetto e round-trip, import e conflitti, asset)
e `tests/e2e/projects.spec.ts` (primo avvio, progetti isolati, preferiti, asset, picker, esporta →
importa con conflitti, ricerca, tastiera).

## Materiali e recupero in M3.1

Materiali e bozze dei progetti accettano `MaterialDocument` (Glass e Solid), senza cambiare lo schema `.jello` o IndexedDB. I documenti sono validati al recupero e all’importazione, inclusi gli stati Solid; gli import legacy conservano le migrazioni esistenti. Il salvataggio aggiorna anche l’URL: ricaricare subito dopo un save recupera l’elemento appena salvato. Gli indirizzi dello stesso progetto/materiale/componente recuperano anche le bozze; le opzioni esplicite di una scena nell’URL hanno precedenza sulla vista precedente.
