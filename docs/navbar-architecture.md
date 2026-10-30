# Navbar Architecture — M5.1

Il Navbar Structure Engine modifica direttamente `jello-component-definition` v1.
Mobile e Desktop condividono identità, contenuti, azioni, gruppi e operazioni;
mantengono profili di layout distinti. Non esistono un documento navbar, un
registro o un Inspector aggiuntivi. [Audit iniziale](navbar-audit.md).

## Contratto e responsabilità

| Dato | Sezione canonica |
| --- | --- |
| Identità e ordine | `structure`: nodi `{ id, role, children? }` |
| Etichetta e icona | slot `label`/`icon`, relativi `content.<slotId>.text`/`.icon` |
| Valore applicativo | `content.<itemId>.value`, ripetibile, non usato come identità |
| Visibilità e disponibilità | `content.<itemId>.visible` e `.disabled`, default true/false |
| Azione | `content.<itemId>.action`, discriminante `kind` |
| Accessibilità e posizione icona | `.accessibleLabel`, `.description`, `.iconPosition` (`start/end/top/bottom`, assente = eredita) |
| Gruppi | nodi `group` sotto la radice; etichetta opzionale in `content.<groupId>.text` |
| Layout e regioni Desktop | `layout`; `layout.regions.<rootChildId>` = `start/main/end` |
| Responsive | `responsive.breakpoints`, medesime soglie e precedenza delle navbar precedenti |
| Materiale | `material` e `states.<state>.material`, risolti dal Material Registry |
| Stili degli stati | `states.<state>.style`, configurazione degli stili, non stato corrente |
| Selezione iniziale e comportamento | `interactions.behavior.defaultItem/semantics/…` |
| Nomi degli eventi | `interactions.events`, incluso `action` opzionale |

I tipi pubblici sono `NavbarAction`, `NavbarItem`, `NavbarGroup`,
`NavbarDefinition`, `MobileNavbarDefinition`, `DesktopNavbarDefinition`,
`DesktopNavbarLayout`, `NavbarRuntimeState`. `isNavbarDefinition` restringe il
tipo di una definizione. `navbarItems` e `navbarGroups` sono letture derivate,
mai serializzate come documenti alternativi. Le icone sono gli stessi `IconRef`
e SVG allowlist del resto del progetto; nessun HTML libero.

Gli ID sono univoci **fra tutti i nodi** della definizione (anche slot e gruppi).
Non dipendono da testo, indice, `value` o URL. Un duplicato riceve ID nuovi anche
per gli slot, ma conserva valore, contenuti, azione e stili. Un riordino conserva
gli ID. L'API storica del Builder aggiunge «(copia)» al testo per riconoscibilità;
l'operazione canonica conserva il testo esatto.

## Gruppi limitati, con significato

È esteso l'albero già esistente: `navbar → item | group → item → icon/label`.
`brand` e `action` Desktop restano nella radice. Gruppi annidati, brand o azioni
dentro un gruppo sono rifiutati. Il totale è 1–200 voci `item`, anche attraverso
i gruppi; Desktop conserva inoltre massimo un brand e quattro azioni.

Il gruppo possiede ID stabile, ordine nella radice, etichetta opzionale e ordine
interno delle voci. Può essere vuoto mentre si costruisce la navigazione.
Scioglierlo inserisce i membri nella sua posizione, senza cancellarli. Desktop
può assegnargli una regione: tutti i membri la ereditano; un trasferimento da
una regione diversa è rifiutato. Scioglierlo conserva la regione sui membri.

Questo riutilizza slot, validazione e serializzazione già presenti, evitando
liste parallele di appartenenza e ordine da tenere sincronizzate. La profondità
è fissa. Un gruppo non è un dropdown: su Mobile il renderer appiattisce le voci
in ordine, espone `data-group` e conserva la geometria della barra.

## Azioni e runtime

```ts
type NavbarAction =
  | { kind: 'select' }
  | { kind: 'navigate'; href: string; target?: '_self' | '_blank' }
  | { kind: 'consumer'; name: string };
```

- `select`: pulsante, stessa selezione controllata/non controllata, `change` e
  `reselect` delle versioni precedenti.
- `navigate`: vero `<a href>`; il browser segue il link. Non modifica la tab
  selezionata. Sono ammessi percorsi `/…`, ancore `#…` e URL http(s) validi,
  inclusi indirizzi `//host/percorso` già ammessi dai documenti precedenti;
  schemi diversi, backslash, controlli, spazi e credenziali URL sono rifiutati.
  `_blank` imposta `rel="noopener noreferrer"`. Un link disabilitato perde
  `href`, non può essere attivato e non entra nel percorso delle frecce.
- `consumer`: pulsante, nessun cambiamento automatico di selezione;
  `onAction(id, event)` riceve `event.action.name` e `event.value`.

Tutte le attivazioni riportano anche `onAction(id, NavbarActionEvent)` e un
CustomEvent che usa `interactions.events.action` oppure `jello-action`. Gli
eventi precedenti mantengono forma e significato. `press` resta l'inizio della
pressione; `action` è l'attivazione. La definizione contiene solo dati; i
callback appartengono a `BottomNavigationOptions` o alle props esportate.

L'assenza di `action` significa **selezione storica**, anche se una vecchia voce
contiene `href`: importare un documento non inizia a navigare. Se `href` e
un'azione esplicita coesistono devono descrivere la stessa navigazione; il setter
di azione rimuove il vecchio `href`. `navigate` con semantica `tabs` è rifiutato:
la destinazione di un link non è un pannello tab.

`defaultItem` è la preferenza iniziale. `navbarActiveItem` sceglie fra voci
visibili, abilitate e con azione di selezione o navigazione: ID preferito, default, prima voce
disponibile. Se non ce ne sono restituisce `''` e il runtime non disegna
l'indicatore. Nascondere o disabilitare tutte le voci è rappresentabile; non
equivale a eliminare l'ultima voce strutturale. Le operazioni che rimuovono o
rendono indisponibile il default aggiornano esplicitamente la preferenza.
Un aggiornamento del runtime conserva la selezione corrente se ancora valida.
Un router può chiamare `setActiveTab(id)` anche per un link, indicando la pagina
corrente. Seguire il link non imposta automaticamente questa selezione.

Hover, focus e pressed vivono soltanto nel runtime. Tentare di scriverli in
`NodeContent` viene rifiutato. Le voci nascoste restano nel documento e
nell'albero del Builder ma vengono rimosse dal DOM della navbar. Un'azione
esplicita senza etichetta richiede un nome accessibile; le vecchie voci Mobile
con sola icona continuano a essere importate.

## Operazioni pubbliche

Tutte esportate da `src/components` e `@jello/runtime`. Prendono una definizione
e restituiscono una nuova definizione dello stesso tipo. Le operazioni che
creano un nodo restituiscono `{ definition, id }`.

| API | Effetto |
| --- | --- |
| `addNavbarItem(def, patch?, { groupId?, index? }?)` | Nuova voce; indice fra tutti i figli del contenitore; default in fondo |
| `updateNavbarItem(def, id, patch)` | Testo, icona, posizione icona, valore, accessibilità, visibilità, disabled, azione |
| `duplicateNavbarItem(def, id)` | Copia completa dopo l'originale nello stesso contenitore |
| `removeNavbarItem(def, id)` | Elimina voce e slot, contenuti e override per ID |
| `moveNavbarItem(def, id, index)` | Sposta fra i fratelli, inclusi i gruppi nella radice |
| `reorderNavbarItems(def, ids, groupId = null)` | Permutazione esatta delle voci del contenitore; posizioni dei gruppi ferme |
| `setNavbarItemVisibility/Disabled/Action` | Setter specializzati |
| `addNavbarGroup(def, label?, index?)` | Gruppo logico nella radice |
| `removeNavbarGroup(def, id)` | Scioglie il gruppo, preservando membri e ordine |
| `moveNavbarGroup(def, id, index)` | Riordina il gruppo nella radice |
| `moveNavbarItemToGroup(def, id, groupId, index?)` | Trasferimento; `null` porta nella radice |
| `setDesktopNavbarField/getDesktopNavbarField` | Accesso ai campi del profilo Desktop |
| `setDesktopNavbarRegion(def, rootChildId, region)` | Assegna start/main/end; `null` ripristina la regione principale |
| `resolveDesktopNavbar(def, width)` | Definizione con override applicati e ID breakpoint, senza rendering |

Voci o gruppi inesistenti, indici non interi/fuori intervallo, permutazioni
incomplete/duplicate, destinazioni non sicure, appartenenze incompatibili e
rimozione dell'ultima voce richiesta sollevano `NavbarStructureError` con
`errors: string[]`. Nessun clamp o correzione silenziosa nelle nuove API.
`LabSession` traduce questi errori nei messaggi del Builder senza salvare
modifiche parziali. Le vecchie funzioni sulla vista `*Tab` conservano le loro
politiche pubbliche di no-op/clamp.

Le operazioni richiedono definizioni canoniche (da costruttori o import).
Se il parser dovrebbe aggiungere default, normalizzare SVG o sostituire icone
sconosciute, l'operazione rifiuta il dato e chiede di importarlo esplicitamente.
Il chiamante può così esaminare gli avvisi prima di modificare il documento.
I setter Desktop seguono la convenzione esistente `def | null`.

Le operazioni verificano il risultato con il parser canonico ma restituiscono
l'oggetto modificato, preservando le sezioni non interessate e le estensioni
che il parser tratta come sconosciute con un avviso. L'import mantiene la
politica preesistente: chiavi sconosciute eliminate con avviso, dati invalidi
rifiutati. Non vengono recuperati campi che erano già stati scartati da una
migrazione precedente. Binding e parametri personali del materiale, stili
degli stati, responsive ed eventi non attraversano un modello intermedio.

## Layout e responsive distinti

Mobile mantiene ancoraggio, posizionamento inferiore, offset, geometria,
indicatore, animazioni, etichette e semantica tab. `BnRoot` resta la vista
specifica del renderer e un adattatore per le API precedenti, ora capace di
conservare contenuti estesi e gruppi. Le operazioni del Builder agiscono sulla
definizione, non ricostruiscono la struttura a partire dalla vista.

Desktop dichiara `orientation: horizontal`, allineamento, distribuzione,
altezza, padding, gap, larghezza, raggio, etichette, icone, compattezza e regioni
iniziali/finali. Non eredita `anchor`, `placement` e `offset` Mobile. Dispone
degli stessi stili di contenuto/stato e azioni. Il binding Glass/Solid si può
cambiare anche su una definizione Desktop, ma ciò non la rende renderizzabile.

Le proprietà additive Mobile `layout.icons`, `.distribution`, `.compact` sono
opzionali in import per preservare i vecchi file; i componenti nuovi ne
scrivono i default. `icons: hide` nasconde l'icona; `compact: true` limita padding
a 4 px e gap a 2 px, mantenendo altezza e target; `distribution` dispone le voci
uniformemente oppure all'inizio, al centro, alla fine o con spazio fra esse.

I breakpoint mantengono ID, `maxWidth` (200–2000 px) e override per percorso
canonico. Si applicano quelli corrispondenti dal più ampio al più stretto;
quello più stretto vince. Nessuna soglia nuova né conversione automatica
Desktop → Mobile. Sono sovrascrivibili visibilità etichette/icone, spaziature,
allineamento, dimensioni, distribuzione e compattezza. Per Desktop non sono
ammessi gli override di posizionamento inferiore.

## Esempi utilizzabili

```ts
import {
  componentTemplate, addNavbarGroup, moveNavbarItemToGroup,
  addNavbarItem, setNavbarItemAction, serializeDefinition,
  starterDefinition, setDesktopNavbarField, parseDefinition,
} from '@jello/runtime';

let mobile = componentTemplate('mobile-navbar')!.create();
const group = addNavbarGroup(mobile, 'Personale');
mobile = moveNavbarItemToGroup(group.definition, 'profile', group.id);
const link = addNavbarItem(mobile, { label: 'Documenti' }, { groupId: group.id });
mobile = setNavbarItemAction(link.definition, link.id,
  { kind: 'navigate', href: '/docs', target: '_self' });
serializeDefinition(mobile); // unico jello-component-definition, v1

let desktop = starterDefinition('desktop-navbar');
desktop = setDesktopNavbarField(desktop, 'layout.height', 80)!;
desktop = { ...desktop, layout: { ...desktop.layout,
  regions: { brand: 'start', signin: 'end' } } };
parseDefinition(desktop); // valido, nessun renderer Desktop in M5.1
```

La parte strutturale del JSON prodotto è, per esempio:

```json
{
  "id": "root", "role": "navbar", "children": [
    { "id": "home", "role": "item", "children": [
      { "id": "home-icon", "role": "icon" },
      { "id": "home-label", "role": "label" }
    ] },
    { "id": "group", "role": "group", "children": [
      { "id": "profile", "role": "item", "children": [
        { "id": "profile-label", "role": "label" }
      ] }
    ] }
  ]
}
```

Etichette, icone e azioni rimangono in `content`, non in questo albero.

## Inspector e integrazione M5.2

`definitionFields(type)` restituisce il profilo del tipo;
`definitionFields(type, 'item' | 'brand' | 'action' | 'group')` restituisce
descrittori per i nodi. I segnaposto `$item`, `$label`, `$group` sono sostituiti
dall'host con gli ID dei nodi. `section`, `level: base/advanced` e
`scope: common/mobile-navbar/desktop-navbar` preparano lo stesso Inspector:
struttura, contenuto, layout, aspetto (con tipografia), materiale, stati e
interazioni, responsive, accessibilità. Nessuna persistenza del livello UI.

M5.1 rende utilizzabili nel Builder Mobile gruppi, assegnazione delle voci,
visibilità, azioni esplicite e testi accessibili. Non aggiunge drag-and-drop,
dropdown, nesting arbitrario o un editor Desktop. L'ordine dei gruppi si
modifica tramite API; il pannello attuale permette creazione e scioglimento.

Per M5.2: implementare un renderer Desktop che legga questi nodi/regioni,
aggiungere la sua voce a `runtime/components.ts` e `COMPONENTS` con le
capability reali, un template e i controlli di anteprima Desktop. Verificare
stili e accessibilità nel browser prima di abilitarne gli export. I due export
attuali condividono il runtime; React espone anche `onAction`, Vanilla usa
direttamente `BottomNavigationOptions`. Non serve un altro modello strutturale.

## Compatibilità e limiti

- Nessun incremento di schema o store IndexedDB: estensione additiva v1.
  Nessuna riscrittura automatica dei documenti v1 validi esistenti.
- Le tre fixture legacy continuano a produrre esattamente la vista precedente,
  inclusi SVG, ID, disabilitazioni, breakpoint, eventi e materiale personale.
- Le vecchie distribuzioni React/Vanilla già esportate sono autonome e non
  cambiano. Le nuove includono le API estese nello stesso runtime.
- La validazione URL è più rigorosa per indirizzi malformati o ambigui;
  `javascript:`, `data:`, `file:`, backslash e credenziali vengono rifiutati.
- Desktop è un contratto validato e modificabile via API, **non** una componente
  disponibile nell'editor o negli export React/Vanilla. Nessun Jelly.
- WebKit/Safari e dispositivi fisici non sono verificati in questa milestone.

Test ed esiti effettivi: [Compatibilità](compatibility.md).
