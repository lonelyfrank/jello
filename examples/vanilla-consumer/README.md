# Consumatore Vanilla indipendente

`npm run vanilla:prepare` esporta Button, Mobile Navbar e Desktop Navbar con Glass e Solid, più il materiale Solid autonomo. I file sono generati dagli stessi adapter dello Studio, con il runtime costruito in `dist-lib`.

`npm run vanilla:serve` avvia il server su http://127.0.0.1:4177/. Apri un esempio: HTML, CSS e moduli ES senza React, npm install o build nel progetto consumatore. Ogni esempio permette destroy/mount; i componenti conservano eventi, stati, responsive e comportamento dei materiali.

La preparazione verifica anche i tipi pubblici dei sette pacchetti. I test E2E confrontano runtime e comportamento con lo Studio e verificano tastiera, preferenze di accessibilità e lifecycle. Le verifiche desktop/emulate non certificano Safari né Android fisico.

Desktop glass/solid aggiungono brand, gruppi riordinati, link e consumer action. I test Desktop confrontano geometria/stili con lo Stage e verificano mount/update/setActiveItem/unmount/destroy senza React.
