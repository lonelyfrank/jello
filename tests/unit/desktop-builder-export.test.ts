import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  addNavbarControl, addNavbarGroup, addNavbarItem, componentTemplate, desktopNavbarRegions, duplicateNavbarItem,
  editDesktopNavbarBreakpoint, moveNavbarGroup, moveNavbarItem, moveNavbarItemToGroup, navbarGroups, navbarItems,
  parseDefinitionText, removeNavbarGroup, removeNavbarItem, renameNavbarGroup, resolveDefinitionMaterial,
  serializeDefinition, setDesktopNavbarRegion, setNavbarItemAction, setNavbarItemStyle, switchMaterialFamily, updateNavbarItem,
} from '../../src/components';
import { componentReactAdapter, componentVanillaAdapter, adaptersFor } from '../../src/export/adapters';
import type { PackageResult, RuntimeBundle } from '../../src/export/package';
import { openRepository } from '../../src/lab/storage/repository';
import { createProject } from '../../src/project/document';
import { minimalAssets } from '../../src/project/defaults';
import { buildProjectPackage, packageBytes, readProjectEntries, readZip } from '../../src/project/package';

const demo = () => componentTemplate('desktop-navbar')!.create();
const runtime: RuntimeBundle = { version: '0.3.0', files: ['jello.js', 'jello.css', 'types/runtime/index.d.ts'].map((path) => ({ path, data: new TextEncoder().encode('export {};') })) };
const file = (p: PackageResult, path: string) => new TextDecoder().decode(p.files.find((f) => f.path === `${p.root}/${path}`)!.data);
const roundtrip = (doc: ReturnType<typeof demo>) => expect(parseDefinitionText(serializeDefinition(doc))).toMatchObject({ ok: true, warnings: [], doc });

function edited() {
  const initial = demo();
  let doc = updateNavbarItem(initial, 'brand', { label: 'My studio', icon: { kind: 'builtin', name: 'settings' }, accessibleLabel: 'Go home' });
  doc = setNavbarItemStyle(doc, 'brand', 'fontSize', 18);
  doc = setNavbarItemStyle(doc, 'action', 'iconSize', 28);
  const added = addNavbarItem(doc, { label: 'Docs', action: { kind: 'navigate', href: '/docs', target: '_blank' } });
  const group = addNavbarGroup(added.definition, 'Secondary');
  doc = setDesktopNavbarRegion(group.definition, added.id, 'end')!;
  doc = setDesktopNavbarRegion(doc, group.id, 'end')!;
  doc = moveNavbarItemToGroup(doc, added.id, group.id);
  doc = renameNavbarGroup(doc, group.id, 'Resources');
  doc = setNavbarItemAction(doc, 'action', { kind: 'consumer', name: 'create-project' });
  return { doc, group: group.id, added: added.id, initial };
}

describe('Desktop Builder canonical operations', () => {
  it('edits brand, action and grouped entries without changing IDs, material or unrelated sections', () => {
    const { doc, initial, group, added } = edited();
    expect(doc.structure.children?.find((n) => n.id === 'brand')?.role).toBe('brand');
    expect(doc.structure.children?.find((n) => n.id === 'action')?.role).toBe('action');
    expect(doc.material).toBe(initial.material);
    expect(doc.responsive).toBe(initial.responsive);
    expect(doc.style.items).toMatchObject({ brand: { fontSize: 18 }, action: { iconSize: 28 } });
    expect(navbarGroups(doc)).toEqual([{ id: group, label: 'Resources', itemIds: [added] }]);
    expect(desktopNavbarRegions(doc).end.at(-1)?.id).toBe(added);
    roundtrip(doc);
    expect(navbarItems(initial).find((n) => n.id === 'brand')?.label).toBe('Your brand');
  });
  it('duplicates, reorders, moves and unwraps while preserving roles, regions, styles and stable IDs', () => {
    const { doc, group, added } = edited();
    const copy = duplicateNavbarItem(doc, added);
    let next = moveNavbarItem(copy.definition, copy.id, 0);
    next = moveNavbarGroup(next, group, 0);
    expect(navbarGroups(next)[0]?.itemIds).toEqual([copy.id, added]);
    next = removeNavbarGroup(next, group);
    expect(desktopNavbarRegions(next).end.map((n) => n.id)).toContain(copy.id);
    next = removeNavbarItem(next, copy.id);
    expect(navbarItems(next).some((n) => n.id === copy.id)).toBe(false);
    roundtrip(next);
  });
  it('adds explicit Desktop actions and restores an optional brand, refusing slot limits and invalid input atomically', () => {
    const before = demo(), serialized = serializeDefinition(before);
    expect(() => addNavbarControl(before, 'brand')).toThrow();
    let next = removeNavbarItem(before, 'brand');
    const brand = addNavbarControl(next, 'brand', { label: 'Restored' });
    expect(navbarItems(brand.definition).find((n) => n.id === brand.id)?.role).toBe('brand');
    for (let i = 0; i < 3; i++) next = addNavbarControl(next, 'action').definition;
    expect(() => addNavbarControl(next, 'action')).toThrow();
    expect(() => setNavbarItemAction(before, 'action', { kind: 'consumer', name: 'not valid!' })).toThrow();
    expect(() => setNavbarItemStyle(before, 'brand', 'fontSize', -1)).toThrow();
    expect(serializeDefinition(before)).toBe(serialized);
    roundtrip(brand.definition);
  });
  it('adds brand/actions at the 200-item boundary without temporarily exceeding the item limit', () => {
    let full = removeNavbarItem(demo(), 'brand');
    for (let i = 4; i < 200; i++) full = addNavbarItem(full, { label: `Item ${i}` }).definition;
    full = addNavbarControl(full, 'brand').definition;
    full = addNavbarControl(full, 'action').definition;
    expect(navbarItems(full).filter((n) => n.role === 'item')).toHaveLength(200);
    roundtrip(full);
  });
  it('edits Desktop breakpoints with the canonical validator and rejects unsupported paths/ranges', () => {
    const before = demo();
    let doc = editDesktopNavbarBreakpoint(before, null, { maxWidth: 700 });
    const points = doc.responsive.breakpoints as { id: string; maxWidth: number; overrides: Record<string, unknown> }[];
    const id = points.at(-1)!.id;
    doc = editDesktopNavbarBreakpoint(doc, id, { set: ['layout.compact', true] });
    doc = editDesktopNavbarBreakpoint(doc, id, { set: ['style.typography.fontSize', 16] });
    expect(() => editDesktopNavbarBreakpoint(doc, id, { set: ['layout.offset', 4] })).toThrow();
    expect(() => editDesktopNavbarBreakpoint(doc, id, { maxWidth: 0 })).toThrow();
    expect(() => editDesktopNavbarBreakpoint(doc, id, { set: ['layout.gap', -1] })).toThrow();
    expect(points.at(-1)?.overrides).toEqual({});
    roundtrip(doc);
  });
});

describe('Desktop persistence and exports', () => {
  it.each(['glass', 'solid'])('%s: IndexedDB reopening and .jello ZIP preserve canonical edits and material bindings', async (family) => {
    const doc = switchMaterialFamily(edited().doc, family).definition;
    const factory = new IDBFactory(), name = `m53-${family}`;
    const repo = await openRepository(factory, name);
    const at = '2026-10-31T00:00:00.000Z';
    await repo.putComponent({ id: doc.id, doc, createdAt: at, updatedAt: at });
    repo.close();
    const again = await openRepository(factory, name);
    expect((await again.listComponents()).items[0]?.doc).toEqual(doc);
    again.close();
    const project = createProject({ id: 'm53', name: 'Desktop project', platform: 'web', assets: minimalAssets(), at });
    const result = readProjectEntries(await readZip(packageBytes(buildProjectPackage(project, { materials: [], components: [doc], colors: true, icons: 'used', fonts: false }))));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.components[0]?.doc).toEqual(doc);
    roundtrip(doc);
  });
  it.each(['glass', 'solid'])('%s: both adapters include definitions, resolved material, runtime bytes, types, examples and verifiable hashes', async (family) => {
    const component = switchMaterialFamily(edited().doc, family).definition;
    expect(adaptersFor('component', { component }).map((a) => a.id)).toEqual(['component-react', 'component-vanilla']);
    for (const adapter of [componentReactAdapter, componentVanillaAdapter]) {
      const pkg = await adapter.build({ component, runtime, now: '2026-10-31T00:00:00.000Z' });
      expect(JSON.parse(file(pkg, 'component.json'))).toEqual(JSON.parse(serializeDefinition(component)));
      expect(JSON.parse(file(pkg, 'material.json'))).toEqual(resolveDefinitionMaterial(component));
      expect(file(pkg, 'index.js')).toContain('createComponent');
      expect(file(pkg, 'index.js')).not.toContain('createBottomNavigation');
      expect(file(pkg, 'index.d.ts')).toContain('DesktopNavbarDefinition');
      const manifest = JSON.parse(file(pkg, 'jello-manifest.json'));
      for (const entry of manifest.files) {
        const data = pkg.files.find((f) => f.path === `${pkg.root}/${entry.path}`)!.data;
        expect(entry.bytes).toBe(data.length);
        expect(entry.sha256).toBe(createHash('sha256').update(data).digest('hex'));
      }
      expect(file(pkg, 'runtime/jello.js')).toBe('export {};');
      expect(file(pkg, 'README.md')).toContain('source');
      if (adapter === componentReactAdapter) {
        expect(file(pkg, 'index.d.ts')).toContain('onAction');
        expect(file(pkg, 'src/DesktopNavbar.tsx')).toContain('instance.destroy()');
      } else {
        expect(file(pkg, 'index.d.ts')).toContain('DesktopNavigationOptions');
        expect(JSON.parse(file(pkg, 'package.json')).peerDependencies).toBeUndefined();
      }
    }
  });
});
