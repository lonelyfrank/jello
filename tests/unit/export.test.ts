import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildPackage, cssOnlyStylesheet, packageZip, type RuntimeBundle } from '../../src/export/package';
import { DOM_FIXTURE_HTML, exampleHtml, exampleScript } from '../../src/export/example';
import { crc32, unzip, zip } from '../../src/export/zip';
import { builtinMaterial, parseMaterialText, type GlassDocument } from '../../src/model';
import { addTab, componentTemplate, editNavbar, glassMaterialOf, parseDefinitionText, resolveDefinitionMaterial, serializeDefinition, setButtonLink, switchMaterialFamily, type ComponentDefinition } from '../../src/components';
import { buildReactPackage, reactNames } from '../../src/export/react';
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
    const doc: GlassDocument = { ...navbar, id: 'scene-1', target: { backend: 'webgl2', fallback: 'css' }, source: { kind: 'texture', texture: { kind: 'image', url: 'example:tulips' } } };
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
    const doc: GlassDocument = { ...navbar, target: { backend: 'webgl2', fallback: 'css' }, source: { kind: 'texture', texture: { kind: 'image', url: 'asset:' + 'f'.repeat(64) } } };
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
  const demo = () => componentTemplate('mobile-navbar')!.create();
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
    const doc = demo();
    const r = await componentReactAdapter.build({ component: doc, runtime, now });
    expect(r.root).toBe('jello-mobile-navbar-react');
    const paths = r.files.map((f) => f.path.slice(r.root.length + 1));
    for (const p of ['package.json', 'index.js', 'index.d.ts', 'src/MobileNavbar.tsx', 'component.json', 'material.json', 'runtime/jello.js', 'runtime/types/runtime/index.d.ts', 'example/App.tsx', 'README.md', 'jello-manifest.json']) {
      expect(paths).toContain(p);
    }
    expect(paths.every((p) => !/(^|\/)src\/(lab|stage|core|model)/.test(p) && !p.endsWith('.map'))).toBe(true);
    const pkg = JSON.parse(text(r, '/package.json'));
    expect(pkg).toMatchObject({ name: '@jello-export/mobile-navbar', peerDependencies: { react: '>=18', 'react-dom': '>=18' } });
    expect(pkg.dependencies).toBeUndefined();
    // Same document everywhere: component.json, the inline config of index.js, the material inside.
    const parsed = parseDefinitionText(text(r, '/component.json'));
    expect(parsed.ok && parsed.doc).toEqual(doc);
    expect(text(r, '/index.js')).toContain(`export const config = ${serializeDefinition(doc)};`);
    expect(parseMaterialText(text(r, '/material.json'))).toMatchObject({ ok: true, doc: glassMaterialOf(doc) });
    // Imports only the bundled runtime and React: no lab, no router.
    const js = text(r, '/index.js');
    const imports = [...js.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['./runtime/jello.js', 'react']);
    const dts = text(r, '/index.d.ts');
    expect(dts).toContain('export type MobileNavbarTabId = "home" | "explore" | "profile";');
    expect(dts).toContain('export declare function MobileNavbar(props: MobileNavbarProps): ReactElement;');
    expect(text(r, '/src/MobileNavbar.tsx')).toContain("from '../runtime/jello.js'");
    const m = r.manifest as unknown as { kind: string; component: { tabs: string[] }; files: { path: string; sha256: string }[] };
    expect(m.kind).toBe('component-react');
    expect(m.component.tabs).toEqual(['home', 'explore', 'profile']);
    for (const f of m.files) expect(createHash('sha256').update(r.files.find((x) => x.path === `${r.root}/${f.path}`)!.data).digest('hex')).toBe(f.sha256);
  });

  it('the tab union follows the edited structure', async () => {
    const doc = demo();
    const edited = editNavbar(doc, (root) => addTab(root, { label: 'Classifica' }).root);
    const r = await componentReactAdapter.build({ component: { ...edited, name: 'Mia App' }, runtime, now });
    expect(r.root).toBe('jello-mia-app-react');
    expect(JSON.parse(text(r, '/package.json')).name).toBe('@jello-export/mia-app');
    expect(text(r, '/index.d.ts')).toContain('export type MiaAppTabId = "home" | "explore" | "profile" | "tab";');
    expect(text(r, '/index.js')).toContain('export function MiaAppNavigation(props)');
  });

  it('refuses a runtime without declarations or with repository paths', async () => {
    const noTypes = { ...runtime, files: runtime.files.filter((f) => !f.path.startsWith('types/')) };
    await expect(componentReactAdapter.build({ component: demo(), runtime: noTypes, now })).rejects.toThrow(/dichiarazioni/);
    const bad = { ...runtime, files: [...runtime.files, { path: 'src/lab/main.ts', data: enc.encode('') }] };
    await expect(componentReactAdapter.build({ component: demo(), runtime: bad, now })).rejects.toThrow(/non ammesso/);
  });

  it('describes files and dependencies before building, and lists adapters by target', () => {
    const req = { material: navbar, component: demo() };
    expect(adaptersFor('material', req).map((a) => a.id)).toEqual(['material-runtime', 'material-css']);
    expect(adaptersFor('component', req).map((a) => a.id)).toEqual(['component-react', 'component-vanilla']);
    expect(adaptersFor('component', { material: navbar })).toEqual([]);
    expect(adaptersFor('configuration', req).map((a) => a.id)).toEqual(['material-json', 'component-json']);
    const plan = componentReactAdapter.describe(req);
    expect(plan.name).toBe('jello-mobile-navbar-react.zip');
    expect(plan.dependencies.map((d) => [d.name, d.kind])).toEqual([
      ['@jello/runtime', 'bundled'],
      ['react, react-dom', 'peer'],
    ]);
    expect(EXPORT_ADAPTERS.every((a) => a.describe(req).files.length > 0)).toBe(true);
  });

  it('JSON configuration exports are the documents the lab saves', async () => {
    const c = await exportAdapter('component-json')!.build({ component: demo() });
    expect(c.files[0]!.path).toBe('mobile-navbar.jello-component.json');
    expect(parseDefinitionText(new TextDecoder().decode(c.files[0]!.data))).toMatchObject({ ok: true, doc: demo() });
    const m = await exportAdapter('material-json')!.build({ material: navbar });
    expect(parseMaterialText(new TextDecoder().decode(m.files[0]!.data))).toMatchObject({ ok: true, doc: navbar });
  });
});


describe('React packages of any component and material', () => {
  const rt: RuntimeBundle = { ...runtime, version: '0.3.0' };
  const get = (r: { files: { path: string; data: Uint8Array }[] }, end: string) => new TextDecoder().decode(r.files.find((f) => f.path.endsWith(end))!.data);
  const solid = (d: ComponentDefinition) => switchMaterialFamily(d, 'solid').definition;
  const cta = () => componentTemplate('button')!.create();

  it('names follow the component: a button is «…Button», with its variants as the second type', () => {
    expect(reactNames(cta())).toEqual({ component: 'Button', tabType: 'ButtonVariant', packageName: '@jello-export/button', root: 'jello-button-react' });
    expect(reactNames({ ...cta(), name: 'Call to action' }).component).toBe('CallToActionButton');
    expect(reactNames(componentTemplate('mobile-navbar')!.create()).component).toBe('MobileNavbar');
  });

  it('a Button package mounts the runtime’s button and carries the definition, the material and the runtime — no renderer of its own', async () => {
    const d = cta();
    const r = await buildReactPackage({ component: d, runtime: rt, now });
    const paths = r.files.map((f) => f.path.replace(`${r.root}/`, ''));
    for (const p of ['package.json', 'index.js', 'index.d.ts', 'src/Button.tsx', 'component.json', 'material.json', 'runtime/jello.js', 'runtime/jello.css', 'example/App.tsx', 'README.md', 'jello-manifest.json']) expect(paths).toContain(p);
    const js = get(r, '/index.js');
    expect(js).toMatch(/import \{ createButton \} from '\.\/runtime\/jello\.js'/);
    // The wrapper renders nothing itself: one empty box for React, the runtime fills it.
    expect(js).not.toMatch(/createElement\('(button|a|span|svg)'/);
    expect(js).not.toMatch(/\.style\.setProperty|dataset\./);
    expect(get(r, '/src/Button.tsx')).toContain("createButton");
    // component.json is the definition the lab saves, material.json its material.
    const parsed = parseDefinitionText(get(r, '/component.json'));
    expect(parsed.ok && serializeDefinition(parsed.doc)).toBe(serializeDefinition(d));
    expect(parseMaterialText(get(r, '/material.json'))).toMatchObject({ ok: true, doc: resolveDefinitionMaterial(d) });
    expect(JSON.parse(get(r, '/package.json'))).toMatchObject({ name: '@jello-export/button', peerDependencies: { react: '>=18' } });
    expect(get(r, '/index.d.ts')).toMatch(/export type ButtonVariant = 'primary' \| 'secondary' \| 'ghost'/);
    expect(get(r, '/index.d.ts')).toMatch(/onPress\?: \(event: ButtonEvent\) => void/);
    const m = r.manifest as unknown as { component: { type: string; unsupported: unknown[] }; backend: { requested: string }; events: Record<string, string>; files: { path: string }[] };
    expect(m.component).toMatchObject({ type: 'button', unsupported: [] });
    expect(m.events).toMatchObject({ press: 'jello-press', hover: 'jello-hover', focus: 'jello-focus' });
    expect(m.files.map((f) => f.path)).toContain('component.json');
    expect(r.warnings).toEqual([]);
    expect(get(r, '/README.md')).toMatch(/Azione: un `<button type="button">`/);
  });

  it('a link button says so: <a href>, no navigation of its own', async () => {
    const link = setButtonLink(cta(), 'link', '/prezzi')!;
    const r = await buildReactPackage({ component: link, runtime: rt, now });
    expect(get(r, '/README.md')).toMatch(/un `<a href="\/prezzi">`.*il componente non naviga/);
    expect(JSON.parse(get(r, '/component.json')).interactions.behavior.semantics).toBe('link');
  });

  it('a Solid button ships as a component: Solid material, no backend, and what Solid cannot render is reported', async () => {
    const d = solid(cta());
    const r = await buildReactPackage({ component: d, runtime: rt, now });
    const material = parseMaterialText(get(r, '/material.json'));
    expect(material.ok && material.doc.family).toBe('solid');
    const m = r.manifest as unknown as { backend: { requested: string; candidates: unknown[] }; component: { unsupported: { path: string }[] }; material: { family: string } };
    expect(m.material.family).toBe('solid');
    expect(m.backend).toMatchObject({ requested: 'none', candidates: [] });
    expect(m.component.unsupported.map((u) => u.path)).toContain('states.hover.style.background');
    expect(r.warnings.join('\n')).toMatch(/Senza effetto|Proprietà senza effetto con Solid · neutro: states\.hover\.style\.background/);
    expect(get(r, '/README.md')).toMatch(/## Proprietà non applicate a questo materiale[\s\S]*states\.hover\.style\.background/);
    expect(get(r, '/README.md')).toMatch(/Solid: una superficie CSS/);
    // No Glass source is needed: the example still compiles as written.
    expect(get(r, '/README.md')).toMatch(/<Button onPress=/);
  });

  it('a Solid mobile navbar ships with its tabs and the same wrapper as a Glass one', async () => {
    const d = solid(componentTemplate('mobile-navbar')!.create());
    const r = await buildReactPackage({ component: d, runtime: rt, now });
    expect(get(r, '/index.js')).toMatch(/createBottomNavigation/);
    expect(get(r, '/index.d.ts')).toMatch(/MobileNavbarTabId = "home" \| "explore" \| "profile"/);
    expect((r.manifest as unknown as { material: { family: string } }).material.family).toBe('solid');
    expect(get(r, '/README.md')).toMatch(/Solid: una superficie CSS/);
    expect(get(r, '/README.md')).toMatch(/style\.appearance\.foreground/);
    expect(r.warnings.join('\n')).toMatch(/style\.appearance\.foreground/);
  });

  it('adapters: Solid has a material runtime package and both component destinations', async () => {
    const d = solid(cta());
    const material = resolveDefinitionMaterial(d);
    const req = { material, component: d, runtime: rt, now };
    expect(adaptersFor('material', req).map((a) => a.id)).toEqual(['material-runtime']);
    expect(adaptersFor('component', req).map((a) => a.id)).toEqual(['component-react', 'component-vanilla']);
    expect(adaptersFor('configuration', req).map((a) => a.id)).toEqual(['material-json', 'component-json']);
    expect((await exportAdapter('material-runtime')!.build(req)).files.some((f) => f.path.endsWith('/index.js'))).toBe(true);
    const plan = componentReactAdapter.describe(req);
    expect(plan.name).toBe('jello-button-react.zip');
    expect(plan.files.map((f) => f.path).join(' ')).toContain('src/Button.tsx');
    expect(plan.notes.join(' ')).toMatch(/Senza effetto con Solid · neutro: states\.hover\.style\.background/);
    const json = await exportAdapter('material-json')!.build(req);
    const text = new TextDecoder().decode(json.files[0]!.data);
    expect(parseMaterialText(text)).toMatchObject({ ok: true, doc: { family: 'solid' } });
  });
});
