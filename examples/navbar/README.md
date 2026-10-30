# Esempio consumatore: navbar glass

Una navbar in basso sopra contenuto che scorre (tab attiva, pressione, tastiera), costruita
**solo** con il pacchetto esportato: runtime costruito e `material.json` in `./jello/`. Non importa
sorgenti del laboratorio, React o il relay. I dati sono di esempio.

```sh
npm run example:prepare   # build:lib + pacchetto del preset "navbar" in examples/navbar/jello/
npm run example:serve     # http://127.0.0.1:4175/
```

`jello/` è generata (e ignorata da git): è lo stesso contenuto dello zip “Pacchetto con runtime”
del laboratorio. Per provare un materiale esportato dal laboratorio:

```sh
node scripts/prepare-example.mjs --material ~/Scaricati/mio-materiale.jello.json
```

Parametri dell’URL: `?backend=css` forza il backend CSS, `?material=./altro.json` carica un altro
documento.

Struttura:

- `.content` è la **GlassSource**: opaca, scorre al proprio interno;
- `nav.tabbar` sta **fuori** dalla sorgente: una sola superficie (`group.attach(nav, { interaction: 'press' })`);
- `.tab-indicator` è uno strato visivo, non una seconda lente;
- selezione (`aria-current`) e pressione (`data-pressed`, luce di contatto) sono separate.

Ciclo di vita: `createGlassGroup` → `attach` → `setMaterial` (se cambia) → `destroy()` (rimuove
filtri, strati, observer, listener).
