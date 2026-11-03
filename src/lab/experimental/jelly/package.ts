/**
 * Experimental web package of a Jelly material (M6.4.7). Pure: no DOM, no lab state.
 *
 * It ships exactly what the Studio preview runs: the document validated by the experimental
 * parser, and the built experimental runtime (dist-jelly, produced from the same sources as the
 * preview: src/runtime/experimental/*). No renderer is written for the export, and the Glass /
 * Solid packages (src/export/package.ts) are neither used nor changed.
 *
 * Declared scope, repeated in the manifest and the README: SVG and CSS backends in browsers,
 * experimental, no types, no WebGL2, no native Android, not a volumetric simulation.
 */
import { parseExperimentalJelly, serializeExperimentalJelly, type JellyExperimentalDocument } from '../../../model/experimental/jelly';
import { zip, type ZipEntry } from '../../../export/zip';

export const JELLY_PACKAGE_FORMAT = 'jello-jelly-experimental-package';
export const JELLY_RUNTIME_ENTRY = 'runtime/jello-jelly-experimental.js';
export const JELLY_RUNTIME_CSS = 'runtime/jello-jelly-experimental.css';

export interface JellyRuntimeBundle { version: string; files: { path: string; data: Uint8Array }[] }
export interface JellyPackageInput {
  doc: JellyExperimentalDocument;
  runtime: JellyRuntimeBundle;
  /** ISO timestamp written in the manifest (fixed in tests). */
  now?: string;
}
export interface JellyPackageManifest {
  format: typeof JELLY_PACKAGE_FORMAT;
  version: 1;
  experimental: true;
  generatedBy: string;
  createdAt: string;
  material: { id: string; name: string; family: 'jelly'; schemaVersion: number; familyVersion: number; file: string };
  runtime: { version: string; entry: string; css: string; types: null };
  backends: { requested: 'auto' | 'svg' | 'css'; fallback: 'css' | 'opaque'; supported: ['svg', 'css']; unsupported: string[]; note: string };
  accessibility: string[];
  limits: string[];
  files: { path: string; bytes: number; sha256: string }[];
}
export interface JellyPackageResult { root: string; files: { path: string; data: Uint8Array }[]; manifest: JellyPackageManifest; warnings: string[] }

export const JELLY_UNSUPPORTED = ['webgl2', 'android-native', 'refraction', 'drift', 'volumetric-simulation', 'typescript-types'] as const;
export const JELLY_LIMITS = [
  'Sperimentale: lo stato della famiglia è «planned»; formato e runtime possono cambiare senza migrazione.',
  'Backend: SVG (con deformazione elastica e bolle) o CSS statico (senza bolle né deformazione). Nessun WebGL2 Jelly.',
  'Nessun supporto Android nativo; WebView non verificata.',
  'Il moto è un oscillatore elastico decorativo, non una simulazione fisica volumetrica.',
  'Nessun tipo TypeScript incluso.',
  'Il pacchetto va servito via HTTP (gli import ES module non funzionano da file://).',
];

const enc = new TextEncoder();
const text = (s: string) => enc.encode(s);
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(data: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>));
}

export const jellyPackageRoot = (doc: JellyExperimentalDocument) => `jello-jelly-${doc.id.replace(/[^A-Za-z0-9._-]/g, '-')}`;

const exampleHtml = (doc: JellyExperimentalDocument) => `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(doc.name)} · esempio Jelly sperimentale</title>
<link rel="stylesheet" href="../${JELLY_RUNTIME_CSS}">
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #f3e8ff, #dbeafe); font: 16px system-ui, sans-serif; color: #241933; }
  main { display: grid; gap: 16px; justify-items: center; }
  #jelly-button { appearance: none; border: 0; background: transparent; font: inherit; font-weight: 600; padding: 0 28px; min-height: 52px; min-width: 160px; border-radius: 26px; cursor: pointer; }
  #jelly-button:focus-visible { outline: 3px solid #5b21b6; outline-offset: 4px; }
  #jelly-button:disabled { cursor: not-allowed; }
  p { margin: 0; }
</style>
</head>
<body>
<main>
  <button id="jelly-button" type="button">Jelly</button>
  <p>Click nativi del Button: <output id="clicks">0</output></p>
  <p id="state" role="status">Caricamento…</p>
</main>
<script type="module" src="./main.js"></script>
</body>
</html>
`;

const exampleScript = () => `// Esempio sperimentale: gli stessi moduli dell'anteprima dello Studio, costruiti a parte.
import { attachExperimentalJelly, bindJellyInput, createJellyCoordinator, parseExperimentalJelly } from '../${JELLY_RUNTIME_ENTRY}';

const host = document.getElementById('jelly-button');
const state = document.getElementById('state');
let clicks = 0;
// Il Button resta nativo: il click è del browser, Jelly non ne genera.
host.addEventListener('click', () => { document.getElementById('clicks').textContent = String(++clicks); });

try {
  const parsed = parseExperimentalJelly(await (await fetch('../jelly.json')).json());
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  const coordinator = createJellyCoordinator();
  const surface = attachExperimentalJelly(host, parsed.doc, {}, coordinator);
  const unbind = bindJellyInput(host, surface);
  const describe = (s) => 'Backend effettivo: ' + s.backend + (s.opaque ? ' (opaco)' : '') + ' · moto ' + s.motion;
  state.textContent = describe(surface.status);
  surface.onStatus((s) => { state.textContent = describe(s); });
  // Per verifiche automatiche; rimuovere in produzione.
  window.__jellyExample = { surface, destroy() { unbind(); surface.destroy(); coordinator.destroy(); } };
} catch (error) {
  // Senza Jelly il Button resta un pulsante nativo, leggibile e usabile.
  state.textContent = 'Jelly non disponibile: ' + error.message;
}
`;

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const readme = (doc: JellyExperimentalDocument, root: string, manifest: JellyPackageManifest) => `# ${doc.name} — pacchetto Jelly SPERIMENTALE

Generato da Jello Studio (M6.4). **Non è un materiale ufficiale di Jello**: Jelly ha stato «planned» e
questo pacchetto può cambiare o smettere di funzionare senza un percorso di migrazione.

## Contenuto

| File | A cosa serve |
| --- | --- |
| \`jelly.json\` | Il documento del materiale (\`jello-material\` con \`family: "jelly"\`): solo parametri e metadati. |
| \`${JELLY_RUNTIME_ENTRY}\` | Il runtime sperimentale: lo stesso codice dell'anteprima dello Studio. |
| \`${JELLY_RUNTIME_CSS}\` | Gli stili del renderer. |
| \`example/index.html\`, \`example/main.js\` | Un Button nativo decorato da Jelly. |
| \`manifest.json\` | Versioni, backend, limiti e hash SHA-256 dei file. |

## Prova rapida

\`\`\`sh
cd ${root}
npx serve .          # o qualsiasi server statico
# apri /example/
\`\`\`

## Uso

\`\`\`js
import { attachExperimentalJelly, bindJellyInput, createJellyCoordinator, parseExperimentalJelly } from './${JELLY_RUNTIME_ENTRY}';
const parsed = parseExperimentalJelly(await (await fetch('./jelly.json')).json());
if (!parsed.ok) throw new Error(parsed.errors.join('; '));
const coordinator = createJellyCoordinator();           // un solo ciclo RAF, fermo quando nulla si muove
const surface = attachExperimentalJelly(button, parsed.doc, {}, coordinator);
const unbind = bindJellyInput(button, surface);          // opzionale: feedback di pressione, nessun click sintetico
// aggiornamenti: surface.update(nuovoDocumento)
// pulizia:       unbind(); surface.destroy(); coordinator.destroy();
\`\`\`

Il Button deve essere un elemento nativo (\`<button>\`): testo, icona, dimensioni e raggio sono suoi.
Jelly aggiunge uno strato decorativo dietro il contenuto, senza intercettare l'input.

## Backend e fallback

- Richiesto: \`${manifest.backends.requested}\` · fallback: \`${manifest.backends.fallback}\`.
- **SVG**: corpo, bolle, riflessi, ombra e deformazione elastica.
- **CSS** (anche se SVG non è disponibile o con \`prefers-reduced-transparency\`): corpo, bordo, riflesso e ombra approssimati; niente bolle né deformazione.
- **Opaco** (\`fallback: "opaque"\`, trasparenza ridotta, colori forzati): corpo pieno, stessa semantica.
- \`prefers-reduced-motion\`: il moto si ferma, il Button resta leggibile.

## Non supportato

${manifest.limits.map((l) => `- ${l}`).join('\n')}
`;

export async function buildJellyPackage(input: JellyPackageInput): Promise<JellyPackageResult> {
  const parsed = parseExperimentalJelly(input.doc);
  if (!parsed.ok) throw new Error(`Documento Jelly non valido, nessun pacchetto generato: ${parsed.errors[0]}`);
  const doc = parsed.doc;
  const warnings: string[] = [];
  const byPath = new Map(input.runtime.files.map((f) => [f.path, f]));
  for (const needed of ['jello-jelly-experimental.js', 'jello-jelly-experimental.css']) {
    if (!byPath.has(needed)) throw new Error(`Runtime Jelly sperimentale incompleto (manca ${needed}): esegui npm run build:jelly. Nessun pacchetto generato.`);
  }
  for (const f of input.runtime.files) {
    if (f.path.includes('..') || f.path.startsWith('/') || /(^|\/)src\//.test(f.path)) throw new Error(`Percorso del runtime non ammesso nel pacchetto: ${f.path}`);
  }
  if (doc.target.backend === 'auto' && doc.target.fallback === 'css') warnings.push('Con SVG non disponibile il Button usa il fallback CSS statico.');

  const root = jellyPackageRoot(doc);
  const files: { path: string; data: Uint8Array }[] = [];
  const add = (path: string, data: Uint8Array) => files.push({ path: `${root}/${path}`, data });
  add('jelly.json', text(serializeExperimentalJelly(doc) + '\n'));
  add(JELLY_RUNTIME_ENTRY, byPath.get('jello-jelly-experimental.js')!.data);
  add(JELLY_RUNTIME_CSS, byPath.get('jello-jelly-experimental.css')!.data);
  add('example/index.html', text(exampleHtml(doc)));
  add('example/main.js', text(exampleScript()));

  const manifest: JellyPackageManifest = {
    format: JELLY_PACKAGE_FORMAT, version: 1, experimental: true,
    generatedBy: `Jello Studio ${input.runtime.version} · Jelly sperimentale M6.4`,
    createdAt: input.now ?? new Date().toISOString(),
    material: { id: doc.id, name: doc.name, family: 'jelly', schemaVersion: doc.schemaVersion, familyVersion: doc.familyVersion, file: 'jelly.json' },
    runtime: { version: input.runtime.version, entry: JELLY_RUNTIME_ENTRY, css: JELLY_RUNTIME_CSS, types: null },
    backends: {
      requested: doc.target.backend, fallback: doc.target.fallback, supported: ['svg', 'css'], unsupported: [...JELLY_UNSUPPORTED],
      note: 'Il backend effettivo dipende dal browser e dalle preferenze dell’utente; il runtime lo riporta in surface.status.',
    },
    accessibility: [
      'Host nativo: semantica, tastiera e focus restano del <button>.',
      'prefers-reduced-motion ferma il moto; prefers-reduced-transparency e forced-colors usano un corpo opaco o colori di sistema.',
    ],
    limits: JELLY_LIMITS,
    files: await Promise.all(files.map(async (f) => ({ path: f.path.slice(root.length + 1), bytes: f.data.length, sha256: await sha256(f.data) }))),
  };
  add('manifest.json', text(JSON.stringify(manifest, null, 2) + '\n'));
  add('README.md', text(readme(doc, root, manifest)));
  return { root, files, manifest, warnings };
}

export function jellyPackageZip(result: JellyPackageResult): Uint8Array {
  const entries: ZipEntry[] = result.files.map((f) => ({ path: f.path, data: f.data }));
  return zip(entries);
}
