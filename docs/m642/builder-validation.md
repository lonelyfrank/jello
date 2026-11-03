# M6.4.2 — Component Builder: coerenza

Componenti verificati: **Button, Mobile Navbar, Desktop Navbar**. Nessun componente è stato aggiunto.

## 1. Struttura, selezione, salvataggio (§9.2)

Coperto da prove esistenti, tutte passate nella baseline e nella verifica finale (citate per titolo):

| Operazione | Prova |
|---|---|
| aggiungere, duplicare, riordinare, rimuovere, raggruppare, nascondere, cambiare materiale, salvare/riaprire, esportare in entrambi i formati | `navbar-structure.spec` «canonical Builder flow…» |
| Desktop Navbar: creare, modificare brand/voci/regioni/gruppi/azioni/layout, salvare/riaprire, esportare | `desktop-builder.spec` «create Desktop visually…» |
| gruppi logici evidenziano la geometria, la selezione resta | `desktop-builder.spec:115` |
| selezione da Stage seleziona controlli disabilitati e azioni da tastiera **senza** cambiare la definizione | `desktop-builder.spec:150` |
| selezione nell'albero rivela i controlli in overflow della regione | `desktop-builder.spec:167` |
| il pick nella Preview & Test torna all'Inspector esistente | `desktop-builder.spec:183` |
| flusso completo Mobile Navbar: modifica, salva preset e componente, riapri, esporta | `builder.spec:65` |
| breakpoint che seguono il frame di anteprima; molte tab in una pista scorrevole | `builder.spec:177, 195` |
| componente v1 reale convertito, resta personale e non viene mai cancellato; link di template vecchi | `builder.spec:219-234` |
| materiale personalizzato nel Material Lab usato, seguito e risincronizzato dai componenti | `builder.spec:269` |
| Solid: modifica Button, salva materiale e componente, ricarica, segue il preset rivisto, esporta React e Vanilla | `studio-completion.spec:49` |
| bozze di lavoro sopravvivono a un reload immediato | `studio-completion.spec:151` |
| override locali conservati finché non si aggiorna esplicitamente dal preset | `studio-completion.spec:168` |
| stati non supportati dal materiale non creano override non validi o inefficaci | `studio-completion.spec:185` |
| `navbar-structure.test.ts` (40), `components.test.ts` (47), `button.test.ts` (30), `definition.test.ts` (30) | operazioni pure sul modello canonico |

## 2. Cambio materiale Glass ↔ Solid (§9.4) — **nuovo in M6.4.2**

`tests/e2e/m642-builder.spec.ts` (3 test, Chromium): per ciascuno dei tre componenti, **Glass → Solid → Glass → Solid → Glass**. A ogni passo il documento canonico — privato di `material`, `meta` e `id`, cioè tutto ciò che un cambio di famiglia non deve toccare — è **identico** a quello di partenza (contenuti, etichette, icone, struttura, layout, responsive, stati, interazioni), e il componente montato è dello stesso tipo, nella famiglia richiesta, e `mounted`. Le proprietà specifiche del materiale (`unsupported`) sono risolte dal registro senza introdurre valori incompatibili (`components.spec:79`, `studio-completion.spec:126`).

La prova di Jello nel Builder **non** è un cambio di famiglia: con la prova attiva (o con il chunk non caricato) il documento è byte-identico, `material.family`/`material.preset` invariati, nessun record nel database stabile (`jelly-studio.spec:345`; `m642-resilience.spec › the Builder trial chunk fails…`).

## 3. Responsive (§9.5) — **nuovo in M6.4.2**

`m642-builder.spec.ts` (5 test): per ognuno dei 3 componenti a 1440×900, 1024×768, 768×1024, 390×844, 320×640: nessun overflow orizzontale della pagina, nessun bersaglio interattivo **fuori dallo Stage**, nessun bersaglio **troncato** (`scrollWidth > clientWidth`) e nessun bersaglio sotto 24×24 px (minimo WCAG 2.2 · 2.5.8). Tutti passano. Per Mobile Navbar/Desktop Navbar sono 3 e 6 bersagli.

Non verificato: «Desktop compatto» e «tablet landscape» come classi distinte oltre 1024×768 e 768×1024 (i valori scelti sono i due estremi); target da 44 px (raccomandazione, non requisito AA); testo troncato *visivamente* con `text-overflow` (ho verificato `scrollWidth`, non i pixel).

## 4. Inspector contestuale (§9.3)

L'Inspector è generato dai descrittori del componente (`components/fields.ts`, `registry.unsupported(family)`): un elemento riceve solo i campi del suo tipo; i controlli non applicabili sono disabilitati con motivo o assenti (`studio-completion.spec:185`; `navbar-structure.spec` «switch material»). Le modalità Base e Avanzata mostrano gli stessi valori e cambiano solo la visibilità (`studio-completion.spec:22`: «Base/Advanced and zoom preserve the definition»).

**Corretto in M6.4.2**: il campo «Raggio (px)» non aveva un nome accessibile corretto (M642-12); il messaggio di un numero rifiutato ora dice l'intervallo (M642-13). **Non corretto** (rinviato): i campi numerici del Builder non hanno ripristino per singolo campo né frecce ↑/↓, a differenza dei campi del Material Lab (M642-13).

## 4.1 Modello canonico (§9.6)

Il Builder non mantiene una rappresentazione modificabile parallela: `session.state.builder.doc` è il `ComponentDefinition` (jello-component-definition v1) e ogni vista (`navbarView`, `resolveButton`, `navbarPresentation`) è derivata e sola lettura (`hook.builder.view`: «The derived, read-only view»). L'esportazione JSON canonica (`componentJson()`) è la stessa definizione. Nessuna conversione lossy individuata durante le modifiche; l'equivalenza dopo Glass↔Solid (sopra) è la prova diretta.
