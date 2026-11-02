# Adattamento dei design Jello

I cinque HTML forniti sono stati usati come riferimenti visivi per le viste React esistenti.

| Riferimento | Viste adattate |
| --- | --- |
| `Jello Material Lab.html` | Intestazione, libreria materiali, anteprima e inspector |
| `Jello Material Lab(1).html` | Home, primo avvio, pannelli di rendering e accessibilità |
| `Jello Material Lab(2).html` | Asset: colori, icone, font e selettore colore condiviso |
| `Jello Material Lab(3).html` | Nuovo progetto, importazione ed esportazione guidate |
| `Jello Material Lab(4).html` | Pulsanti, campi, etichette di stato, notifiche e riferimento UI nelle Impostazioni |

Le miniature dei materiali condividono lo sfondo viola dei design e riflettono tinta,
opacità, sfocatura e rifrazione del documento. L’inspector separa Aspetto, Ottica e
Luce e profondità. Negli asset, categorie e raccolte occupano un’unica colonna,
affiancata dalla griglia e dal dettaglio dell’elemento selezionato.

Inter, Fredoka e JetBrains Mono sono inclusi localmente in `public/fonts/`, con le
licenze originali in `OFL.txt`. La tipografia dell’interfaccia è separata dal contenuto
dell’anteprima. I temi chiaro e scuro usano gli stessi componenti.

## Anteprime

- [Materiali](screenshots/design-materials.png)
- [Home](screenshots/design-home.png)
- [Asset](screenshots/design-assets.png)
- [Mobile](screenshots/design-mobile.png)

Le immagini provengono dall’applicazione funzionante, con un progetto di esempio.

## Verifiche — 30 ottobre 2026

- TypeScript e build di produzione superati.
- 339 test unitari superati.
- Suite E2E mirate (`projects`, `builder`, `materials`, `params-io`, `export`):
  146 casi superati su Chromium, Firefox e Pixel 7 emulato; un caso escluso su mobile
  dalla suite esistente. I casi interrotti dalla chiusura del server locale sono stati
  ripetuti con successo dopo il riavvio.
- Controllo visivo di Home, primo avvio, materiali, componenti, colori, icone, font,
  impostazioni e wizard; temi chiaro e scuro; editor a 320, 360, 390, 768, 850,
  1024 e 1440 px. Nessuno sforamento orizzontale nelle viste controllate e nessun
  errore JavaScript durante il percorso di verifica.

## Allineamento alle viste «Jello Studio» — 2 novembre 2026

Il canvas di design è stato riletto vista per vista (Workspace, Component Builder,
Material Lab, Library, Preview & Test, Export) e l'interfaccia è stata riallineata
senza modificare logica, contratti o documenti.

| Area | Cambiamenti |
| --- | --- |
| Token | Palette viola scura del design (`#120b22` sfondo, `#130c25` pannelli, `#1a1230` campi, accento `#6d2bf0`), nuovi `--line-soft` e `--accent-edge`; tema chiaro invariato. |
| Shell | Intestazione più compatta, marchio «Jello Studio» (700/300), navigazione a pillole con stato attivo a bordo viola, pulsante primario con alone. |
| Workspace | Banner con bolle, titolo «Shape the Interface.» su una riga, contatori reali in sidebar (progetti, materiali, componenti), sezione «Inizia da qui» con schede centrate. |
| Builder / Material Lab / Preview | Segmenti e tab come nel design, barra degli stati, cursori con riempimento viola→magenta, interruttori e righe dell'albero. |
| Library | Tile con titolo e preferito in alto, anteprima in riquadro e pannello **Anteprima** a destra (apri nello Studio, esporta). |
| Export | Dialogo a tre colonne: contenuto per passo, anteprima pacchetto (riepilogo reale) e formato. Passi, id e adapter invariati. |

Non sono state introdotte funzioni assenti dall'app (cronologia, template, varianti,
registro eventi): le parti del mockup con dati dimostrativi restano fuori.
Screenshot aggiornati in `docs/screenshots/studio/`.

## Nuove viste «Jello Studio» (barra laterale e banner) — 2 novembre 2026

Il canvas è stato aggiornato con una seconda generazione di viste (Home, Component
Builder, Material Lab, Library, Preview & Test, Export, Asset); le precedenti restano nel
canvas come «Archivio». L'applicazione le segue vista per vista, senza modificare logica,
contratti, documenti o database.

| Area | Cambiamenti |
| --- | --- |
| Shell | L'intestazione superiore è sostituita da una **barra laterale** a icone di 84 px: marchio, **Crea** (nuovo progetto), Home, Builder, Materiali, Library, Test, Export, Asset, stato di salvataggio e Impostazioni. Su schermi stretti diventa una barra orizzontale scorrevole. |
| Banner di pagina | Ogni pagina apre con un banner a gradiente viola→magenta con titolo sfumato e, a destra, i comandi della pagina (progetto attivo, colonne, Salva, Esporta). Titoli: Component Builder, Material Lab, Preview & Test, «Colori, icone e font», Impostazioni, flussi guidati. |
| Pannelli | Libreria, canvas e inspector sono schede arrotondate (`--panel` `#170f2e`) su sfondo `#120b22`, non più colonne a tutta altezza. |
| Home | «Che cosa vuoi creare oggi?»: ricerca globale, schede Home / Template / Progetti, dodici scorciatoie circolari (Jelly «presto», disattivata), «Continua a creare» con filtri e anteprime runtime reali. Le scorciatoie che richiedono un progetto sono disattivate finché non ne esiste uno. Primo avvio: stesso banner, poi le tre scelte e il kit già esistenti. |
| Library | Banner «Una forma per ogni idea.» con filtro Glass/Solid e ricerca, categorie circolari con conteggi reali, griglia e pannello **Anteprima**. |
| Export | Il dialogo conserva i cinque passi e le tre colonne; titolo e passi sono nel banner del design. |
| Asset | Banner «Colori, icone e font»; l'accesso è dalla barra laterale. |
| Crea | Il tasto **+** della barra apre il pannello «Inizia a creare» (canvas `StudioCrea`): categorie a sinistra (Per te, Componenti, Navigazione, Materiali, Preset Jello, Asset, Da codice / JSON, Dimensioni personalizzate, Importa), ricerca, azioni rapide e schede con anteprime runtime reali. Template, materiali, preset e asset aprono ciò che esiste già; «Dimensioni personalizzate» imposta lo Stage libero e apre il Builder; «Importa» accetta `.jello` e `.json` (trascinamento incluso). |

Differenze volute dal mockup:

- Il profilo «Frank» in fondo alla barra non esiste nell'app: al suo posto c'è
  Impostazioni. Il progetto attivo si cambia dal banner (o dalla Home e dalla Library).
- Export resta un dialogo: la pagina a sé del mockup richiederebbe un nuovo flusso di
  navigazione. I passi, gli id e gli adapter sono invariati.
- Le barre degli strumenti di Builder, Material Lab e Preview restano sopra il canvas e non
  sono spostate nel banner, per non duplicare i controlli dello Stage condiviso.
- Home e Library mostrano solo dati reali (progetti, componenti, materiali dell'utente e
  template Jello): nessuna cronologia o voce dimostrativa. Le schede «Asset del progetto»
  e «Material Gallery» della vecchia Home sono state sostituite dalle scorciatoie e dalla
  scheda Template.
- Jelly resta in sviluppo: la scorciatoia è visibile ma non attiva.
- Nel pannello Crea ho aggiunto l'azione rapida **Nuovo progetto** (assente nel mockup): il tasto + è l'unico accesso al wizard dalla barra. Card e Input restano «In arrivo» come nel Builder; i preset «Cable .vetro» e «BT navbar» del mockup non sono nell'app e non compaiono. Le voci che richiedono un progetto sono disattivate finché non ne esiste uno.
- «Carica SVG» porta alla pagina Asset (icone): il flusso di importazione accetta solo `.jello` e `.json`.

Screenshot aggiornati in `docs/screenshots/studio/` (vedi anche [Crea](screenshots/studio/crea-desktop.png)). Verifica del 2 novembre 2026: TypeScript, 595 test unitari e l'intera suite E2E locale (Chromium, Firefox, Pixel 7 emulato) superati: 699 passati, 3 saltati come previsto, nessun fallimento.
