/**
 * React + TypeScript package of a component.
 *
 *   jello-<id>-react/
 *     package.json         @jello-export/<id>: ESM, types, peer react ≥ 18, `./style.css`
 *     index.js             the React component (compiled ESM, no JSX) + the configuration
 *     index.d.ts           props, tab id union, configuration type
 *     src/<Name>.tsx       the same component as TSX source, for projects that vendor it
 *     component.json       jello-component document (material included)
 *     material.json        the material alone (jello-material)
 *     runtime/             built Jello runtime: BottomNavigation renderer + material runtime + CSS + types
 *     example/App.tsx      integration example
 *     README.md · jello-manifest.json
 *
 * The component is a thin wrapper: it mounts the runtime's BottomNavigation
 * (the same class the lab preview runs) and maps props to it. It imports
 * only ./runtime: nothing from Jello Studio, no router.
 *
 * Pure: strings in, files out (tests/unit/export.test.ts, tests/e2e/react-export.spec.ts).
 */

import type { ComponentDocument } from '../components/document';
import { serializeComponent } from '../components/document';
import type { BnTab } from '../components/bottom-navigation/model';
import { BN_FIELDS } from '../components/bottom-navigation/model';
import { BACKEND_LABEL, BACKEND_REQUIRES, RUNTIME_VERSION, serializeMaterial, type Backend } from './model-deps';
import { candidates, sha256Hex, type PackageFile, type PackageResult, type RuntimeBundle } from './package';

export interface ReactPackageInput {
  component: ComponentDocument;
  runtime: RuntimeBundle;
  now?: string;
}

export interface ReactNames {
  /** Generated component, e.g. BottomNavigation, MyAppNavigation. */
  component: string;
  /** Union of tab ids, e.g. BottomNavigationTabId, MyAppTabId. */
  tabType: string;
  packageName: string;
  root: string;
}

export function reactNames(doc: ComponentDocument): ReactNames {
  const words = doc.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  let base = words.map((w) => w[0]!.toUpperCase() + w.slice(1).toLowerCase()).join('') || 'Jello';
  if (/^\d/.test(base)) base = `Jello${base}`;
  const component = /Nav(igation|bar)?$/.test(base) ? base : `${base}Navigation`;
  // Named after the component, not its storage id: "Bottom Navigation" → @jello-export/bottom-navigation.
  const slugOf = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  const slug = slugOf(doc.name) || slugOf(doc.id) || 'component';
  return { component, tabType: `${base}TabId`, packageName: `@jello-export/${slug}`, root: `jello-${slug}-react` };
}

const enc = new TextEncoder();

export async function buildReactPackage(input: ReactPackageInput): Promise<PackageResult> {
  const doc = input.component;
  const names = reactNames(doc);
  const warnings: string[] = [];
  const files: PackageFile[] = [];
  const add = (path: string, text: string | Uint8Array) => files.push({ path: `${names.root}/${path}`, data: typeof text === 'string' ? enc.encode(text) : text });

  const material = doc.material.document;
  if (material.source.kind === 'texture') {
    warnings.push('Il materiale chiede una texture (WebGL2): sui componenti DOM il runtime usa il percorso automatico SVG/CSS.');
  }
  for (const f of input.runtime.files) {
    if (f.path.includes('..') || f.path.startsWith('/') || /(^|\/)src\//.test(f.path)) throw new Error(`Percorso del runtime non ammesso nel pacchetto: ${f.path}`);
  }
  const hasTypes = input.runtime.files.some((f) => f.path === 'types/runtime/index.d.ts');
  if (!hasTypes) throw new Error('Pacchetto React: il runtime è stato costruito senza dichiarazioni TypeScript (npm run build:lib).');
  const svgIcons = doc.root.children.filter((t) => t.icon.kind === 'svg').length;

  add('package.json', packageJson(doc, names));
  add('index.js', indexJs(doc, names));
  add('index.d.ts', indexDts(doc, names));
  add(`src/${names.component}.tsx`, tsxSource(doc, names));
  add('component.json', serializeComponent(doc) + '\n');
  add('material.json', serializeMaterial(material) + '\n');
  for (const f of input.runtime.files) add(`runtime/${f.path}`, f.data);
  add('example/App.tsx', exampleApp(doc, names));
  add('README.md', readme(doc, names, warnings, svgIcons));

  const listed = await Promise.all(files.map(async (f) => ({ path: f.path.slice(names.root.length + 1), bytes: f.data.length, sha256: await sha256Hex(f.data) })));
  const backends = candidates(material);
  const manifest = {
    format: 'jello-package' as const,
    version: 1 as const,
    kind: 'component-react',
    generatedBy: `Jello Material Lab ${RUNTIME_VERSION}`,
    createdAt: input.now ?? new Date().toISOString(),
    component: { id: doc.id, name: doc.name, type: doc.type, typeVersion: doc.typeVersion, schemaVersion: doc.schemaVersion, file: 'component.json', tabs: doc.root.children.map((t) => t.id) },
    material: { id: material.id, name: material.name, family: material.family, schemaVersion: material.schemaVersion, file: 'material.json', preset: doc.material.preset },
    runtime: { version: input.runtime.version, entry: 'runtime/jello.js', css: 'runtime/jello.css', types: 'runtime/types/runtime/index.d.ts' },
    react: { package: names.packageName, component: names.component, entry: 'index.js', types: 'index.d.ts', source: `src/${names.component}.tsx` },
    dependencies: { peer: { react: '>=18', 'react-dom': '>=18' }, bundled: ['runtime/ (@jello/runtime ' + input.runtime.version + ')'] },
    backend: { requested: material.target.backend, fallback: material.target.fallback, candidates: backends.map((b: Backend) => ({ backend: b, label: BACKEND_LABEL[b], requires: BACKEND_REQUIRES[b] })) },
    events: doc.root.interactions.events,
    files: listed,
  };
  add('jello-manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  return { root: names.root, files, manifest: manifest as unknown as PackageResult['manifest'], warnings };
}

function packageJson(doc: ComponentDocument, n: ReactNames): string {
  return (
    JSON.stringify(
      {
        name: n.packageName,
        version: '1.0.0',
        description: `${doc.name}: BottomNavigation con materiale ${doc.material.document.name}, esportata da Jello.`,
        type: 'module',
        main: './index.js',
        types: './index.d.ts',
        exports: {
          '.': { types: './index.d.ts', import: './index.js' },
          './style.css': './runtime/jello.css',
          './component.json': './component.json',
          './material.json': './material.json',
        },
        sideEffects: ['*.css'],
        peerDependencies: { react: '>=18', 'react-dom': '>=18' },
        jello: { component: 'component.json', material: 'material.json', runtime: 'runtime/' },
      },
      null,
      2,
    ) + '\n'
  );
}

const tabUnion = (tabs: readonly BnTab[]) => tabs.map((t) => JSON.stringify(t.id)).join(' | ');

function indexJs(doc: ComponentDocument, n: ReactNames): string {
  return `/**
 * ${doc.name} — componente React esportato da Jello (BottomNavigation, materiale ${doc.material.document.name}).
 * Usa solo il runtime incluso in ./runtime: lo stesso renderer dell'anteprima del laboratorio.
 * Le tab non sono pagine: onChange riceve l'id stabile della tab, la navigazione è dell'applicazione.
 */
import { createElement, useEffect, useLayoutEffect, useRef } from 'react';
import { createBottomNavigation } from './runtime/jello.js';

/** Documento jello-component (materiale incluso), identico a component.json. */
export const config = ${serializeComponent(doc)};

export const tabs = config.root.children.map((t) => t.id);

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function JelloBottomNavigation(props) {
  const { config: doc = config, activeTab, defaultActiveTab, sourceRef, scrollerRef, backend, anchor, className } = props;
  const label = props['aria-label'];
  const slot = useRef(null);
  const nav = useRef(null);
  const latest = useRef(props);
  latest.current = props;
  const controlled = activeTab !== undefined;

  useIsoLayoutEffect(() => {
    const options = {
      container: slot.current,
      config: doc,
      source: sourceRef?.current ?? null,
      scroller: scrollerRef?.current ?? sourceRef?.current ?? null,
      activeTab: activeTab ?? defaultActiveTab ?? null,
      controlled,
      onChange: (id, e) => latest.current.onChange?.(id, e),
      onTabPress: (id, e) => latest.current.onTabPress?.(id, e),
      onReselect: (id, e) => latest.current.onReselect?.(id, e),
    };
    if (label) options.label = label;
    if (anchor) options.anchor = anchor;
    if (backend) options.backend = backend;
    if (className) options.classNames = { root: className };
    const n = createBottomNavigation(options);
    nav.current = n;
    return () => {
      n.destroy();
      nav.current = null;
    };
    // Re-created only when what the bar is attached to changes; the rest is updated in place.
  }, [sourceRef, scrollerRef, backend, anchor, controlled, label, className]);

  useEffect(() => {
    nav.current?.update(doc);
  }, [doc]);

  useEffect(() => {
    if (controlled && activeTab != null) nav.current?.setActiveTab(activeTab);
  }, [controlled, activeTab]);

  // React owns this box and never its content: the <nav> lives inside, laid out by the parent (display: contents).
  return createElement('div', { ref: slot, style: { display: 'contents' }, 'data-jello-component': doc.id });
}

export function ${n.component}(props) {
  return createElement(JelloBottomNavigation, { ...props, config });
}

export default ${n.component};
`;
}

function indexDts(doc: ComponentDocument, n: ReactNames): string {
  return `import type { ReactElement, RefObject } from 'react';
import type { BackendRequest, BnLayout, BottomNavigationEvent, ComponentDocument } from './runtime/jello.js';

export type { BottomNavigationEvent, ComponentDocument } from './runtime/jello.js';

/** Id stabili delle tab di ${doc.name} (non dipendono dalle etichette). */
export type ${n.tabType} = ${tabUnion(doc.root.children)};

export interface JelloBottomNavigationProps<TabId extends string = string> {
  /** Documento jello-component da mostrare (default: quello esportato). */
  config?: ComponentDocument;
  /** Modalità controllata: la tab attiva è questa; cambia solo quando la cambi tu (onChange). */
  activeTab?: TabId;
  /** Modalità non controllata: tab attiva iniziale (default: root.defaultTab). */
  defaultActiveTab?: TabId;
  /** Scelta di una tab diversa da quella attiva. */
  onChange?: (tabId: TabId, event: BottomNavigationEvent) => void;
  /** Inizio della pressione su una tab (puntatore, Spazio o Invio). */
  onTabPress?: (tabId: TabId, event: BottomNavigationEvent) => void;
  /** Tab già attiva premuta di nuovo (interactions.reselect = "event"). */
  onReselect?: (tabId: TabId, event: BottomNavigationEvent) => void;
  /**
   * GlassSource: elemento opaco dietro la barra, il cui contenuto viene rifratto (backend SVG).
   * Senza, la superficie usa backdrop-filter (CSS), senza rifrazione.
   */
  sourceRef?: RefObject<HTMLElement | null>;
  /** Elemento che scorre con la rotella sopra la barra (default: sourceRef). */
  scrollerRef?: RefObject<HTMLElement | null>;
  /** Sostituisce layout.anchor: viewport (fixed), container (absolute), inline. */
  anchor?: BnLayout['anchor'];
  /** Sostituisce il backend richiesto dal materiale. */
  backend?: BackendRequest;
  /** Classe aggiunta all'elemento <nav>. */
  className?: string;
  'aria-label'?: string;
}

/** Documento jello-component esportato (materiale incluso). */
export declare const config: ComponentDocument;
export declare const tabs: readonly ${n.tabType}[];

export declare function JelloBottomNavigation<TabId extends string = string>(props: JelloBottomNavigationProps<TabId>): ReactElement;

export type ${n.component}Props = Omit<JelloBottomNavigationProps<${n.tabType}>, 'config'>;
export declare function ${n.component}(props: ${n.component}Props): ReactElement;
export default ${n.component};
`;
}

function tsxSource(doc: ComponentDocument, n: ReactNames): string {
  return `/**
 * ${doc.name} — sorgente TSX equivalente a index.js, per chi preferisce copiare il componente nel progetto.
 * Richiede "resolveJsonModule" (per component.json) e il runtime in ../runtime.
 */
import { useEffect, useLayoutEffect, useRef, type ReactElement, type RefObject } from 'react';
import {
  createBottomNavigation,
  type BackendRequest,
  type BnLayout,
  type BottomNavigation as BottomNavigationInstance,
  type BottomNavigationEvent,
  type BottomNavigationOptions,
  type ComponentDocument,
} from '../runtime/jello.js';
import exported from '../component.json';

export const config = exported as ComponentDocument;

export type ${n.tabType} = ${tabUnion(doc.root.children)};

export interface ${n.component}Props {
  activeTab?: ${n.tabType};
  defaultActiveTab?: ${n.tabType};
  onChange?: (tabId: ${n.tabType}, event: BottomNavigationEvent) => void;
  onTabPress?: (tabId: ${n.tabType}, event: BottomNavigationEvent) => void;
  onReselect?: (tabId: ${n.tabType}, event: BottomNavigationEvent) => void;
  sourceRef?: RefObject<HTMLElement | null>;
  scrollerRef?: RefObject<HTMLElement | null>;
  anchor?: BnLayout['anchor'];
  backend?: BackendRequest;
  className?: string;
  'aria-label'?: string;
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function ${n.component}(props: ${n.component}Props): ReactElement {
  const { activeTab, defaultActiveTab, sourceRef, scrollerRef, backend, anchor, className } = props;
  const label = props['aria-label'];
  const slot = useRef<HTMLDivElement>(null);
  const nav = useRef<BottomNavigationInstance | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const controlled = activeTab !== undefined;

  useIsoLayoutEffect(() => {
    const options: BottomNavigationOptions = {
      container: slot.current!,
      config,
      source: sourceRef?.current ?? null,
      scroller: scrollerRef?.current ?? sourceRef?.current ?? null,
      activeTab: activeTab ?? defaultActiveTab ?? null,
      controlled,
      onChange: (id, e) => latest.current.onChange?.(id as ${n.tabType}, e),
      onTabPress: (id, e) => latest.current.onTabPress?.(id as ${n.tabType}, e),
      onReselect: (id, e) => latest.current.onReselect?.(id as ${n.tabType}, e),
    };
    if (label) options.label = label;
    if (anchor) options.anchor = anchor;
    if (backend) options.backend = backend;
    if (className) options.classNames = { root: className };
    const created = createBottomNavigation(options);
    nav.current = created;
    return () => {
      created.destroy();
      nav.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceRef, scrollerRef, backend, anchor, controlled, label, className]);

  useEffect(() => {
    if (controlled && activeTab != null) nav.current?.setActiveTab(activeTab);
  }, [controlled, activeTab]);

  // React owns this box and never its content (display: contents: the parent lays the bar out).
  return <div ref={slot} style={{ display: 'contents' }} data-jello-component={config.id} />;
}

export default ${n.component};
`;
}

function exampleApp(doc: ComponentDocument, n: ReactNames): string {
  const first = doc.root.defaultTab;
  return `/**
 * Integrazione minima di ${doc.name} in un'app React (Vite, Next, CRA…).
 *
 *   npm install ./${n.root}
 *   import '${n.packageName}/style.css';
 */
import { useRef, useState } from 'react';
import { ${n.component}, type ${n.tabType} } from '${n.packageName}';
import '${n.packageName}/style.css';

export function App() {
  // GlassSource: il contenuto che scorre dietro la barra. La barra sta fuori da questo elemento.
  const content = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<${n.tabType}>(${JSON.stringify(first)});
  return (
    <>
      <main ref={content} style={{ position: 'fixed', inset: 0, overflow: 'auto', background: '#f4f4f6', padding: '24px 16px 120px' }}>
        <h1>{tab}</h1>
        {/* …contenuto della sezione… */}
      </main>
      <${n.component} sourceRef={content} activeTab={tab} onChange={setTab} onReselect={() => content.current?.scrollTo({ top: 0 })} />
    </>
  );
}
`;
}

function readme(doc: ComponentDocument, n: ReactNames, warnings: string[], svgIcons: number): string {
  const r = doc.root;
  const m = doc.material.document;
  const lines = [
    `# ${doc.name} · React`,
    '',
    `BottomNavigation esportata da Jello Material Lab (runtime ${RUNTIME_VERSION}), con materiale **${m.name}** (${m.family}).`,
    'Il pacchetto non dipende da Jello Studio: il runtime è incluso in `runtime/`.',
    '',
    '## Installazione',
    '',
    '```sh',
    `npm install ./${n.root}        # dipendenze peer: react, react-dom ≥ 18`,
    '```',
    '',
    '## Uso',
    '',
    '```tsx',
    `import { ${n.component}, type ${n.tabType} } from '${n.packageName}';`,
    `import '${n.packageName}/style.css';`,
    '',
    `const [tab, setTab] = useState<${n.tabType}>(${JSON.stringify(r.defaultTab)});`,
    `<main ref={content}>…</main>                       {/* GlassSource: dietro la barra, non la contiene */}`,
    `<${n.component} sourceRef={content} activeTab={tab} onChange={setTab} />`,
    '```',
    '',
    'Esempio completo: `example/App.tsx`. Sorgente TSX equivalente (da copiare nel progetto): `src/' + n.component + '.tsx`.',
    '',
    '## Props',
    '',
    '| Prop | Significato |',
    '| --- | --- |',
    '| `activeTab` / `onChange` | modalità controllata: la tab attiva cambia solo quando la cambi tu |',
    '| `defaultActiveTab` | modalità non controllata: tab iniziale (default `' + r.defaultTab + '`) |',
    '| `onTabPress`, `onReselect` | inizio della pressione; tab attiva premuta di nuovo |',
    '| `sourceRef` | GlassSource: senza, la superficie usa backdrop-filter (CSS), senza rifrazione |',
    '| `scrollerRef` | elemento che scorre con la rotella sopra la barra (default `sourceRef`) |',
    '| `anchor` | `viewport` (fixed), `container` (absolute), `inline` (default dal componente: `' + r.layout.anchor + '`) |',
    '| `backend` | sostituisce il backend del materiale (`auto`, `svg`, `css`) |',
    '| `className`, `aria-label` | classe dell’elemento `<nav>`, nome accessibile |',
    '',
    'Nessun router richiesto: `onChange(tabId, event)` riceve l’id stabile e `event.value` (il valore libero della tab).',
    `Eventi DOM (CustomEvent, bubbles) sull’elemento \`<nav>\`: \`${r.interactions.events.change}\`, \`${r.interactions.events.press}\`, \`${r.interactions.events.reselect}\`.`,
    '',
    '## Tab',
    '',
    '| id | Etichetta | Icona | Valore | Disabilitata |',
    '| --- | --- | --- | --- | --- |',
    ...r.children.map((t) => `| \`${t.id}\` | ${t.label} | ${t.icon.kind === 'builtin' ? t.icon.name : t.icon.kind === 'svg' ? `SVG «${t.icon.name}»` : '—'} | ${t.value ?? '—'} | ${t.disabled ? 'sì' : 'no'} |`),
    '',
    '## Materiale e rendering',
    '',
    '- `material.json` è il materiale (jello-material); `component.json` lo contiene, insieme a struttura, stati, interazioni e breakpoint.',
    '- La barra ha **una** superficie di materiale; testi, icone e indicatore restano in primo piano, mai filtrati.',
    '- Backend: SVG (rifrazione della GlassSource) dove il browser applica filtri SVG agli elementi HTML, altrimenti CSS (backdrop-filter), poi opaco.',
    '- `prefers-reduced-motion`: indicatore senza animazione, nessuna scala alla pressione. `prefers-reduced-transparency`, `prefers-contrast: more`, `forced-colors`: superficie opaca.',
    '- Tastiera: frecce, Home e Fine spostano il focus; Spazio e Invio attivano. Focus sempre visibile.',
    `- Overflow: ${r.responsive.overflow === 'scroll' ? 'le tab scorrono orizzontalmente' : 'le etichette si nascondono'} sotto ${r.responsive.minTabWidth} px per tab. Breakpoint: ${r.responsive.breakpoints.length ? r.responsive.breakpoints.map((b) => `${b.id} ≤ ${b.maxWidth} px`).join(', ') : 'nessuno'}.`,
    ...(svgIcons ? [`- ${svgIcons} icone SVG personalizzate, già ripulite (solo forme e attributi ammessi) e incluse in \`component.json\`.`] : []),
    '',
    '## Proprietà del componente',
    '',
    '| Proprietà | Valore |',
    '| --- | --- |',
    ...BN_FIELDS.map((f) => {
      const v = f.path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], r);
      return `| ${f.label} (\`${f.path}\`) | ${String(v)}${f.type === 'number' && f.unit ? ' ' + f.unit : ''} |`;
    }),
    ...(warnings.length ? ['', '## Avvisi', '', ...warnings.map((w) => `- ${w}`)] : []),
    '',
  ];
  return lines.join('\n');
}
