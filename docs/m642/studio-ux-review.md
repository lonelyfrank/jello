# M6.4.2 — Studio UX / usabilità

Metodo: visita di ogni area con browser isolato (profilo vuoto), sonde DOM (`docs/m642/tools/*.mjs`, ora test permanenti in `tests/e2e/m642-*.spec.ts`), lettura del codice, screenshot (`screenshots/`, confronto con `origin/main` in `visual-diff.json`). Non è uno studio con utenti: «un nuovo utente comprende…» è una valutazione dell'interfaccia, non una misura di comprensione.

## 1. Navigazione e aree raggiungibili (§10.1)

| Area | Raggiungibile da | Perde lo stato? |
|---|---|---|
| Workspace (Home) | rail, logo | no: filtri e vista Home sono locali al componente |
| Component Builder | rail, tile Home (Button/Navbar), Library «Apri» | no: selezione e componente sono nello store della sessione |
| Material Lab | rail, tile Home (Glass/Solid), Library | no |
| Library | rail, tile Home, «Mostra tutto» | selezione e filtri: locali alla pagina, ripartono da «Tutti» (accettato) |
| **Jello β** | rail, **tile Home (ora funzionante)**, Library (famiglia Jello) | la bozza sperimentale è in `jello-lab-experimental` (bozza + copie), non nello store |
| Preview & Test | rail, tile Home | no |
| Export | rail, tile Home, Library «Esporta…» (flusso modale) | n/a |
| Asset | rail, tile Home | no |
| Impostazioni | rail | no |

Percorsi irraggiungibili: **nessuno**, ma senza progetto sono bloccate tutte le aree tranne Home e Impostazioni. È una scelta di prodotto (ogni creazione appartiene a un progetto; Library e Jello lab salvano preferiti/copie *per progetto*). Prima di M6.4.2 il blocco era muto (M642-02); ora ogni voce bloccata è focalizzabile, dice «Serve un progetto: crealo o importalo dalla Home» (testo associato con `aria-describedby`) e la Home riporta la stessa spiegazione in chiaro. `?studio=library` e `?studio=jelly` funzionano ancora senza progetto per chi arriva da un URL (usato dai test).

Verificato in 6 viewport + landscape basso (320×640, 390×844, 768×1024, 844×390, 1024×768, 1440×900): tutte le 8 aree si aprono dalla rail dopo la creazione del progetto, senza overflow orizzontale, senza `id` duplicati, senza controlli senza nome, un solo `<h1>` visibile, 0 errori console (`m642-a11y.spec.ts`, 6 test).

## 2. Primo avvio (§10.3)

- Stato vuoto: tre vie (Progetto vuoto, Parti da un preset incluso, Importa un file) + area di rilascio file + Material Gallery.
- **Nessun contenuto fittizio viene salvato da solo**: all'avvio l'unico database è `jello-lab` (vuoto); un progetto nasce solo da un'azione («nessun progetto dimostrativo viene aggiunto senza la tua scelta», testo della pagina). Verificato in `audit/first-launch.mjs`: `indexedDB.databases()` = `[jello-lab]`, nessun progetto.
- Dopo M6.4.2 il kit crea **3** materiali personali (Default, Frosted, Refractive) e la navbar di esempio; non copia più la diagnostica (M642-03). Il wizard del kit propone gli stessi 3 chip + «Navbar».
- Primo salvataggio e ritorno al Workspace: `projects.spec.ts` («survives a reload», «Return to Home»), `studio-completion.spec.ts`.

## 3. Gerarchia visiva e densità (§10.2)

Lo Stage resta il centro: in Material Lab e Builder la rail è 83 px, l'Inspector 336 px (ridimensionabile e richiudibile, preferenze in `studio-preferences`, ripristino del layout in Impostazioni; `studio-redesign.spec.ts`). Nessuna sovrapposizione di pannelli e nessuna sezione che scompare in 7 viewport. Da screenshot (`studio-desktop-*`): titoli di pagina, bottoni primari (viola), azioni distruttive («Elimina…» in menu con conferma `alertdialog`), messaggi informativi e di errore sono coerenti fra loro. Tema: la chrome è scura; lo Stage segue lo schema colore (verificato con scene chiaro/scuro).

Giudizi di sola interfaccia, **non** correzioni:
- Nel Builder la sezione «Prova Jello · sperimentale» sta dentro l'Inspector del Button: va aperta per vederla; è coerente con «sperimentale, non esportabile».
- Library: «Runtime CSS · anteprima» ripetuto su ogni card è rumore (catalog-validation §4).
- Home: 12 tile con icone diverse; «Jello β» ha un tag «β» sopra l'icona.

## 4. Feedback di stato (§10.4)

Stati mostrati nella rail (`#saveStatus`, `role="status"`): Locale/«Nessuna modifica», In attesa/«Modifiche in attesa…», «Salvataggio…», **Salvato alle HH:MM:SS** (solo a conferma della scrittura: `saved` arriva dall'Autosaver a commit completato), «Non salvato», «Non salvato: spazio esaurito», «Non persistente: solo questa scheda». Conflitti: banner con scelta esplicita (Jello lab, `#jl-conflict`); import: «Importazione completata» / elenco motivi di rifiuto; funzionalità non supportata: aree disabilitate con motivo, campi `inactive`/`disabled` con nota, backend «ignorato/approssimato».

Limite individuato e **non** corretto (P2): nell'area Jello β la rail mostra lo stato di salvataggio del **database stabile**; lo stato dell'archivio sperimentale è nel pannello Jello (`#jl-save-status`). Sono due archivi distinti, ma l'icona in rail potrebbe far pensare che «Salvato» valga anche per la bozza Jello.

## 5. Accessibilità: vedi `accessibility.md`.

## 6. Cosa non è stato fatto

- Nessuna sessione con utenti reali, nessun eye-tracking, nessun test di comprensione del testo.
- Nessuna revisione tipografica/spaziatura sistematica: sono stati corretti solo problemi concreti.
- Il tema chiaro della chrome dello Studio non esiste (la chrome è scura): non è stato valutato «tema scuro vs chiaro» della chrome, solo dello Stage.
