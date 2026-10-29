import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildPackage, cssOnlyStylesheet, packageZip, type RuntimeBundle } from '../../src/export/package';
import { DOM_FIXTURE_HTML, exampleHtml, exampleScript } from '../../src/export/example';
import { crc32, unzip, zip } from '../../src/export/zip';
import { builtinMaterial, parseMaterialText, type MaterialDocument } from '../../src/model';
import { addTab, componentTemplate, parseComponentText, serializeComponent } from '../../src/components';
import { adaptersFor, componentReactAdapter, EXPORT_ADAPTERS, exportAdapter } from '../../src/export/adapters';

const enc = new TextEncoder();
const runtime: RuntimeBundle = {
  version: '0.2.0',
  files: [
    { path: 'jello.js', data: enc.encode('export const x = 1;') },
    { path: 'jello.css', data: enc.encode('.jello-surface{}') },
    { path: 'chunks/scene-view-abc.js', data: enc.encode('export {}') },
    { path: 'types/runtime/index.d.ts', data: enc.encode('export {}') },
    { path: 'package.json', data: enc.encode('{}') },
  ],
};
const navbar = builtinMaterial('navbar')!.doc;
const now = '2026-10-29T12:00:00.000Z';

describe('zip', () => {
  it('round-trips entries and matches the reference CRC-32', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
    const entries = [
      { path: 'a/b.txt', data: enc.encode('ciao') },
      { path: 'è.json', data: enc.encode('{"x":1}') },
    ];
    expect(unzip(zip(entries))).toEqual(entries);
  });
});

describe('export package (runtime)', () => {
  it('contains definition, runtime, example, readme and a manifest with hashes', async () => {
    const r = await buildPackage({ material: navbar, kind: 'runtime', runtime, now });
    const paths = r.files.map((f) => f.path);
    expect(r.root).toBe('jello-navbar');
    for (const p of ['material.json', 'runtime/jello.js', 'runtime/jello.css', 'runtime/chunks/scene-view-abc.js', 'example/index.html', 'example/main.js', 'README.md', 'jello-manifest.json']) {
      expect(paths).toContain(`jello-navbar/${p}`);
    }
    // No private repository paths.
    expect(paths.every((p) => !/(^|\/)src\//.test(p))).toBe(true);
    const manifest = r.manifest;
    expect(manifest.runtime).toMatchObject({ version: '0.2.0', entry: 'runtime/jello.js', types: 'runtime/types/runtime/index.d.ts' });
    expect(manifest.backend.candidates.map((c) => c.backend)).toEqual(['svg', 'css']);
    expect(manifest.source.instructions).toMatch(/GlassSource/);
    expect(manifest.reducedRendering).toBeNull();
    for (const f of manifest.files) {
      const file = r.files.find((x) => x.path === `jello-navbar/${f.path}`)!;
      expect(createHash('sha256').update(file.data).digest('hex')).toBe(f.sha256);
    }
    const material = parseMaterialText(new TextDecoder().decode(r.files.find((f) => f.path.endsWith('material.json'))!.data));
    expect(material.ok && material.doc).toEqual(navbar);
    // The zip is what the lab downloads.
    expect(unzip(packageZip(r)).map((e) => e.path)).toEqual(paths);
  });

  it('refuses runtime paths that point into the repository', async () => {
    const bad = { ...runtime, files: [...runtime.files, { path: 'src/lab/main.ts', data: enc.encode('') }] };
    await expect(buildPackage({ material: navbar, kind: 'runtime', runtime: bad, now })).rejects.toThrow(/non ammesso/);
    await expect(buildPackage({ material: navbar, kind: 'runtime', now })).rejects.toThrow(/build:lib/);
  });

  it('WebGL2 materials ship their image and explain how to provide a texture', async () => {
    const doc: MaterialDocument = { ...navbar, id: 'scene-1', target: { backend: 'webgl2', fallback: 'css' }, source: { kind: 'texture', texture: { kind: 'image', url: 'example:tulips' } } };
    const r = await buildPackage({
      material: doc,
      kind: 'runtime',
      runtime,
      now,
      resolveAsset: async () => ({ data: new Uint8Array([1, 2, 3]), type: 'image/jpeg', name: 'tulips.jpg' }),
    });
    expect(r.files.map((f) => f.path)).toContain('jello-scene-1/assets/tulips.jpg');
    const m = JSON.parse(new TextDecoder().decode(r.files.find((f) => f.path.endsWith('material.json'))!.data));
    expect(m.source.texture.url).toBe('assets/tulips.jpg');
    expect(r.manifest.source.instructions).toMatch(/non legge il DOM/);
    expect(new TextDecoder().decode(r.files.find((f) => f.path.endsWith('example/main.js'))!.data)).toContain('createSceneView');
  });

  it('a missing asset is a warning, not a silent omission', async () => {
    const doc: MaterialDocument = { ...navbar, target: { backend: 'webgl2', fallback: 'css' }, source: { kind: 'texture', texture: { kind: 'image', url: 'asset:' + 'f'.repeat(64) } } };
    const r = await buildPackage({ material: doc, kind: 'runtime', runtime, now, resolveAsset: async () => null });
    expect(r.warnings.join()).toMatch(/non disponibile/);
  });
});

describe('export package (CSS only)', () => {
  it('declares the reduced rendering and the ignored parameters', async () => {
    const r = await buildPackage({ material: navbar, kind: 'css-only', now });
    expect(r.manifest.kind).toBe('css-only');
    expect(r.manifest.runtime).toBeNull();
    expect(r.manifest.reducedRendering).toMatch(/resa ridotta/);
    expect(r.manifest.reducedRendering).toMatch(/refraction/);
    expect(r.manifest.support.css?.ignored).toContain('refraction');
    expect(r.files.some((f) => f.path.includes('runtime/'))).toBe(false);
    const css = cssOnlyStylesheet(navbar);
    expect(css).toContain('backdrop-filter: blur(var(--jello-blur))');
    expect(css).toContain('--jello-blur: 4px;');
    expect(css).toContain('prefers-reduced-transparency');
  });
});

describe('examples', () => {
  it('use only the package runtime', () => {
    for (const kind of ['dom', 'scene'] as const) {
      expect(exampleScript(kind)).toContain("from '../runtime/jello.js'");
      expect(exampleScript(kind)).not.toMatch(/src\//);
      expect(exampleHtml(kind, '<x>')).toContain('&lt;x&gt;');
    }
    expect(DOM_FIXTURE_HTML).toContain('id="jelloSource"');
  });
});

describe('export adapters', () => {
  const bt = () => componentTemplate('bt-darts')!.create();
  /** File at `path` relative to the package root. */
  const text = (r: { root: string; files: { path: string; data: Uint8Array }[] }, path: string) => new TextDecoder().decode(r.files.find((f) => f.path === `${r.root}${path}`)!.data);

  it('material packages are installable modules with the material and createGroup', async () => {
    const r = await buildPackage({ material: navbar, kind: 'runtime', runtime, now });
    const pkg = JSON.parse(text(r, '/package.json'));
    expect(pkg).toMatchObject({ name: '@jello-export/navbar-material', type: 'module', exports: { '.': { types: './index.d.ts', import: './index.js' }, './style.css': './runtime/jello.css' } });
    expect(text(r, '/index.js')).toContain("from './runtime/jello.js'");
    expect(text(r, '/index.js')).toContain('"id": "navbar"');
    expect(text(r, '/index.d.ts')).toContain('createGroup(options: Omit<MaterialGroupOptions');
    // No component in a material-only package.
    expect(r.files.some((f) => /component\.json|\.tsx$/.test(f.path))).toBe(false);
  });

  it('the React package contains component, typed wrapper, TSX source, config, material, runtime and example', async () => {
    const doc = bt();
    const r = await componentReactAdapter.build({ component: doc, runtime, now });
    expect(r.root).toBe('jello-bt-darts-react');
    const paths = r.files.map((f) => f.path.slice(r.root.length + 1));
    for (const p of ['package.json', 'index.js', 'index.d.ts', 'src/BtDartsNavigation.tsx', 'component.json', 'material.json', 'runtime/jello.js', 'runtime/types/runtime/index.d.ts', 'example/App.tsx', 'README.md', 'jello-manifest.json']) {
      expect(paths).toContain(p);
    }
    expect(paths.every((p) => !/(^|\/)src\/(lab|stage|core|model)/.test(p) && !p.endsWith('.map'))).toBe(true);
    const pkg = JSON.parse(text(r, '/package.json'));
    expect(pkg).toMatchObject({ name: '@jello-export/bt-darts', peerDependencies: { react: '>=18', 'react-dom': '>=18' } });
    expect(pkg.dependencies).toBeUndefined();
    // Same document everywhere: component.json, the inline config of index.js, the material inside.
    const parsed = parseComponentText(text(r, '/component.json'));
    expect(parsed.ok && parsed.doc).toEqual(doc);
    expect(text(r, '/index.js')).toContain(`export const config = ${serializeComponent(doc)};`);
    expect(parseMaterialText(text(r, '/material.json'))).toMatchObject({ ok: true, doc: doc.material.document });
    // Imports only the bundled runtime and React: no lab, no router.
    const js = text(r, '/index.js');
    const imports = [...js.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['./runtime/jello.js', 'react']);
    const dts = text(r, '/index.d.ts');
    expect(dts).toContain('export type BtDartsTabId = "home" | "live" | "matrix" | "results";');
    expect(dts).toContain('export declare function BtDartsNavigation(props: BtDartsNavigationProps): ReactElement;');
    expect(text(r, '/src/BtDartsNavigation.tsx')).toContain("from '../runtime/jello.js'");
    const m = r.manifest as unknown as { kind: string; component: { tabs: string[] }; files: { path: string; sha256: string }[] };
    expect(m.kind).toBe('component-react');
    expect(m.component.tabs).toEqual(['home', 'live', 'matrix', 'results']);
    for (const f of m.files) expect(createHash('sha256').update(r.files.find((x) => x.path === `${r.root}/${f.path}`)!.data).digest('hex')).toBe(f.sha256);
  });

  it('the tab union follows the edited structure', async () => {
    const doc = bt();
    const added = addTab(doc.root, { label: 'Classifica' });
    const r = await componentReactAdapter.build({ component: { ...doc, name: 'Mia App', root: added.root }, runtime, now });
    expect(r.root).toBe('jello-mia-app-react');
    expect(JSON.parse(text(r, '/package.json')).name).toBe('@jello-export/mia-app');
    expect(text(r, '/index.d.ts')).toContain('export type MiaAppTabId = "home" | "live" | "matrix" | "results" | "tab";');
    expect(text(r, '/index.js')).toContain('export function MiaAppNavigation(props)');
  });

  it('refuses a runtime without declarations or with repository paths', async () => {
    const noTypes = { ...runtime, files: runtime.files.filter((f) => !f.path.startsWith('types/')) };
    await expect(componentReactAdapter.build({ component: bt(), runtime: noTypes, now })).rejects.toThrow(/dichiarazioni/);
    const bad = { ...runtime, files: [...runtime.files, { path: 'src/lab/main.ts', data: enc.encode('') }] };
    await expect(componentReactAdapter.build({ component: bt(), runtime: bad, now })).rejects.toThrow(/non ammesso/);
  });

  it('describes files and dependencies before building, and lists adapters by target', () => {
    const req = { material: navbar, component: bt() };
    expect(adaptersFor('material', req).map((a) => a.id)).toEqual(['material-runtime', 'material-css']);
    expect(adaptersFor('component', req).map((a) => a.id)).toEqual(['component-react']);
    expect(adaptersFor('component', { material: navbar })).toEqual([]);
    expect(adaptersFor('configuration', req).map((a) => a.id)).toEqual(['material-json', 'component-json']);
    const plan = componentReactAdapter.describe(req);
    expect(plan.name).toBe('jello-bt-darts-react.zip');
    expect(plan.dependencies.map((d) => [d.name, d.kind])).toEqual([
      ['@jello/runtime', 'bundled'],
      ['react, react-dom', 'peer'],
    ]);
    expect(EXPORT_ADAPTERS.every((a) => a.describe(req).files.length > 0)).toBe(true);
  });

  it('JSON configuration exports are the documents the lab saves', async () => {
    const c = await exportAdapter('component-json')!.build({ component: bt() });
    expect(c.files[0]!.path).toBe('bt-darts.jello-component.json');
    expect(parseComponentText(new TextDecoder().decode(c.files[0]!.data))).toMatchObject({ ok: true, doc: bt() });
    const m = await exportAdapter('material-json')!.build({ material: navbar });
    expect(parseMaterialText(new TextDecoder().decode(m.files[0]!.data))).toMatchObject({ ok: true, doc: navbar });
  });
});
