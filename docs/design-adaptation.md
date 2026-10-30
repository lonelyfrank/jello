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
