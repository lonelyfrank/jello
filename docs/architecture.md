# Architettura

Jello è un laboratorio di materiali per componenti UI. Il **runtime** è la parte che un progetto
consumatore importa; tutto il resto (editor, persistenza, relay, app di test) gli sta intorno e
non vi entra mai.

```
                 ┌───────────── src/runtime (pubblico, @jello/runtime) ─────────────┐
                 │  createGlassGroup (CSS, SVG)    createSceneView (WebGL2, lazy)   │
                 │        │                               │                         │
                 │   src/core  geometria · molla · interazione · SourceFilter SVG   │
                 │   src/model documento · famiglie · migrazioni · qualità · supporto│
                 └──────────────────────────────▲───────────────────────────────────┘
                                                │ stessa implementazione
       ┌──────────────────────┬─────────────────┼────────────────┬────────────────────┐
   src/stage              src/lab            src/preview     src/export        examples/navbar
   anteprima condivisa    editor React       pagina telefono  pacchetti         consumatore (solo
   (stage, scene,         + storage IDB      (senza editor)   (puro, no DOM)    pacchetto esportato)
    componenti demo)      + sync sender      + sync receiver
                                                 ▲
                                    tools/relay (solo sviluppo)   apps/android-preview (Capacitor)
```

## Moduli e confini

| Modulo | Contenuto | Può importare |
| --- | --- | --- |
| `src/model/` | documento `jello-material` v2 (Zod per l’involucro, tabella dei parametri per i valori), famiglie (Glass, Solid), registro dei materiali con capacità, stati e interazioni, migrazione da `jello-glass` v1, profili qualità, tabella di supporto per backend, preset inclusi | `src/core/descriptors`, `src/core/params`, `src/core/presets`, `zod` |
| `src/core/` | geometria e mappa di displacement, molla, interazioni (pressione, trascinamento), superficie, contesto, renderer SVG, CSS dei percorsi | niente fuori da `src/core` |
| `src/runtime/` | API pubblica: `GlassGroup` (CSS/SVG su DOM), `SolidGroup` (variabili CSS, nessun filtro), `createMaterialGroup` (un gruppo per famiglia), `MaterialBinding` (la superficie di una componente, di qualunque famiglia), `BottomNavigation` e `JelloButton` (renderer DOM delle componenti), `createComponent` (il renderer dal tipo), `createSceneView` (WebGL2, chunk separato), tipi | `src/core`, `src/model`, `src/components` |
| `src/components/` | modello delle componenti: formato canonico `jello-component-definition` ([Component Definition](component-definition.md): struttura · contenuti · layout · materiale · stati · interazioni), proprietà e vista derivata della Mobile Navbar, template, BottomNavigation (tipi, template, operazioni, responsive), icone e sanificazione SVG, registro dei tipi, Button (proprietà, risoluzione responsive, presentazione), registro dei componenti (`COMPONENTS`). Puro | `src/core`, `src/model`, `zod` |
| `src/migration/` | **solo ingresso**: conversione di `jello-component` v1 nel formato canonico e tabella degli identificativi di preset e template rimossi. Importato solo dal laboratorio e dagli importatori di progetto | `src/components`, `src/model`, `src/core` |
| `src/stage/` | anteprima condivisa: `PreviewController`, `Stage`, scene di prova, navbar, pulsante, card, pannello, dock, scena controllata, parsing dell’URL | runtime, core, model |
| `src/lab/` | editor React (Material Lab e Component Builder), store, sessione, IndexedDB, autosave, invio al relay, hook di ispezione | tutto tranne `src/preview` |
| `src/preview/` | pagina leggera per telefono e WebView | stage, runtime, `src/sync`, template di `src/export` |
| `src/sync/` | protocollo lab → anteprima (versionato, validato) | model, stage/view |
| `src/export/` | adapter di export (materiale con runtime o solo CSS, componente React + TypeScript, JSON), zip, esempi minimi | core, model, components |
| `tools/relay/` | relay di sviluppo (Node `http`, nessuna dipendenza) | — |
| `apps/android-preview/` | contenitore Capacitor che carica `preview.html` | build della preview |

I confini sono verificati da `tests/unit/boundaries.test.ts`: dal grafo degli import di
`src/runtime/index.ts` si raggiungono solo `src/core`, `src/model`, `src/components`, `src/runtime`
e il pacchetto `zod`; il modello delle componenti e gli exporter non raggiungono il DOM; il renderer
delle componenti arriva al materiale solo attraverso `MaterialGroup`; il backend WebGL2 è raggiunto solo con un `import()` dinamico; la pagina telefono non
raggiunge `src/lab` né React; l’exporter non raggiunge DOM né editor. Lo stesso test controlla il
build in `dist-lib/` (niente React, niente percorsi del laboratorio, niente source map nel
manifest). Altri confini: `src/migration/` si importa solo dal laboratorio e dagli importatori di progetto;
runtime pubblico, modello, exporter, stage, anteprima e libreria costruita non lo raggiungono né contengono
identificativi di altre applicazioni.

## Materiali e componenti

```
 jello-component-definition ──► BottomNavigation (runtime, DOM) ──► MaterialGroup ──► GlassGroup (SVG/CSS)
      │      ▲                      ▲          ▲                       ▲
      │      │ importComponent       │          └── navbar del Material Lab (template Mobile Navbar)
      │                    └── anteprima del Component Builder (stesso stage, stesso gruppo)
      └──► adapter di export ──► pacchetto React (wrapper + lo stesso runtime costruito)
```

Dettagli: [Component Builder e componenti](component-builder.md).

## Progetti

Il livello progetto (`src/project/`) è puro e senza DOM: tipi, documento `jello-project`, colori
(HEX · RGB · HSL · OKLCH, contrasto WCAG), modifica degli asset, pacchetto `.jello` (ZIP) e pianificazione
dell'import con i conflitti. `src/lab/projects.ts` lo collega allo storage e alla sessione. I
materiali e le componenti restano nei loro formati e portano solo un `projectId` nello store.
Dettagli: [Progetti, asset e flussi guidati](projects.md).

## Stato, React e ciclo di rendering

- Lo stato del laboratorio vive in uno store esterno (`src/lab/store.ts`); React lo legge con
  `useSyncExternalStore`.
- Le azioni (`src/lab/session.ts`) applicano ogni modifica **prima** al `PreviewController`
  (chiamata sincrona) e poi allo store: React ridisegna i pannelli, mai l’anteprima.
- Le pagine (Home, Asset, Impostazioni) e i flussi sono React puro. L'area Materiali/Componenti
  resta montata (nascosta con `hidden`) quando un'altra pagina è in primo piano, così l'anteprima
  non si ricostruisce; al ritorno la capsula si ricentra se il laboratorio è stato aperto altrove.
- Il contenuto della colonna centrale appartiene al controller: React fornisce solo il contenitore
  (`Preview.tsx`, `useLayoutEffect` → `session.mountPreview`).
- Il movimento gira sui loop `requestAnimationFrame` del runtime, attivi solo quando qualcosa si
  muove (molla, sorgente dinamica). Lo stato React non è mai il clock dell’animazione.
- I report dell’anteprima (percorso effettivo, mappe, metriche) arrivano allo store con un
  debounce di 120 ms, mai a ogni frame.

## Ciclo di vita delle risorse

| Oggetto | Creazione | Aggiornamento | Invalidazione | Sospensione | Distruzione |
| --- | --- | --- | --- | --- | --- |
| `GlassGroup` | `createGlassGroup({ source, material })` | `setMaterial(doc)` → `UpdateReport` (chiavi, stadi, mappe generate) | `invalidate()` (rimisura) | `suspend()/resume()`, automatica fuori schermo o con pagina nascosta | `destroy()`: filtri SVG, strati, observer, listener, loop |
| superficie | `group.attach(host, { sizing, radius, interaction })` | via gruppo | automatica (ResizeObserver) | via gruppo | `group.detach(surface)` |
| `SceneView` | `await createSceneView({ canvas, material, source })` | `setMaterial` (uniform; mappa solo se cambia la geometria), `setSource`, `setLens` | `invalidate()`, `resize()` | `suspend()/resume()`, automatica | `destroy()`: programmi, texture, framebuffer, query, listener, observer, loop |

Cambiare oggetto nell’anteprima smonta esplicitamente la superficie uscente; cambiare backend non
lascia listener né loop (test `tests/e2e/navbar.spec.ts` → *lifecycle*, `webgl.spec.ts`).
