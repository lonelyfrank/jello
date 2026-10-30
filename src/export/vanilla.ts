/** Framework-free packages. Only a lifecycle wrapper: rendering stays in runtime/. */
import { COMPONENTS, resolveDefinitionMaterial, serializeDefinition, unsupportedProperties, type ComponentDefinition } from '../components';
import { RUNTIME_VERSION, serializeMaterial, type SolidDocument } from '../model';
import { escapeHtml } from './example';
import { candidates, sha256Hex, type PackageFile, type PackageResult, type RuntimeBundle } from './package';
import { reactNames } from './react';

const enc = new TextEncoder();

function checkRuntime(runtime: RuntimeBundle): void {
  for (const f of runtime.files) {
    if (f.path.includes('..') || f.path.startsWith('/') || f.path.includes('\\') || /(^|\/)src\//.test(f.path)) throw new Error(`Percorso del runtime non ammesso nel pacchetto: ${f.path}`);
  }
  for (const path of ['jello.js', 'jello.css', 'types/runtime/index.d.ts']) {
    if (!runtime.files.some((f) => f.path === path)) throw new Error(`Runtime incompleto: ${path} mancante (npm run build:lib).`);
  }
}

async function finish(root: string, files: PackageFile[], manifest: Record<string, unknown>, warnings: string[]): Promise<PackageResult> {
  const listed = await Promise.all(files.map(async (f) => ({ path: f.path.slice(root.length + 1), bytes: f.data.length, sha256: await sha256Hex(f.data) })));
  const complete = { ...manifest, files: listed };
  files.push({ path: `${root}/jello-manifest.json`, data: enc.encode(JSON.stringify(complete, null, 2) + '\n') });
  return { root, files, manifest: complete as unknown as PackageResult['manifest'], warnings };
}

export async function buildVanillaPackage(input: { component: ComponentDefinition; runtime: RuntimeBundle; now?: string }): Promise<PackageResult> {
  const { component: doc, runtime } = input;
  if (!COMPONENTS.get(doc.type)?.export.formats.includes('component-vanilla')) throw new Error(`Export Vanilla non disponibile per ${doc.type}.`);
  checkRuntime(runtime);
  const material = resolveDefinitionMaterial(doc);
  const root = reactNames(doc).root.replace(/-react$/, '-vanilla');
  const files: PackageFile[] = [];
  const add = (path: string, data: string | Uint8Array) => files.push({ path: `${root}/${path}`, data: typeof data === 'string' ? enc.encode(data) : data });
  const warnings = unsupportedProperties(doc).map((u) => `${u.path}: ${u.reason}`);
  if (material.family === 'glass' && material.source.kind === 'texture') warnings.push('Sui componenti DOM la texture WebGL2 non è campionata: si usa SVG/CSS, come nello Studio.');
  add('component.json', serializeDefinition(doc) + '\n');
  add('material.json', serializeMaterial(material) + '\n');
  for (const f of runtime.files) add(`runtime/${f.path}`, f.data);
  add('index.js', `import { createComponent } from './runtime/jello.js';
export const config = ${serializeDefinition(doc)};
export const material = ${serializeMaterial(material)};
/** Mount the same renderer as Jello Studio. Call update(), unmount()/mount(), destroy(). */
export function mount(options) {
  const instance = createComponent({ ...options, config: options.config ?? config });
  try { instance.mount(); return instance; }
  catch (error) { instance.destroy(); throw error; }
}
`);
  const options = doc.type === 'button' ? 'JelloButtonOptions' : 'BottomNavigationOptions';
  const instance = doc.type === 'button' ? 'JelloButton' : 'BottomNavigation';
  add('index.d.ts', `import type { ComponentDefinition, MaterialDocument, ${options}, ${instance} } from './runtime/jello.js';
export declare const config: ComponentDefinition;
export declare const material: MaterialDocument;
export declare function mount(options: Omit<${options}, 'config'> & { config?: ComponentDefinition }): ${instance};
`);
  add('package.json', JSON.stringify({ name: `${reactNames(doc).packageName}-vanilla`, version: '1.0.0', type: 'module', main: './index.js', types: './index.d.ts', exports: { '.': { types: './index.d.ts', import: './index.js' }, './style.css': './runtime/jello.css', './component.json': './component.json', './material.json': './material.json' }, sideEffects: ['**/*.css'] }, null, 2) + '\n');
  add('example/index.html', exampleHtml(doc.name));
  add('example/main.js', `import { mount } from '../index.js';
const container = document.querySelector('#jello-slot');
const source = document.querySelector('#jello-source');
const output = document.querySelector('#jello-output');
let instance;
function start() {
  if (instance) return;
  instance = mount({ container, source, scroller: source, anchor: 'container',
    onPress: (e) => { output.textContent = 'Press: ' + (e.value ?? 'button'); },
    onChange: (id) => { output.textContent = 'Selected: ' + id; }
  });
}
function stop() { instance?.destroy(); instance = null; }
document.querySelector('#jello-mount').addEventListener('click', start);
document.querySelector('#jello-destroy').addEventListener('click', stop);
window.addEventListener('pagehide', stop);
window.addEventListener('pageshow', start);
start();
`);
  add('README.md', `# ${doc.name}

Componente ${doc.type}, materiale ${material.family}. Runtime identico allo Studio, incluso in runtime/. Nessuna dipendenza React, nessuna build richiesta.

## Prova

Servi questa cartella via HTTP (es. \`python3 -m http.server 8080\`) e apri /example/. I moduli ES richiedono HTTP, non file://.

## Integrazione

Carica \`runtime/jello.css\` con un link nel documento. Importa il modulo:

\`\`\`js
import { mount, config } from './index.js';
const instance = mount({ container: document.querySelector('#slot'), source: document.querySelector('#content') });
instance.update(config); // stesso tipo; struttura, materiale, stati e breakpoint si aggiornano
instance.unmount();     // rilascia superfici e listener di input
instance.mount();       // riutilizza l'istanza
instance.destroy();     // rilascia anche observer, gruppi e nodi DOM; idempotente
\`\`\`

In un bundler puoi installare la cartella con npm install ./${root}, importare mount dal pacchetto e il suo /style.css. Non ci sono peer dependencies.

Glass: source è il contenuto DOM opaco dietro la componente, in un elemento separato dal container, mai un suo antenato. Senza source usa CSS satinato. SVG richiede il supporto del browser; in assenza passa a CSS e poi opaco. WebGL2 richiede una texture controllata e non è usato dai renderer DOM. Solid non richiede source, filtri o canvas.

${doc.type === 'button' ? 'Callbacks: onPress, onHover, onFocus. Azione: <button>; collegamento: <a href>. I link seguono il browser; un’azione viene gestita dal consumatore.' : 'Callbacks: onChange(id, event), onTabPress(id, event), onReselect(id, event). setActiveTab(id) per cambiare selezione; controlled: true per delegarla all’app. Nessun router incluso.'}

Gli eventi DOM dichiarati in component.json fanno bubbling. I breakpoint leggono la larghezza del container: assegnagli una dimensione. I namespace CSS sono jello-*, --jbtn-* e --jbn-*; il posizionamento viewport/container segue la definizione (anchor può essere sovrascritto nelle opzioni navbar). Non usare lo stesso container come sorgente Glass.

Movimento ridotto, trasparenza ridotta e forced-colors seguono le preferenze del browser. Gli stati Disabled conservano la semantica HTML. Il focus è visibile. Colori personalizzati richiedono una verifica del contrasto sullo sfondo scelto. Browser moderni con ES modules, ResizeObserver e CSS variables; nessun polyfill incluso.

## Limitazioni

${warnings.length ? warnings.map((w) => '- ' + w).join('\n') : 'Nessuna riduzione introdotta dal wrapper. Valgono i limiti del materiale e del browser, come nello Studio.'}

component.json è la definizione canonica completa; material.json è il materiale risolto. Il manifest elenca dipendenze, compatibilità, limiti e SHA-256 dei file. Nessuna verifica su Safari o Android fisico è implicita nell’export.
`);
  return finish(root, files, {
    format: 'jello-package', version: 1, kind: 'component-vanilla', generatedBy: `Jello Studio ${RUNTIME_VERSION}`, createdAt: input.now ?? new Date().toISOString(),
    component: { id: doc.id, type: doc.type, schemaVersion: doc.schemaVersion, file: 'component.json' },
    material: { id: material.id, family: material.family, schemaVersion: material.schemaVersion, file: 'material.json' },
    runtime: { version: runtime.version, entry: 'runtime/jello.js', css: 'runtime/jello.css', types: 'runtime/types/runtime/index.d.ts' },
    dependencies: { peer: {}, bundled: [`@jello/runtime ${runtime.version}`] },
    compatibility: ['ES modules', 'CSS custom properties', 'ResizeObserver', 'HTTP server'],
    backend: material.family === 'glass' ? { requested: material.target.backend, fallback: material.target.fallback, candidates: candidates(material) } : { requested: 'css', fallback: 'none', candidates: ['css'] },
    lifecycle: ['mount', 'update', 'unmount', 'destroy'], events: doc.interactions.events, reducedRendering: null, limitations: warnings,
  }, warnings);
}

export async function buildSolidPackage(input: { material: SolidDocument; runtime: RuntimeBundle; now?: string }): Promise<PackageResult> {
  const { material: doc, runtime } = input;
  checkRuntime(runtime);
  const root = `jello-${doc.id}-material`;
  const files: PackageFile[] = [];
  const add = (path: string, data: string | Uint8Array) => files.push({ path: `${root}/${path}`, data: typeof data === 'string' ? enc.encode(data) : data });
  add('material.json', serializeMaterial(doc) + '\n');
  for (const f of runtime.files) add(`runtime/${f.path}`, f.data);
  add('index.js', `import { createMaterialGroup } from './runtime/jello.js';
export const material = ${serializeMaterial(doc)};
export function createGroup(options = {}) { return createMaterialGroup({ ...options, material }); }
`);
  add('index.d.ts', `import type { SolidDocument, SolidGroup, SolidGroupOptions } from './runtime/jello.js';
export declare const material: SolidDocument;
export declare function createGroup(options?: Omit<SolidGroupOptions, 'material'>): SolidGroup;
`);
  add('package.json', JSON.stringify({ name: `@jello-export/${doc.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-material`, version: '1.0.0', type: 'module', main: './index.js', types: './index.d.ts', exports: { '.': { types: './index.d.ts', import: './index.js' }, './style.css': './runtime/jello.css', './material.json': './material.json' }, sideEffects: ['**/*.css'] }, null, 2) + '\n');
  add('example/index.html', exampleHtml(doc.name));
  add('example/main.js', `import { createGroup } from '../index.js';
const host = document.createElement('button');
host.type = 'button'; host.textContent = 'Prova Solid';
host.style.cssText = 'position:relative;padding:16px 28px;border:0;font:inherit;cursor:pointer';
document.querySelector('#jello-slot').append(host);
let group;
function start() { if (!group) { group = createGroup(); group.attach(host, { interaction: 'interactive' }); } }
function stop() { group?.destroy(); group = null; }
document.querySelector('#jello-mount').addEventListener('click', start);
document.querySelector('#jello-destroy').addEventListener('click', stop);
window.addEventListener('pagehide', stop); window.addEventListener('pageshow', start); start();
`);
  add('README.md', `# ${doc.name}\n\nMateriale Solid indipendente. Nessuna dipendenza React, sorgente Glass o canvas. Servi via HTTP e apri /example/.\n\nCarica runtime/jello.css e importa createGroup da index.js.\n\n\`const group = createGroup(); const surface = group.attach(host, { interaction: 'interactive' });\`\n\nHover e pressione rispondono a tastiera/puntatore. Usa surface.setActive(boolean) e surface.setDisabled(boolean) per gli stati persistenti; imposta anche disabled/aria-disabled sul controllo HTML. Focus e semantica restano responsabilità dell’host. group.setMaterial(documento) aggiorna tutte le superfici; group.detach(surface) o group.destroy() liberano strati, variabili e listener.\n\nCSS con namespace jello-*. Browser moderni con ES modules e CSS variables; movimento ridotto supportato. Riempimento, bordo, elevazione, angoli, transizioni e override di stato vengono dal documento canonico material.json. Nessuna riduzione funzionale: si include il runtime per conservare stati e lifecycle. Nessun polyfill. Verifica il contrasto dei colori personalizzati.\n`);
  return finish(root, files, {
    format: 'jello-package', version: 1, kind: 'material-runtime', generatedBy: `Jello Studio ${RUNTIME_VERSION}`, createdAt: input.now ?? new Date().toISOString(),
    material: { id: doc.id, family: 'solid', schemaVersion: doc.schemaVersion, file: 'material.json' },
    runtime: { version: runtime.version, entry: 'runtime/jello.js', css: 'runtime/jello.css', types: 'runtime/types/runtime/index.d.ts' },
    dependencies: { peer: {}, bundled: [`@jello/runtime ${runtime.version}`] }, compatibility: ['ES modules', 'CSS custom properties', 'HTTP server'], limitations: ['Semantica HTML, focus e stato disabled dell’host a carico del consumatore.'], reducedRendering: null,
  }, []);
}

function exampleHtml(name: string): string {
  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(name)}</title>
<link rel="stylesheet" href="../runtime/jello.css">
<style>
body { margin:0; padding:16px; font:16px/1.5 system-ui; color:#18202d; background:#f4f5f7; }
#jello-example { position:relative; isolation:isolate; height:420px; max-width:760px; margin:16px auto; }
#jello-source { position:absolute; inset:0; overflow:auto; background:repeating-linear-gradient(135deg,#eee0ff 0 24px,#fff 24px 72px); }
#jello-source p { padding:32px; }
#jello-slot { position:absolute; inset:0; display:grid; place-items:center; pointer-events:none; }
#jello-slot > * { pointer-events:auto; }
:focus-visible { outline:3px solid #5b21b6; outline-offset:3px; }
</style></head><body><h1>${escapeHtml(name)}</h1>
<p>Componente e materiale dal runtime Jello, senza React. Prova tastiera, pressione e ridimensionamento.</p>
<div id="jello-example"><div id="jello-source"><p>Contenuto della pagina</p><p>Uno sfondo controllato per verificare la resa.</p><p>Scorri e prova il materiale.</p></div><div id="jello-slot"></div></div>
<p id="jello-output" role="status">Pronto</p><button type="button" id="jello-destroy">Destroy</button> <button type="button" id="jello-mount">Mount</button>
<script type="module" src="./main.js"></script></body></html>`;
}
