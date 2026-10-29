/**
 * Export packages. Two different things, never confused:
 *
 * - Preset JSON: the material document alone (jello-material v2), for the
 *   lab or any runtime that already exists in a project.
 * - Package: a folder usable in another project: the document, the built
 *   runtime (JS, CSS, WebGL2 chunk, types), assets, a manifest of
 *   requirements and a minimal example. Or, explicitly reduced, CSS only.
 *
 * Pure: no DOM, no lab state. The lab calls it with the runtime files it
 * serves; scripts/prepare-example.mjs calls it with dist-lib from disk.
 * Paths inside a package never point into the repository (no src/...).
 */

import { PARAMS } from '../core/params';
import { surfaceVariables } from '../core/surface';
import {
  BACKEND_LABEL,
  BACKEND_REQUIRES,
  glassParams,
  RUNTIME_VERSION,
  serializeMaterial,
  supportReport,
  effectiveRadius,
  type Backend,
  type MaterialDocument,
} from './model-deps';
import { escapeHtml, exampleHtml, exampleScript } from './example';
import { zip, type ZipEntry } from './zip';

export type PackageKind = 'runtime' | 'css-only';

export interface RuntimeFile {
  /** Path inside the built library (dist-lib), e.g. "jello.js", "chunks/scene-view-x.js". */
  path: string;
  data: Uint8Array;
}

export interface RuntimeBundle {
  version: string;
  files: RuntimeFile[];
}

export interface AssetData {
  data: Uint8Array;
  type: string;
  /** File name inside assets/. */
  name: string;
}

export interface PackageInput {
  material: MaterialDocument;
  kind: PackageKind;
  /** Required for `runtime` packages. */
  runtime?: RuntimeBundle;
  /** Bytes of an image the material references (example:… or asset:… URLs). */
  resolveAsset?: (url: string) => Promise<AssetData | null>;
  /** ISO timestamp written in the manifest (fixed in tests). */
  now?: string;
}

export interface PackageFile {
  path: string;
  data: Uint8Array;
}

export interface Manifest {
  format: 'jello-package';
  version: 1;
  kind: PackageKind;
  generatedBy: string;
  createdAt: string;
  material: { id: string; name: string; family: string; schemaVersion: number; file: string };
  runtime: { version: string; entry: string; css: string; types: string | null } | null;
  backend: {
    requested: string;
    fallback: string;
    candidates: { backend: Backend; label: string; requires: readonly string[] }[];
  };
  source: { kind: string; instructions: string };
  reducedRendering: string | null;
  support: Partial<Record<Backend, { ignored: string[]; approximated: string[] }>>;
  files: { path: string; bytes: number; sha256: string }[];
}

export interface PackageResult {
  root: string;
  files: PackageFile[];
  manifest: Manifest;
  warnings: string[];
}

const enc = new TextEncoder();
const text = (s: string) => enc.encode(s);

export function packageRoot(doc: MaterialDocument): string {
  return `jello-${doc.id.replace(/[^A-Za-z0-9._-]/g, '-')}`;
}

/** Backends a document can end up on, in the order the runtime tries them. */
export function candidates(doc: MaterialDocument): Backend[] {
  const b = doc.target.backend;
  if (b === 'webgl2') return ['webgl2', 'css'];
  if (b === 'svg') return ['svg', 'css'];
  if (b === 'css') return ['css'];
  return doc.source.kind === 'texture' ? ['webgl2', 'css'] : ['svg', 'css'];
}

export async function buildPackage(input: PackageInput): Promise<PackageResult> {
  const doc = input.material;
  const warnings: string[] = [];
  const root = packageRoot(doc);
  const files: PackageFile[] = [];
  const add = (path: string, data: Uint8Array) => files.push({ path: `${root}/${path}`, data });

  // Assets referenced by the document travel with it; URLs become relative to material.json.
  let material = doc;
  if (doc.source.kind === 'texture' && doc.source.texture.kind === 'image') {
    const url = doc.source.texture.url;
    if (/^(example|asset):/.test(url)) {
      const asset = await input.resolveAsset?.(url);
      if (asset) {
        add(`assets/${asset.name}`, asset.data);
        material = { ...doc, source: { kind: 'texture', texture: { kind: 'image', url: `assets/${asset.name}` } } };
      } else warnings.push(`Immagine ${url} non disponibile: il pacchetto la referenzia ma non la contiene.`);
    } else if (/^https?:/.test(url)) {
      warnings.push(`L’immagine ${url} resta esterna: WebGL2 la può leggere solo se il server invia intestazioni CORS.`);
    }
  }
  add('material.json', text(serializeMaterial(material) + '\n'));

  const scene = candidates(doc)[0] === 'webgl2';
  let runtime: Manifest['runtime'] = null;
  let reduced: string | null = null;
  if (input.kind === 'runtime') {
    if (!input.runtime) throw new Error('Pacchetto runtime: file del runtime mancanti (esegui npm run build:lib).');
    for (const f of input.runtime.files) {
      if (f.path.includes('..') || f.path.startsWith('/') || /(^|\/)src\//.test(f.path)) {
        throw new Error(`Percorso del runtime non ammesso nel pacchetto: ${f.path}`);
      }
      add(`runtime/${f.path}`, f.data);
    }
    const hasTypes = input.runtime.files.some((f) => f.path === 'types/runtime/index.d.ts');
    if (!hasTypes) warnings.push('Tipi TypeScript non inclusi: il runtime è stato costruito senza dichiarazioni.');
    runtime = { version: input.runtime.version, entry: 'runtime/jello.js', css: 'runtime/jello.css', types: hasTypes ? 'runtime/types/runtime/index.d.ts' : null };
    add('package.json', text(materialPackageJson(material, input.runtime.version)));
    add('index.js', text(materialModule(material)));
    add('index.d.ts', text(MATERIAL_DTS));
    add('example/index.html', text(exampleHtml(scene ? 'scene' : 'dom', doc.name)));
    add('example/main.js', text(exampleScript(scene ? 'scene' : 'dom')));
  } else {
    reduced = cssOnlyNote(doc);
    warnings.push(reduced);
    add('jello-material.css', text(cssOnlyStylesheet(doc)));
    add('example/index.html', text(cssOnlyExample(doc)));
  }

  const support: Manifest['support'] = {};
  for (const b of input.kind === 'css-only' ? (['css'] as Backend[]) : candidates(doc)) {
    const r = supportReport(b);
    support[b] = { ignored: r.filter((x) => x.level === 'ignored').map((x) => x.key), approximated: r.filter((x) => x.level === 'approximated').map((x) => x.key) };
  }
  const manifestBase: Omit<Manifest, 'files'> = {
    format: 'jello-package',
    version: 1,
    kind: input.kind,
    generatedBy: `Jello Material Lab ${RUNTIME_VERSION}`,
    createdAt: input.now ?? new Date().toISOString(),
    material: { id: doc.id, name: doc.name, family: doc.family, schemaVersion: doc.schemaVersion, file: 'material.json' },
    runtime,
    backend: {
      requested: doc.target.backend,
      fallback: doc.target.fallback,
      candidates: (input.kind === 'css-only' ? (['css'] as Backend[]) : candidates(doc)).map((b) => ({ backend: b, label: BACKEND_LABEL[b], requires: BACKEND_REQUIRES[b] })),
    },
    source: { kind: doc.source.kind, instructions: sourceInstructions(doc, input.kind) },
    reducedRendering: reduced,
    support,
  };
  add('README.md', text(readme(doc, manifestBase, warnings)));
  const listed = await Promise.all(
    files.map(async (f) => ({ path: f.path.slice(root.length + 1), bytes: f.data.length, sha256: await sha256Hex(f.data) })),
  );
  const manifest: Manifest = { ...manifestBase, files: listed };
  add('jello-manifest.json', text(JSON.stringify(manifest, null, 2) + '\n'));
  return { root, files, manifest, warnings };
}

/** The material as an installable module: `npm install ./jello-<id>` → import { material, createGroup }. */
function materialPackageJson(doc: MaterialDocument, runtimeVersion: string): string {
  const slug = doc.id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'material';
  return (
    JSON.stringify(
      {
        name: `@jello-export/${slug}-material`,
        version: '1.0.0',
        description: `${doc.name}: materiale ${doc.family} esportato da Jello (runtime ${runtimeVersion} incluso).`,
        type: 'module',
        main: './index.js',
        types: './index.d.ts',
        exports: { '.': { types: './index.d.ts', import: './index.js' }, './style.css': './runtime/jello.css', './material.json': './material.json', './runtime': { types: './runtime/jello.d.ts', import: './runtime/jello.js' } },
        sideEffects: ['*.css'],
      },
      null,
      2,
    ) + '\n'
  );
}

function materialModule(doc: MaterialDocument): string {
  return `/** ${doc.name} — materiale ${doc.family} esportato da Jello. Solo il materiale: nessuna componente. */
import { createMaterialGroup } from './runtime/jello.js';

/** Documento jello-material, identico a material.json. */
export const material = ${serializeMaterial(doc)};

/**
 * Applica il materiale: \`source\` è la GlassSource (contenuto opaco dietro le superfici),
 * poi group.attach(elemento, { sizing: 'element', radius: 'capsule', interaction: 'press' }).
 */
export function createGroup(options) {
  return createMaterialGroup({ ...options, material });
}
`;
}

const MATERIAL_DTS = `import type { MaterialDocument, MaterialGroup, MaterialGroupOptions } from './runtime/jello.js';

export type { MaterialDocument, MaterialGroup } from './runtime/jello.js';

/** Documento jello-material esportato. */
export declare const material: MaterialDocument;

/** Gruppo di superfici con questo materiale sopra una GlassSource. */
export declare function createGroup(options: Omit<MaterialGroupOptions, 'material'>): MaterialGroup;
`;

export function packageZip(result: PackageResult): Uint8Array {
  return zip(result.files.map((f): ZipEntry => ({ path: f.path, data: f.data })));
}

function sourceInstructions(doc: MaterialDocument, kind: PackageKind): string {
  if (kind === 'css-only') {
    return 'Nessuna sorgente: il materiale usa backdrop-filter sul contenuto dietro l’elemento. Nessuna rifrazione.';
  }
  if (candidates(doc)[0] === 'webgl2') {
    return (
      'WebGL2 non legge il DOM della pagina: fornisci una texture controllata a createSceneView ' +
      '({ kind: "pattern" }, { kind: "image", url } dalla stessa origine o con CORS, oppure { kind: "canvas", canvas }). ' +
      'Testi e controlli restano DOM sopra il canvas (opzione foreground).'
    );
  }
  return (
    'Dichiara una GlassSource: un elemento DOM opaco che contiene ciò che la lente può rifrangere ' +
    '(createGlassGroup({ source })). Le superfici stanno sopra la sorgente, non dentro; testi e controlli ' +
    'sono figli dell’host e non vengono mai filtrati. Senza filtro SVG su HTML il runtime passa a CSS satinato.'
  );
}

function cssOnlyNote(doc: MaterialDocument): string {
  const ignored = supportReport('css').filter((r) => r.level === 'ignored').map((r) => r.key);
  const used = ignored.filter((k) => {
    const v = glassParams(doc)[k];
    return typeof v === 'number' ? v !== 0 : true;
  });
  return (
    `Export solo CSS: resa ridotta. Nessuna rifrazione e nessuna risposta alla pressione; ` +
    `parametri ignorati: ${ignored.join(', ')}${used.length ? ` (in questo materiale hanno valori non nulli: ${used.join(', ')})` : ''}.`
  );
}

/** Glass on the CSS backend as a static stylesheet: the same variables the runtime writes. */
export function cssOnlyStylesheet(doc: MaterialDocument): string {
  const p = glassParams(doc);
  const cls = `jello-${doc.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  const vars = surfaceVariables(p, `${effectiveRadius(p)}px`);
  const decl = Object.entries(vars)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n');
  return `/* ${doc.name} — Jello ${RUNTIME_VERSION}, export solo CSS (resa ridotta: nessuna rifrazione).
 * Markup:
 *   <div class="${cls}">
 *     <span class="jello-surface" data-jello-path="satin" aria-hidden="true"></span>
 *     …testo e controlli…
 *   </div>
 * Senza backdrop-filter, o con trasparenza ridotta / contrasto alto / colori forzati, la superficie diventa opaca.
 */
.${cls} {
  position: relative;
  isolation: isolate;
  border-radius: ${vars['--jello-radius']};
}
.${cls} > :not(.jello-surface) {
  position: relative;
  z-index: 1;
}
.${cls} > .jello-surface {
${decl}
  --jello-press: 0;
  --jello-hover: 0;
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: var(--jello-radius);
  pointer-events: none;
  background: rgb(var(--jello-tint) / var(--jello-tint-a));
  -webkit-backdrop-filter: blur(var(--jello-blur)) saturate(var(--jello-saturation));
  backdrop-filter: blur(var(--jello-blur)) saturate(var(--jello-saturation));
  box-shadow:
    inset var(--jello-lx) var(--jello-ly) 1px -0.5px rgb(255 255 255 / calc(var(--jello-light) * 0.9)),
    0 var(--jello-shadow-y) var(--jello-shadow-blur) -6px rgb(0 0 0 / var(--jello-shadow));
}
.${cls} > .jello-surface::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.25px;
  background: linear-gradient(var(--jello-light-angle), rgb(255 255 255 / calc(var(--jello-light) * 0.95)) 0%, rgb(255 255 255 / 0) 32%, rgb(255 255 255 / 0) 64%, rgb(255 255 255 / calc(var(--jello-light) * 0.45)) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .${cls} > .jello-surface { background: rgb(248 248 250 / 0.97); box-shadow: 0 0 0 1px rgb(0 0 0 / 0.2); }
}
@media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
  .${cls} > .jello-surface { -webkit-backdrop-filter: none; backdrop-filter: none; background: rgb(248 248 250 / 0.97); }
}
@media (forced-colors: active) {
  .${cls} > .jello-surface { -webkit-backdrop-filter: none; backdrop-filter: none; background: Canvas; border: 1px solid CanvasText; box-shadow: none; }
  .${cls} > .jello-surface::before { display: none; }
}
`;
}

function cssOnlyExample(doc: MaterialDocument): string {
  const cls = `jello-${doc.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(doc.name)} · solo CSS</title>
<link rel="stylesheet" href="../jello-material.css" />
<style>
body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 16px/1.45 system-ui, sans-serif;
  background: repeating-linear-gradient(135deg, #ff453a 0 18px, #f4f4f2 18px 54px); }
.${cls} { padding: 20px 24px; max-width: 320px; }
</style>
</head>
<body>
<div class="${cls}">
  <span class="jello-surface" data-jello-path="satin" aria-hidden="true"></span>
  <strong>${escapeHtml(doc.name)}</strong>
  <p>Solo CSS: blur, tinta, luce e ombra. Nessuna rifrazione.</p>
</div>
</body>
</html>
`;
}

function readme(doc: MaterialDocument, m: Omit<Manifest, 'files'>, warnings: string[]): string {
  const p = glassParams(doc);
  const lines: string[] = [];
  lines.push(`# ${doc.name}`, '');
  lines.push(`Materiale **${doc.family}** esportato da Jello Material Lab (runtime ${RUNTIME_VERSION}).`, '');
  if (m.kind === 'css-only') {
    lines.push('> **Resa ridotta.** ' + (m.reducedRendering ?? ''), '');
    lines.push('## Uso', '', '1. Copia `jello-material.css` nel progetto.', '2. Usa il markup indicato in testa al file (vedi `example/index.html`).', '');
  } else {
    const scene = m.backend.candidates[0]?.backend === 'webgl2';
    lines.push('## Contenuto', '');
    lines.push('- `material.json` — definizione (jello-material, schema ' + doc.schemaVersion + ')');
    lines.push('- `index.js` · `index.d.ts` · `package.json` — modulo installabile (`npm install ./' + packageRoot(doc) + '`): `material` tipizzato e `createGroup({ source })`');
    lines.push('- `runtime/` — runtime Jello costruito: `jello.js` (ESM), `jello.css`, `chunks/` (backend WebGL2, caricato solo se serve), `types/`');
    lines.push('- `jello-manifest.json` — requisiti, fallback, file con SHA-256');
    lines.push('- `example/` — esempio minimo', '');
    lines.push('## Prova', '', 'I moduli ES e `fetch` richiedono un server HTTP:', '', '```sh', 'npx serve .        # oppure: python3 -m http.server', '# apri /example/', '```', '');
    lines.push('## Uso', '', '```js');
    lines.push("import { " + (scene ? 'createSceneView' : 'createGlassGroup') + ", parseMaterial } from './runtime/jello.js';");
    lines.push("import './runtime/jello.css'; // oppure <link rel=\"stylesheet\" href=\"runtime/jello.css\">");
    lines.push('', "const parsed = parseMaterial(await (await fetch('./material.json')).json());");
    lines.push('if (!parsed.ok) throw new Error(parsed.errors.join("\\n")); // import atomico: o tutto o niente');
    if (scene) {
      lines.push('const view = await createSceneView({ canvas, material: parsed.doc, source: { kind: "pattern", pattern: "grid", animated: false } });');
      lines.push('view.setMaterial(next);  // gli slider aggiornano solo uniform; la geometria rigenera la mappa');
      lines.push('view.suspend(); view.resume();');
      lines.push('view.destroy();          // programmi, texture, framebuffer, listener, loop');
    } else {
      lines.push('const group = createGlassGroup({ source: document.querySelector("#source"), material: parsed.doc });');
      lines.push('const surface = group.attach(document.querySelector("#nav"), { sizing: "element", interaction: "press" });');
      lines.push('group.setMaterial(next);  // solo la geometria rigenera la mappa di displacement');
      lines.push('group.destroy();          // filtri, strati, observer, listener, loop');
    }
    lines.push('```', '');
  }
  lines.push('## Sorgente', '', m.source.instructions, '');
  lines.push('## Requisiti e fallback', '');
  for (const c of m.backend.candidates) lines.push(`- **${c.label}**: ${c.requires.join('; ')}`);
  lines.push(`- Backend richiesto: \`${m.backend.requested}\`, fallback finale: \`${m.backend.fallback}\`.`);
  lines.push('- Con `prefers-reduced-transparency`, `prefers-contrast: more` o `forced-colors` la superficie è opaca.', '');
  lines.push('Lo stesso JSON non ha la stessa resa su ogni backend:', '');
  for (const [b, s] of Object.entries(m.support)) {
    lines.push(`- ${BACKEND_LABEL[b as Backend]}: ignorati ${s.ignored.length ? s.ignored.join(', ') : 'nessuno'}; approssimati ${s.approximated.length ? s.approximated.join(', ') : 'nessuno'}.`);
  }
  lines.push('', '## Parametri', '', '| Parametro | Valore |', '| --- | --- |');
  for (const d of PARAMS) lines.push(`| ${d.label} (\`${d.key}\`) | ${String(p[d.key])}${d.type === 'number' && d.unit ? ' ' + d.unit : ''} |`);
  if (warnings.length) lines.push('', '## Avvisi', '', ...warnings.map((w) => `- ${w}`));
  lines.push('');
  return lines.join('\n');
}

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
