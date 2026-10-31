import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COMPONENTS, NavbarStructureError, addNavbarGroup, addNavbarItem, applyNavbarView, componentTemplate,
  definitionFields, duplicateNavbarItem, editNavbar, iconFromSvg, isSafeNavigationHref,
  moveNavbarGroup, moveNavbarItem, moveNavbarItemToGroup, navbarActiveItem, navbarGroups,
  navbarItems, navbarView, parseDefinition, parseDefinitionText, removeNavbarGroup, removeNavbarItem,
  reorderNavbarItems, resolveDesktopNavbar, resolveNavbar, serializeDefinition, setDesktopNavbarField,
  setNavbarField, setNavbarItemAction, setNavbarItemDisabled, setNavbarItemVisibility, setDesktopNavbarRegion,
  addBreakpoint, updateBreakpoint,
  starterDefinition, switchMaterialFamily, updateNavbarItem, updateTab,
  type ComponentDefinition, type NavbarAction,
} from '../../src/components';
import { importComponentText } from '../../src/migration';
import { openRepository } from '../../src/lab/storage/repository';
import { createProject } from '../../src/project/document';
import { minimalAssets } from '../../src/project/defaults';
import { buildProjectPackage, packageBytes, readProjectEntries, readZip } from '../../src/project/package';
import { buildReactPackage } from '../../src/export/react';
import { buildVanillaPackage } from '../../src/export/vanilla';
import type { RuntimeBundle } from '../../src/export/package';

const demo = () => componentTemplate('mobile-navbar')!.create();
const ids = (d: ComponentDefinition) => navbarItems(d).map((n) => n.id);
const roundtrip = (d: ComponentDefinition) => {
  const r = parseDefinitionText(serializeDefinition(d));
  expect(r.ok ? r.warnings : r.errors).toEqual([]);
  expect(r).toMatchObject({ ok: true, doc: d });
};
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}
function grouped(type: 'mobile-navbar' | 'desktop-navbar' = 'mobile-navbar') {
  const base = type === 'mobile-navbar' ? demo() : starterDefinition(type);
  const group = addNavbarGroup(base, 'Principale', 0);
  return { definition: moveNavbarItemToGroup(group.definition, navbarItems(base).find((n) => n.role === 'item')!.id, group.id), groupId: group.id };
}

describe('canonical navigation identity and structure', () => {
  it('inserts at a position, permits repeated payloads and never derives identity from labels or URLs', () => {
    const before = freeze(demo());
    const a = addNavbarItem(before, { label: 'Uguale', value: '/same' }, { index: 1 });
    const b = addNavbarItem(a.definition, { label: 'Uguale', value: '/same' }, { index: 1 });
    expect(ids(b.definition)).toEqual(['home', b.id, a.id, 'explore', 'profile']);
    expect(a.id).not.toBe(b.id);
    expect(navbarItems(b.definition).filter((n) => n.value === '/same')).toHaveLength(2);
    expect(updateNavbarItem(b.definition, a.id, { label: 'Diversa', value: '/other' }).content[a.id]?.value).toBe('/other');
    expect(ids(before)).toEqual(['home', 'explore', 'profile']);
    roundtrip(b.definition);
  });

  it('avoids collisions with every node, including slots and groups', () => {
    const doc = demo();
    doc.structure.children![0]!.children![0]!.id = 'tab';
    doc.content.tab = doc.content['home-icon']!; delete doc.content['home-icon'];
    const added = addNavbarItem(doc);
    expect(added.id).toBe('tab-2');
    roundtrip(added.definition);
    const bad = structuredClone(doc);
    bad.structure.children![1]!.id = 'tab';
    expect(parseDefinition(bad).ok).toBe(false);
  });

  it('duplicates all content, SVG, state flags, action and style with new IDs', () => {
    const svg = iconFromSvg('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/></svg>', 'circle');
    if (!svg.ok) throw new Error(svg.errors.join());
    const d = updateNavbarItem(demo(), 'explore', { icon: svg.icon, value: 'same', disabled: true, visible: false, description: 'Aiuto', accessibleLabel: 'Esplora', iconPosition: 'end', action: { kind: 'consumer', name: 'open' } });
    d.style.items = { explore: { iconSize: 28, fontSize: 14 } };
    const before = freeze(d);
    const copy = duplicateNavbarItem(before, 'explore');
    expect(copy.id).not.toBe('explore');
    const { id: _id, ...original } = navbarItems(before)[1]!;
    const { id: _copyId, ...duplicated } = navbarItems(copy.definition)[2]!;
    expect(duplicated).toEqual(original);
    expect((copy.definition.style.items as Record<string, unknown>)[copy.id]).toEqual({ iconSize: 28, fontSize: 14 });
    const all: string[] = [];
    const walk = (n: ComponentDefinition['structure']) => { all.push(n.id); n.children?.forEach(walk); }; walk(copy.definition.structure);
    expect(new Set(all).size).toBe(all.length);
    expect(copy.definition.material).toBe(before.material);
    roundtrip(copy.definition);
  });

  it('moves and reorders without changing IDs; rejects partial, duplicate and foreign permutations', () => {
    const d = freeze(demo());
    expect(ids(moveNavbarItem(d, 'home', 2))).toEqual(['explore', 'profile', 'home']);
    expect(ids(reorderNavbarItems(d, ['profile', 'home', 'explore']))).toEqual(['profile', 'home', 'explore']);
    for (const order of [['home'], ['home', 'home', 'profile'], ['home', 'explore', 'missing']]) expect(() => reorderNavbarItems(d, order)).toThrow(NavbarStructureError);
    expect(ids(d)).toEqual(['home', 'explore', 'profile']);
  });

  it('throws for nonexistent items/groups, invalid indices, invalid types and last required item', () => {
    const d = demo();
    for (const op of [() => updateNavbarItem(d, 'missing', {}), () => removeNavbarItem(d, 'missing'), () => duplicateNavbarItem(d, 'missing'), () => moveNavbarItem(d, 'missing', 0), () => moveNavbarItem(d, 'home', -1), () => moveNavbarItem(d, 'home', 3), () => moveNavbarItem(d, 'home', NaN), () => addNavbarItem(d, {}, { index: 99 }), () => addNavbarItem(d, {}, { groupId: 'missing' }), () => removeNavbarGroup(d, 'missing'), () => moveNavbarItemToGroup(d, 'home', 'missing'), () => addNavbarItem(starterDefinition('button'))]) expect(op).toThrow(NavbarStructureError);
    const one = removeNavbarItem(removeNavbarItem(d, 'explore'), 'profile');
    expect(() => removeNavbarItem(one, 'home')).toThrow(/ultima voce/);
    expect(() => updateNavbarItem(d, 'home', { id: 'changed' } as never)).toThrow(/sconosciuta/);
  });

  it('repairs selection intentionally on deletion, visibility, disabled or action changes; transient state is rejected', () => {
    const d = demo();
    expect(removeNavbarItem(d, 'home').interactions.behavior.defaultItem).toBe('explore');
    expect(setNavbarItemVisibility(d, 'home', false).interactions.behavior.defaultItem).toBe('explore');
    expect(setNavbarItemDisabled(d, 'home', true).interactions.behavior.defaultItem).toBe('explore');
    expect(setNavbarItemAction(d, 'home', { kind: 'consumer', name: 'run' }).interactions.behavior.defaultItem).toBe('explore');
    let hidden = d;
    for (const id of ids(d)) hidden = setNavbarItemVisibility(hidden, id, false);
    expect(navbarActiveItem(hidden)).toBe('');
    roundtrip(hidden);
    expect(parseDefinition({ ...d, content: { ...d.content, home: { hovered: true, focused: true, pressed: true } } }).ok).toBe(false);
  });

  it.each(['mobile-navbar', 'desktop-navbar'] as const)('%s can expose the current URL item as active without conflating navigation and selection', (type) => {
    const def = type === 'mobile-navbar' ? demo() : starterDefinition(type);
    const id = navbarItems(def).find((n) => n.role === 'item')!.id;
    const linked = setNavbarItemAction(def, id, { kind: 'navigate', href: '/docs' });
    expect(navbarActiveItem(linked, id)).toBe(id);
    expect(navbarActiveItem(setNavbarItemDisabled(linked, id, true), id)).not.toBe(id);
  });

  it('limits the total item count across groups', () => {
    let d = demo();
    // Build a large valid fixture without making the test depend on operation performance.
    const prototype = d.structure.children![0]!;
    d = { ...d, structure: { ...d.structure, children: Array.from({ length: 200 }, (_, i) => ({ id: `item-${i}`, role: prototype.role })) }, content: { root: d.content.root! } };
    d = { ...d, interactions: { ...d.interactions, behavior: { ...d.interactions.behavior, defaultItem: 'item-0' } } };
    expect(parseDefinition(d).ok).toBe(true);
    expect(() => addNavbarItem(d)).toThrow(/200/);
  });

  it('refuses implicit repairs in operations; import normalizes explicitly before edits', () => {
    const bad = demo();
    bad.content['home-icon'] = { icon: { kind: 'builtin', name: 'missing-icon' } };
    expect(() => moveNavbarItem(bad, 'home', 1)).toThrow(/da importare/);
    const parsed = parseDefinition(bad);
    if (!parsed.ok) throw new Error(parsed.errors.join());
    expect(parsed.warnings.join()).toMatch(/uso «star»/);
    expect(() => moveNavbarItem(parsed.doc, 'home', 1)).not.toThrow();
    expect(() => setNavbarItemAction(demo(), 'home', null as never)).toThrow(NavbarStructureError);
  });
});

describe('bounded logical groups', () => {
  it.each(['mobile-navbar', 'desktop-navbar'] as const)('%s shares insertion, grouping, internal order and ungroup semantics', (type) => {
    const { definition: d, groupId } = grouped(type);
    const originalId = navbarGroups(d)[0]!.itemIds[0]!;
    const added = addNavbarItem(freeze(d), { label: 'Nuova' }, { groupId, index: 0 });
    const copy = duplicateNavbarItem(added.definition, originalId);
    expect(navbarGroups(copy.definition)[0]?.itemIds).toEqual([added.id, originalId, copy.id]);
    const reordered = reorderNavbarItems(copy.definition, [copy.id, originalId, added.id], groupId);
    const last = moveNavbarItemToGroup(reordered, added.id, null, 0);
    expect(navbarGroups(last)[0]?.itemIds).toEqual([copy.id, originalId]);
    const ungrouped = removeNavbarGroup(last, groupId);
    expect(navbarGroups(ungrouped)).toEqual([]);
    expect(new Set(ids(ungrouped))).toEqual(new Set(ids(last)));
    roundtrip(reordered); roundtrip(ungrouped);
  });

  it('keeps explicit group order and permits empty groups but rejects nesting and incompatible membership', () => {
    const { definition, groupId } = grouped();
    const next = addNavbarGroup(definition, 'Vuoto');
    expect(navbarGroups(moveNavbarGroup(next.definition, next.id, 0)).map((g) => g.id)).toEqual([next.id, groupId]);
    roundtrip(next.definition);
    const bad = structuredClone(next.definition);
    bad.structure.children!.find((g) => g.id === groupId)!.children!.push({ id: 'nested', role: 'group' });
    expect(parseDefinition(bad).ok).toBe(false);
    const desktop = grouped('desktop-navbar');
    expect(() => moveNavbarItemToGroup(desktop.definition, 'brand', desktop.groupId)).toThrow(/soltanto voci/);
    const regions = { ...desktop.definition, layout: { ...desktop.definition.layout, regions: { [desktop.groupId]: 'end' } } };
    expect(() => moveNavbarItemToGroup(regions, 'pricing', desktop.groupId)).toThrow(/incompatibili/);
    const ungrouped = removeNavbarGroup(regions, desktop.groupId);
    expect((ungrouped.layout.regions as Record<string, string>).docs).toBe('end');
  });
});

describe('integrity and compatibility', () => {
  it('preserves unrelated fields, personal material parameters, events, breakpoints and state styles', () => {
    const g = grouped();
    const doc = { ...g.definition, layout: { ...g.definition.layout, migrationExtension: { retained: true } }, material: { ...g.definition.material, params: { blur: 9 } }, responsive: { ...g.definition.responsive, breakpoints: [{ id: 'small', maxWidth: 400, overrides: { 'layout.labels': 'active', 'layout.icons': 'hide', 'layout.compact': true } }] }, interactions: { ...g.definition.interactions, events: { ...g.definition.interactions.events, action: 'custom-action' } } };
    const before = freeze(doc);
    const next = duplicateNavbarItem(before, 'home').definition;
    for (const key of ['layout', 'material', 'responsive', 'interactions', 'states', 'meta'] as const) expect(next[key]).toBe(before[key]);
    const field = setNavbarField(next, 'layout.height', 70)!;
    expect(field.layout.migrationExtension).toEqual({ retained: true });
    expect(field.content.home?.value).toEqual(doc.content.home?.value);
    expect(field.interactions.events.action).toBe('custom-action');
  });

  it('switches Glass ↔ Solid without losing navigation information, including groups and actions', () => {
    const g = grouped();
    const before = freeze(updateNavbarItem(g.definition, 'explore', { action: { kind: 'navigate', href: 'https://example.com/docs', target: '_blank' }, iconPosition: 'end', disabled: true }));
    const solid = switchMaterialFamily(before, 'solid').definition;
    const back = switchMaterialFamily(solid, 'glass').definition;
    for (const next of [solid, back]) {
      for (const key of ['structure', 'content', 'layout', 'responsive', 'style', 'interactions'] as const) expect(next[key]).toBe(before[key]);
      expect(next.states).toEqual(before.states); roundtrip(next);
    }
  });

  it('old view editing APIs preserve new content, groups, material and responsive data', () => {
    const g = grouped();
    const doc = updateNavbarItem(g.definition, 'home', { action: { kind: 'consumer', name: 'open' }, description: 'Help', visible: false });
    expect(applyNavbarView(doc, navbarView(doc))).toEqual(doc);
    const edited = editNavbar(doc, (root) => updateTab(root, 'home', { label: 'Casa' }));
    expect(edited.content.home).toEqual(doc.content.home);
    expect(navbarGroups(edited)).toEqual(navbarGroups(doc));
    expect(edited.material).toBe(doc.material);
    roundtrip(edited);
  });

  it('imports all real legacy fixtures unchanged, including SVG, disabled state, breakpoints and custom materials', () => {
    for (const name of ['bottom-navigation-template', 'bottom-navigation-custom', 'bt-darts']) {
      const old = JSON.parse(readFileSync(`tests/fixtures/legacy/${name}.component.json`, 'utf8'));
      const r = importComponentText(JSON.stringify(old));
      if (!r.ok) throw new Error(r.errors.join());
      expect(JSON.parse(JSON.stringify(navbarView(r.doc)))).toEqual({ ...old.root, kind: 'mobile-navbar' });
      expect(navbarItems(r.doc).every((n) => n.action.kind === 'select')).toBe(true);
      roundtrip(r.doc);
    }
  });

  it('round-trips new groups/actions through IndexedDB and a real .jello ZIP', async () => {
    const d = updateNavbarItem(grouped().definition, 'explore', { action: { kind: 'consumer', name: 'open' }, visible: false });
    const repo = await openRepository(new IDBFactory(), 'navbar-m51');
    try {
      await repo.putComponent({ id: d.id, doc: d, createdAt: '2026-10-30T12:00:00Z', updatedAt: '2026-10-30T12:00:00Z' });
      expect((await repo.listComponents()).items[0]?.doc).toEqual(d);
    } finally { repo.close(); }
    const project = createProject({ id: 'navbar-project', name: 'Navbar', platform: 'both', assets: minimalAssets(), at: '2026-10-30T12:00:00Z' });
    const pkg = buildProjectPackage(project, { materials: [], components: [d], colors: false, icons: 'used', fonts: false });
    const result = readProjectEntries(await readZip(packageBytes(pkg)));
    expect(result).toMatchObject({ ok: true, value: { components: [{ doc: d }] } });
  });
});

describe('serializable actions and destination validation', () => {
  it.each(['javascript:alert(1)', 'data:text/html,hi', 'file:///tmp/x', '///evil.test', '/\\evil.test', 'https://', 'https://user:pass@example.com', 'https://example.com/\npath', 'https://example.com/\tpath'])('rejects unsafe navigation %s atomically', (href) => {
    expect(isSafeNavigationHref(href)).toBe(false);
    const before = freeze(demo());
    expect(() => setNavbarItemAction(before, 'home', { kind: 'navigate', href })).toThrow(NavbarStructureError);
    expect(before.content.home?.action).toBeUndefined();
  });
  it.each(['/docs', '/docs?q=a#b', '#section', '//example.com/docs', 'https://example.com/docs', 'http://localhost:4173/'])('accepts explicit destination %s', (href) => {
    const d = setNavbarItemAction(demo(), 'explore', { kind: 'navigate', href, target: '_blank' });
    roundtrip(d);
  });
  it('rejects functions, extra action keys, invalid targets, conflicting href and links used as tabs', () => {
    for (const action of [{ kind: 'consumer', name: 'open', callback: () => {} }, { kind: 'consumer', name: '' }, { kind: 'navigate', href: '/docs', target: 'frame' }, { kind: 'unknown' }]) expect(() => setNavbarItemAction(demo(), 'home', action as NavbarAction)).toThrow();
    const d = demo();
    expect(parseDefinition({ ...d, content: { ...d.content, home: { href: '/old', action: { kind: 'navigate', href: '/new' } } } }).ok).toBe(false);
    const tabs = { ...d, interactions: { ...d.interactions, behavior: { ...d.interactions.behavior, semantics: 'tabs' } } };
    expect(() => setNavbarItemAction(tabs, 'home', { kind: 'navigate', href: '/docs' })).toThrow(/navigation/);
  });
});

describe('desktop preparation and inspector descriptors', () => {
  it('validates desktop dimensions/regions and resolves existing breakpoint semantics without switching type', () => {
    const d = starterDefinition('desktop-navbar');
    expect(d.layout).toMatchObject({ orientation: 'horizontal', height: 72, padding: 24, distribution: 'start' });
    expect(d.layout).not.toHaveProperty('placement');
    expect(COMPONENTS.has('desktop-navbar')).toBe(true);
    const responsive = { ...d, layout: { ...d.layout, regions: { brand: 'start', signin: 'end' } }, responsive: { ...d.responsive, breakpoints: [{ id: 'medium', maxWidth: 768, overrides: { 'layout.gap': 8 } }, { id: 'small', maxWidth: 400, overrides: { 'layout.labels': 'hide', 'layout.compact': true } }] } };
    roundtrip(responsive);
    const resolved = resolveDesktopNavbar(responsive, 360);
    expect(resolved).toMatchObject({ breakpoint: 'small', definition: { type: 'desktop-navbar', layout: { gap: 8, labels: 'hide', compact: true } } });
    expect(setDesktopNavbarField(d, 'layout.orientation', 'vertical')).toBeNull();
    expect(setDesktopNavbarField(d, 'layout.height', 999)).toBeNull();
    expect(setDesktopNavbarField(d, 'layout.padding', 64)?.layout.padding).toBe(64);
    expect(setDesktopNavbarRegion(d, 'brand', 'start')?.layout.regions).toEqual({ brand: 'start' });
    expect(setDesktopNavbarRegion(d, 'missing', 'end')).toBeNull();
    expect(parseDefinition({ ...d, layout: { ...d.layout, regions: { missing: 'end' } } }).ok).toBe(false);
    expect(switchMaterialFamily(d, 'glass').definition.layout).toBe(d.layout);
    const mobile = { ...demo(), responsive: responsive.responsive };
    expect(resolveNavbar(mobile, 360).root.layout).toMatchObject({ gap: 8, labels: 'hide', compact: true });
  });
  it('provides common/mobile/desktop and Base/Advanced metadata through the same field API', () => {
    const mobile = definitionFields('mobile-navbar');
    const desktop = definitionFields('desktop-navbar');
    expect(mobile.every((f) => f.scope && f.level)).toBe(true);
    expect(desktop.every((f) => f.scope && f.level)).toBe(true);
    expect(mobile.find((f) => f.path === 'layout.placement')?.scope).toBe('mobile-navbar');
    expect(desktop.find((f) => f.path === 'layout.orientation')?.scope).toBe('desktop-navbar');
    expect(definitionFields('desktop-navbar', 'item').filter((f) => f.scope === 'common')).toEqual(definitionFields('mobile-navbar', 'item'));
    expect(definitionFields('desktop-navbar', 'group').find((f) => f.path === 'layout.regions.$group')?.scope).toBe('desktop-navbar');
    expect(definitionFields('mobile-navbar', 'item').map((f) => f.section)).toContain('accessibility');
  });
  it('edits boolean responsive overrides through the existing public breakpoint API', () => {
    const before = freeze(demo());
    const bp = addBreakpoint(navbarView(before), 400);
    const edited = updateBreakpoint(bp.root, bp.id, { set: ['layout.compact', true] });
    const doc = applyNavbarView(before, edited);
    expect(resolveNavbar(doc, 360).root.layout.compact).toBe(true);
    expect(navbarView(before).layout.compact).toBe(false);
    roundtrip(doc);
  });
});

describe('export compatibility', () => {
  const enc = new TextEncoder();
  const runtime: RuntimeBundle = { version: '0.3.0', files: ['jello.js', 'jello.css', 'types/runtime/index.d.ts'].map((path) => ({ path, data: enc.encode('') })) };
  it.each(['glass', 'solid'])('%s preserves grouped navigation in React and Vanilla and exposes action callbacks', async (family) => {
    const component = switchMaterialFamily(updateNavbarItem(grouped().definition, 'explore', { action: { kind: 'consumer', name: 'run' } }), family).definition;
    for (const build of [buildReactPackage, buildVanillaPackage]) {
      const pkg = await build({ component, runtime });
      const file = (path: string) => new TextDecoder().decode(pkg.files.find((f) => f.path === `${pkg.root}/${path}`)!.data);
      expect(parseDefinitionText(file('component.json'))).toMatchObject({ ok: true, doc: component });
      if (build === buildReactPackage) {
        expect(file('index.js')).toContain('navbarItems(config)');
        expect(file('index.js')).toContain('latest.current.onAction');
        expect(file('index.d.ts')).toContain('NavbarActionEvent');
        expect(file('src/MobileNavbar.tsx')).toContain('latest.current.onAction');
      }
    }
  });
  it('exports Desktop through the common runtime factory, never a Mobile renderer', async () => {
    for (const build of [buildReactPackage, buildVanillaPackage]) {
      const pkg = await build({ component: starterDefinition('desktop-navbar'), runtime });
      const js = new TextDecoder().decode(pkg.files.find((f) => f.path === `${pkg.root}/index.js`)!.data);
      expect(js).toContain('createComponent');
      expect(js).not.toContain('createBottomNavigation');
    }
  });
});
