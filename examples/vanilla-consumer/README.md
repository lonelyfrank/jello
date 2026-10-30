# Consumatore Vanilla indipendente

`npm run vanilla:prepare` esporta Button e Mobile Navbar con Glass e Solid, più il materiale Solid autonomo. I file sono generati dagli stessi adapter dello Studio, con il runtime costruito in `dist-lib`.

`npm run vanilla:serve` avvia il server su http://127.0.0.1:4177/. Apri un esempio: HTML, CSS e moduli ES senza React, npm install o build nel progetto consumatore. Ogni esempio permette destroy/mount; i componenti conservano eventi, stati, responsive e comportamento dei materiali.

La preparazione verifica anche i tipi pubblici dei cinque pacchetti. I test E2E confrontano runtime e comportamento con lo Studio e verificano tastiera, preferenze di accessibilità e lifecycle. Le verifiche desktop/emulate non certificano Safari né Android fisico.
