/**
 * Export adapters: one interface for every output format, so the editor
 * never depends on a format. The dialog lists what each adapter will write
 * (describe) before anything is built; build returns files the lab zips.
 *
 *   material-runtime    material + built runtime + types + example (existing package)
 *   material-css        material as a static stylesheet (reduced rendering)
 *   component-react     component + material + runtime as a React/TypeScript package (any registered component type)
 *   material-json       jello-material document (any family)
 *   component-json      jello-component-definition document (material included)
 *
 * The package of the material alone (`material-runtime`, `material-css`) is
 * built for Glass: a component with another material exports as a component.
 *
 * Planned targets (Web Components, HTML/CSS/JS, Figma, Canva, CLI, MCP) are
 * new adapters reading the same documents: there is no separate format for
 * tools or AI agents.
 */

import { COMPONENTS, navbarView, resolveDefinitionMaterial, unsupportedProperties, type ComponentDefinition } from '../components';
import { serializeDefinition } from '../components';
import { serializeMaterial, type GlassDocument, type MaterialDocument } from '../model/document';
import { buildPackage, packageRoot, sha256Hex, type AssetData, type PackageResult, type RuntimeBundle } from './package';
import { buildReactPackage, reactNames } from './react';

export type ExportTarget = 'material' | 'component' | 'configuration';

export interface ExportRequest {
  material?: MaterialDocument;
  component?: ComponentDefinition;
  runtime?: RuntimeBundle;
  resolveAsset?: (url: string) => Promise<AssetData | null>;
  now?: string;
}

export interface ExportDependency {
  name: string;
  version: string;
  /** `bundled`: inside the package. `peer`: the project provides it. */
  kind: 'bundled' | 'peer';
  note: string;
}

export interface ExportPlan {
  /** Folder (zip) or file name. */
  name: string;
  files: { path: string; description: string }[];
  dependencies: ExportDependency[];
  notes: string[];
}

export interface ExportAdapter {
  id: string;
  label: string;
  target: ExportTarget;
  /** Needs the built runtime (dist-lib) to build. */
  needsRuntime: boolean;
  /** Single file (download as is) or a folder (zip). */
  output: 'zip' | 'file';
  requires: 'material' | 'component';
  /** Material families the adapter can write (absent: every one). */
  families?: readonly string[];
  describe(req: ExportRequest): ExportPlan;
  build(req: ExportRequest): Promise<PackageResult>;
}

const RUNTIME_DEP = (v = '0.3.0'): ExportDependency => ({ name: '@jello/runtime', version: v, kind: 'bundled', note: 'in runtime/: renderer, CSS, backend WebGL2 (caricato solo se serve), tipi' });

function need<T>(v: T | undefined, what: string): T {
  if (!v) throw new Error(`Esportazione: manca ${what}`);
  return v;
}

const enc = new TextEncoder();

/** The material of a Glass-only adapter; any other family is refused with the reason instead of exporting half of it. */
function glass(req: ExportRequest): GlassDocument {
  const m = need(req.material, 'il materiale');
  if (m.family !== 'glass') throw new Error(`Esportazione: il pacchetto del solo materiale è disponibile per Glass, non per ${m.family}. Esporta la componente, che include il materiale.`);
  return m;
}

async function single(name: string, text: string): Promise<PackageResult> {
  const data = enc.encode(text);
  return {
    root: name,
    files: [{ path: name, data }],
    manifest: { files: [{ path: name, bytes: data.length, sha256: await sha256Hex(data) }] } as unknown as PackageResult['manifest'],
    warnings: [],
  };
}

export const materialRuntimeAdapter: ExportAdapter = {
  id: 'material-runtime',
  label: 'Materiale con runtime',
  target: 'material',
  needsRuntime: true,
  output: 'zip',
  requires: 'material',
  families: ['glass'],
  describe: (req) => {
    const m = glass(req);
    return {
      name: `${packageRoot(m)}.zip`,
      files: [
        { path: 'material.json', description: 'definizione e parametri (jello-material v2)' },
        { path: 'index.js · index.d.ts · package.json', description: 'modulo installabile: materiale tipizzato e createGroup()' },
        { path: 'runtime/', description: 'runtime Jello costruito, CSS, tipi TypeScript' },
        { path: 'example/', description: 'esempio minimo senza build' },
        { path: 'jello-manifest.json · README.md', description: 'requisiti, fallback, parametri ignorati o approssimati per backend' },
      ],
      dependencies: [RUNTIME_DEP(req.runtime?.version)],
      notes: ['Nessuna componente: solo il materiale, da applicare a elementi del tuo progetto.'],
    };
  },
  build: async (req) => buildPackage({ material: glass(req), kind: 'runtime', runtime: need(req.runtime, 'il runtime (npm run build:lib)'), ...(req.resolveAsset ? { resolveAsset: req.resolveAsset } : {}), ...(req.now ? { now: req.now } : {}) }),
};

export const materialCssAdapter: ExportAdapter = {
  id: 'material-css',
  label: 'Materiale solo CSS (resa ridotta)',
  target: 'material',
  needsRuntime: false,
  output: 'zip',
  requires: 'material',
  families: ['glass'],
  describe: (req) => {
    const m = glass(req);
    return {
      name: `${packageRoot(m)}.zip`,
      files: [
        { path: 'jello-material.css', description: 'blur, tinta, luce e ombra come foglio di stile' },
        { path: 'material.json · example/ · manifest', description: 'definizione, markup d’esempio, requisiti' },
      ],
      dependencies: [],
      notes: ['Nessuna rifrazione e nessuna risposta alla pressione: lo dice anche il manifest.'],
    };
  },
  build: async (req) => buildPackage({ material: glass(req), kind: 'css-only', ...(req.now ? { now: req.now } : {}) }),
};

export const componentReactAdapter: ExportAdapter = {
  id: 'component-react',
  label: 'Componente React + TypeScript',
  target: 'component',
  needsRuntime: true,
  output: 'zip',
  requires: 'component',
  describe: (req) => {
    const c = need(req.component, 'la componente');
    const spec = need(COMPONENTS.get(c.type), `il tipo «${c.type}» registrato`);
    if (!spec.export.formats.includes('component-react')) throw new Error(`Esportazione: «${spec.name}» non ha un export React.`);
    const n = reactNames(c);
    const material = resolveDefinitionMaterial(c);
    const off = unsupportedProperties(c);
    const body = c.type === 'mobile-navbar' ? `struttura (${navbarView(c).children.length} voci), contenuti, layout, stati, interazioni, breakpoint, materiale` : 'struttura, contenuti, layout, stile, stati, interazioni, breakpoint, materiale';
    return {
      name: `${n.root}.zip`,
      files: [
        { path: 'index.js · index.d.ts', description: `<${n.component}>, tipo ${n.tabType}, configurazione` },
        { path: `src/${n.component}.tsx`, description: 'lo stesso componente come sorgente TSX' },
        { path: 'component.json', description: body },
        { path: 'material.json', description: `materiale applicato: ${material.name} (${material.family})` },
        { path: 'runtime/', description: 'runtime Jello: renderer della componente e del materiale, CSS, tipi' },
        { path: 'example/App.tsx · README.md · jello-manifest.json', description: 'integrazione, props, eventi, file con SHA-256' },
      ],
      dependencies: [RUNTIME_DEP(req.runtime?.version), { name: 'react, react-dom', version: '>=18', kind: 'peer', note: 'forniti dal progetto' }],
      notes: [
        c.type === 'mobile-navbar' ? `Installabile con npm install ./${n.root}; nessun router richiesto: onChange riceve l’id della tab.` : `Installabile con npm install ./${n.root}; usa lo stesso renderer dell’anteprima.`,
        ...spec.export.notes.filter((x) => c.type !== 'mobile-navbar' || !x.startsWith('Le tab')),
        ...off.map((u) => `Senza effetto con ${material.name}: ${u.path}.`),
      ],
    };
  },
  build: (req) => buildReactPackage({ component: need(req.component, 'la componente'), runtime: need(req.runtime, 'il runtime (npm run build:lib)'), ...(req.now ? { now: req.now } : {}) }),
};

export const materialJsonAdapter: ExportAdapter = {
  id: 'material-json',
  label: 'Configurazione JSON del materiale',
  target: 'configuration',
  needsRuntime: false,
  output: 'file',
  requires: 'material',
  describe: (req) => {
    const m = need(req.material, 'il materiale');
    return {
      name: `${m.id}.jello.json`,
      files: [{ path: `${m.id}.jello.json`, description: 'documento jello-material v2: si riapre nel laboratorio o si passa a parseMaterial()' }],
      dependencies: [{ name: '@jello/runtime', version: '≥ ' + m.runtime.min, kind: 'peer', note: 'per renderizzarlo serve il runtime nel progetto' }],
      notes: ['Solo dati: per un pacchetto renderizzabile scegli «Materiale con runtime».'],
    };
  },
  build: (req) => {
    const m = need(req.material, 'il materiale');
    return single(`${m.id}.jello.json`, serializeMaterial(m) + '\n');
  },
};

export const componentJsonAdapter: ExportAdapter = {
  id: 'component-json',
  label: 'Configurazione JSON della componente',
  target: 'configuration',
  needsRuntime: false,
  output: 'file',
  requires: 'component',
  describe: (req) => {
    const c = need(req.component, 'la componente');
    return {
      name: `${c.id}.jello-component.json`,
      files: [{ path: `${c.id}.jello-component.json`, description: `documento jello-component-definition v${c.schemaVersion} con il materiale incluso: si riapre nel builder senza perdite` }],
      dependencies: [{ name: '@jello/runtime', version: '≥ ' + c.runtime.min, kind: 'peer', note: 'createComponent({ container, config }) lo renderizza' }],
      notes: ['Lo stesso formato che il builder salva: utilizzabile da strumenti e agenti.'],
    };
  },
  build: (req) => {
    const c = need(req.component, 'la componente');
    return single(`${c.id}.jello-component.json`, serializeDefinition(c) + '\n');
  },
};

export const EXPORT_ADAPTERS: readonly ExportAdapter[] = [materialRuntimeAdapter, materialCssAdapter, componentReactAdapter, materialJsonAdapter, componentJsonAdapter];

export function exportAdapter(id: string): ExportAdapter | undefined {
  return EXPORT_ADAPTERS.find((a) => a.id === id);
}

/** Adapters usable with what is open: a component needs `component`, every one has a material. */
export function adaptersFor(target: ExportTarget, req: ExportRequest): ExportAdapter[] {
  const usable = (a: ExportAdapter): boolean => {
    if (a.requires === 'material') return !!req.material && (!a.families || a.families.includes(req.material.family));
    if (!req.component) return false;
    // The definition's JSON is always available; the React package only for a type that has a template.
    return a.id !== 'component-react' || !!COMPONENTS.get(req.component.type)?.export.formats.includes('component-react');
  };
  return EXPORT_ADAPTERS.filter((a) => a.target === target && usable(a));
}
