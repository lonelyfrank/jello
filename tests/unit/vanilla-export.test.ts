import { describe, expect, it } from 'vitest';
import { componentTemplate, parseDefinitionText, resolveDefinitionMaterial, switchMaterialFamily } from '../../src/components';
import { SOLID_PRESETS, parseMaterialText } from '../../src/model';
import { adaptersFor, componentVanillaAdapter, materialRuntimeAdapter } from '../../src/export/adapters';
import { sha256Hex, type PackageResult, type RuntimeBundle } from '../../src/export/package';

const enc = new TextEncoder();
const runtime: RuntimeBundle = { version: '0.3.0', files: [
  { path: 'jello.js', data: enc.encode('export {};') },
  { path: 'jello.css', data: enc.encode('.jello-btn {}') },
  { path: 'types/runtime/index.d.ts', data: enc.encode('export {};') },
] };
const get = (pkg: PackageResult, path: string) => new TextDecoder().decode(pkg.files.find((f) => f.path === `${pkg.root}/${path}`)!.data);

describe('Vanilla packages', () => {
  for (const type of ['button', 'mobile-navbar']) for (const family of ['glass', 'solid']) {
    it(`${type}/${family} carries canonical data, exact runtime bytes, complete manifest and no peers`, async () => {
      const component = switchMaterialFamily(componentTemplate(type)!.create(), family).definition;
      const pkg = await componentVanillaAdapter.build({ component, runtime, now: '2026-10-30T00:00:00.000Z' });
      expect(parseDefinitionText(get(pkg, 'component.json'))).toMatchObject({ ok: true, doc: component });
      expect(parseMaterialText(get(pkg, 'material.json'))).toMatchObject({ ok: true, doc: resolveDefinitionMaterial(component) });
      expect(JSON.parse(get(pkg, 'package.json')).peerDependencies).toBeUndefined();
      for (const file of runtime.files) expect(pkg.files.find((f) => f.path === `${pkg.root}/runtime/${file.path}`)!.data).toEqual(file.data);
      const manifest = JSON.parse(get(pkg, 'jello-manifest.json'));
      expect(manifest).toMatchObject({ kind: 'component-vanilla', dependencies: { peer: {} }, lifecycle: ['mount', 'update', 'unmount', 'destroy'], reducedRendering: null });
      for (const file of manifest.files) {
        const bytes = pkg.files.find((f) => f.path === `${pkg.root}/${file.path}`)!.data;
        expect(await sha256Hex(bytes)).toBe(file.sha256);
      }
      expect(get(pkg, 'example/index.html')).toContain('../runtime/jello.css');
      expect(get(pkg, 'example/main.js')).toContain("from '../index.js'");
    });
  }

  it('refuses incomplete and unsafe runtime bundles', async () => {
    const component = componentTemplate('button')!.create();
    await expect(componentVanillaAdapter.build({ component, runtime: { ...runtime, files: [] } })).rejects.toThrow(/incompleto/);
    for (const path of ['../outside.js', '/absolute.js', 'src/lab/main.ts', 'chunks\\escape.js']) {
      await expect(componentVanillaAdapter.build({ component, runtime: { ...runtime, files: [...runtime.files, { path, data: enc.encode('') }] } })).rejects.toThrow(/non ammesso/);
    }
  });

  it('exports standalone Solid with interactive runtime and exposes it as a destination', async () => {
    const material = SOLID_PRESETS[0]!.doc;
    expect(adaptersFor('material', { material }).map((a) => a.id)).toEqual(['material-runtime']);
    const pkg = await materialRuntimeAdapter.build({ material, runtime });
    expect(parseMaterialText(get(pkg, 'material.json'))).toMatchObject({ ok: true, doc: material });
    expect(JSON.parse(get(pkg, 'jello-manifest.json'))).toMatchObject({ material: { family: 'solid' }, dependencies: { peer: {} }, reducedRendering: null });
  });
});
