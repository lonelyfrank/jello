# Progetto esterno di prova (React + TypeScript)

Un’app Vite + React che **non** conosce Jello Studio: installa il pacchetto React esportato
(`vendor/jello-bt-darts-react`, uguale allo zip «Componente React + TypeScript» del laboratorio) con
`npm install` e lo usa come una dipendenza qualsiasi.

```sh
npm run consumer:prepare   # dalla radice: build:lib, export del template BT Darts personalizzato, npm install, typecheck, build
npm run consumer:serve     # http://127.0.0.1:4176/
```

Per provare una navbar salvata nel builder: esporta il JSON della componente e
`node scripts/prepare-consumer.mjs --component ~/Scaricati/mia.jello-component.json`
(il nome del pacchetto resta `@jello-export/<id>`: aggiorna `package.json` e gli import se l’id cambia).

Cosa verifica (`tests/e2e/react-consumer.spec.ts`): typecheck del pacchetto (`index.d.ts`) e del
sorgente TSX incluso, build di produzione, una superficie di materiale sulla barra con la rifrazione
della GlassSource, tab e configurazione dell’export, modalità controllata, eventi, tastiera.

`vendor/`, `node_modules/` e `dist/` sono generati (ignorati da git).
