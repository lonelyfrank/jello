# Integrità dei dati sperimentali Jello (M6.4.1)

Database: `jello-lab-experimental` (separato da `jello-lab`, che non è stato toccato). Store: `jelly-materials`, `jelly-drafts`, `jelly-links` e, dalla versione 2, `jelly-quarantine`.

## Difetti verificati su M6.4 (`8e077bd`)

Riprodotti su un worktree del commit di base prima di correggerli:

| # | Difetto | Esito su M6.4 |
|---|---|---|
| 1 | Una modifica fatta mentre un salvataggio è in corso veniva sostituita dalla copia salvata | densità digitata 14, dopo il salvataggio 12 |
| 2 | Due schede sullo stesso materiale: la seconda sovrascriveva la prima senza avvisi | scheda 1 salva 10, scheda 2 salva 18, lo store contiene 18 |
| 3 | Una modifica fatta mentre il progetto B si carica creava la bozza di B con il documento di A | bozza di B esistente, scritta dal documento di A |
| 4 | Dopo un salvataggio fallito (quota) la bozza non veniva riprogrammata | 0 scritture di bozza: le modifiche non erano recuperabili dopo un reload |
| 5 | `purgeOrphans(projectIds)` cancellava in base a una lista passata dal chiamante | mai chiamata dall'app, ma disponibile: con una lista obsoleta cancellava dati validi |

## Revisioni e compare-and-swap

- Ogni record ha `rev`, incrementato dal repository a ogni scrittura. I record v1 non hanno `rev` e si leggono come 0: **nessuna riscrittura dei dati** nell'upgrade 1 → 2, che aggiunge solo lo store di quarantena.
- Un batch può dichiarare `expect: { chiave: revVista | null }`. Verifica e scrittura avvengono **nella stessa transazione `readwrite`**: se una attesa non regge, la transazione è abortita e non viene scritto nulla del batch (`JellyConflictError`, con store/chiave/revisione attesa e trovata).
- `BroadcastChannel` non è usato: potrebbe solo segnalare, mai garantire.
- Una scheda con la versione M6.4 aperta durante l'upgrade chiude la propria connessione (`onversionchange`): le sue scritture successive falliscono con «archiviazione non disponibile» invece di scrivere in uno schema che non conosce. Riaprire la scheda.

## Contratto multi-scheda

Nessun merge automatico, nessuna collaborazione in tempo reale. Quando una scrittura è rifiutata:

| Caso | Cosa succede | Scelte esplicite (mai automatiche) |
|---|---|---|
| Copia salvata da un'altra scheda dopo che l'hai aperta | non scritto; il documento di lavoro e la bozza restano | salva come nuova copia · usa la loro versione (scarta le mie modifiche) · sovrascrivi la loro |
| Copia eliminata dall'altra scheda | non ricreata | ricrea la copia · salva come nuova copia |
| Eliminazione di una copia modificata altrove | non eliminata, elenco ricaricato | — |
| Bozza del progetto scritta dall'altra scheda | la mia bozza non viene scritta finché non scelgo | sovrascrivi la bozza · usa la bozza dell'altra scheda |
| Prova nel Builder cambiata dall'altra scheda | non sovrascritta | usa quella dell'altra scheda · sovrascrivi con la mia |

In ogni caso «Esporta la mia versione (JSON)» è disponibile. Le azioni distruttive chiedono una seconda pressione.

Limite noto: la bozza è una sola per progetto, quindi due schede che modificano *documenti diversi* dello stesso progetto si segnalano a vicenda un conflitto di bozza (invece di sovrascriversi in silenzio). Per lavorare in parallelo basta salvare una copia.

## Ciclo di vita del workbench

- Le chiamate al repository sono **in coda**: una lettura non supera una scrittura.
- Al cambio progetto il documento di lavoro è azzerato subito; mentre il progetto si carica modifiche, salvataggi e cambi di preset sono rifiutati; una risposta arrivata dopo un secondo cambio è scartata.
- Una modifica fatta durante un salvataggio resta (stato «non salvato»); se nel frattempo ci si è spostati su un altro documento cambia solo l'elenco delle copie.
- Un salvataggio fallito non tocca il documento, riprogramma la bozza e mostra l'errore; il nuovo tentativo funziona appena lo spazio torna disponibile.
- Una bozza memorizzata illeggibile (corrotta o di versione più recente) è conservata byte per byte e **non viene mai sovrascritta**; si possono comunque salvare copie.

## Record orfani: rilevare, classificare, recuperare

Non esiste cancellazione automatica né all'avvio. `purgeOrphans` è stato **rimosso** dal repository.

1. **Rileva** (`scanJelly`): legge l'inventario dei tre store e una fotografia *fresca* dell'archivio stabile (`readLiveSnapshot`, mai le liste in memoria dello Studio). Non modifica nulla.
2. **Classifica**: `valid` · `orphan` (progetto o componente assente, e lettura dell'archivio stabile *completa*) · `unverifiable` (lettura parziale o archivio non persistente) · `corrupt` · `newer` (versione più recente). «Assente dalla memoria» non basta mai. Orfano + documento leggibile = *recuperabile*. Righe `corrupt` e `newer` non sono mai spostate né toccate.
3. **Recupera**: esportazione di una copia di sicurezza JSON; spostamento in quarantena (stessa transazione, riga identica byte per byte); ripristino, che non sovrascrive mai una chiave tornata a esistere.
4. **Pulisci**: l'unica pulizia è lo spostamento in quarantena, esplicito, rieseguendo la classificazione sull'archivio stabile *al momento* dell'azione e condizionato alla revisione vista. **Non c'è cancellazione definitiva**: con due database indipendenti non si può garantire che un record sia spazzatura, quindi si preferisce conservare. (Piano: una cancellazione definitiva della sola quarantena, dopo esportazione, in una milestone successiva.)

Dove: Jello Lab → Documento → *Integrità dei dati sperimentali* → Verifica.

## Snapshot del Component Builder

Chiave `projectId::componentId`. Comportamento definito e testato:

| Operazione sullo Studio stabile | Snapshot |
|---|---|
| Eliminare il componente | resta; la verifica lo segnala orfano (recuperabile); ricompare valido se un componente con lo stesso id torna (stesso file reimportato) |
| Duplicare il componente | la copia ha un nuovo id: nessuna prova, nulla viene copiato |
| Duplicare il progetto | nuovo id progetto: nessuna prova, nulla viene copiato |
| Cambiare progetto | la prova è letta con la chiave del progetto attivo; un altro progetto non la vede mai |
| Eliminare il progetto | restano; segnalati orfani se la lettura dell'archivio stabile è completa |
| Ricaricare la pagina | ripristinata dall'archivio sperimentale |
| Importare un componente | nuovo id se quello originale è occupato; mai una prova associata |

`material.preset`, `material.family` e il formato produttivo non vengono mai modificati.

## Limiti residui

- Nessun lock tra i due database: la verifica+spostamento non è atomica rispetto all'archivio stabile (la finestra è di pochi ms e lo spostamento è reversibile).
- L'upgrade del database non è reversibile: tornare a un build M6.4 con un database v2 apre in modalità memoria con avviso (VersionError → fallback dichiarato).
- Un conflitto sulla prova di un componente che si è appena lasciato (entro 400 ms dall'ultima modifica) non è mostrato all'utente.
