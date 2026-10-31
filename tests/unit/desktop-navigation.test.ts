import { describe, expect, it } from 'vitest';
import {
  COMPONENTS, DESKTOP_NAVBAR_FIELDS, DESKTOP_NAVBAR_UNSUPPORTED, componentTemplate, desktopNavbarPresentation,
  desktopNavbarRegions, getPath, addNavbarItem, addNavbarGroup, moveNavbarItemToGroup,
  navbarActiveItem, navbarItems, parseDefinition, resolveDesktopNavbar, serializeDefinition, setDesktopNavbarField,
  setDesktopNavbarRegion, setNavbarItemAction, setNavbarItemDisabled, setNavbarItemVisibility, starterDefinition,
  switchMaterialFamily, type ComponentDefinition, type DesktopNavbarDefinition,
} from '../../src/components';
import { DesktopNavigation } from '../../src/runtime/desktop-navigation';
import { componentRuntime, createComponent, mountComponent } from '../../src/runtime/components';
import type { DesktopNavigationOptions } from '../../src/runtime/desktop-navigation';
import { componentReactAdapter, componentVanillaAdapter } from '../../src/export/adapters';

const demo = () => componentTemplate('desktop-navbar')!.create();
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); }
  return value;
}

describe('Desktop renderer contract', () => {
  it('registers a working renderer, JSON capability and typed common entry points', () => {
    expect(componentRuntime('desktop-navbar')?.renderer).toBe('desktop-navbar');
    expect(COMPONENTS.get('desktop-navbar')?.export.formats).toEqual(['component-json', 'component-react', 'component-vanilla']);
    // Compile-time regression: Desktop options infer the dedicated instance through the shared factory.
    const factory: (options: DesktopNavigationOptions) => DesktopNavigation = createComponent;
    const mount: (options: DesktopNavigationOptions) => DesktopNavigation = mountComponent;
    expect(factory).toBe(createComponent); expect(mount).toBe(mountComponent);
  });
  it('round-trips a generic template and both material bindings without changing the canonical document', () => {
    const def = freeze(demo()); const before = serializeDefinition(def);
    for (const family of ['glass', 'solid']) {
      const next = switchMaterialFamily(def, family).definition;
      expect(parseDefinition(JSON.parse(serializeDefinition(next)))).toMatchObject({ ok: true, warnings: [] });
      for (const key of ['structure', 'content', 'layout', 'responsive', 'interactions'] as const) expect(next[key]).toBe(def[key]);
      expect(desktopNavbarRegions(next).start.map((item) => item.id)).toEqual(['brand']);
    }
    expect(serializeDefinition(def)).toBe(before);
    expect(before).not.toMatch(/cable|darts|Jello.*brand/i);
  });
  it('derives region order, group membership and hidden/disabled state from canonical root references', () => {
    let def = demo();
    const group = addNavbarGroup(def, 'Primary');
    def = moveNavbarItemToGroup(group.definition, 'explore', group.id);
    def = moveNavbarItemToGroup(def, 'projects', group.id);
    def = setDesktopNavbarRegion(def, group.id, 'end')!;
    def = setNavbarItemDisabled(def, 'projects', true);
    def = setNavbarItemVisibility(def, 'settings', false);
    const regions = desktopNavbarRegions(freeze(def));
    expect(regions.main.map((item) => item.id)).toEqual(['home']);
    expect(regions.end.map((item) => item.id)).toEqual(['action', 'explore', 'projects']);
    expect(regions.end.at(-1)).toMatchObject({ id: 'projects', disabled: true, groupId: group.id });
    expect(regions.start[0]).toMatchObject({ id: 'brand', action: { kind: 'navigate', href: '#home' } });
  });
  it('does not create an interactive entry for an empty logical group', () => {
    const group = addNavbarGroup(demo(), 'Empty');
    expect(Object.values(desktopNavbarRegions(group.definition)).flat().some((item) => item.id === group.id)).toBe(false);
  });
  it('preserves IDs and selects only available items, while routers may mark navigate items active', () => {
    let def = setNavbarItemAction(demo(), 'explore', { kind: 'navigate', href: '/explore' });
    expect(navbarActiveItem(def, 'explore')).toBe('explore');
    def = setNavbarItemDisabled(def, 'explore', true);
    expect(navbarActiveItem(def, 'explore')).toBe('home');
    expect(navbarActiveItem(def, 'action')).toBe('home');
    def = setNavbarItemVisibility(def, 'home', false);
    expect(navbarActiveItem(def)).toBe('projects');
    expect(navbarItems(def).map((item) => item.id)).toEqual(['brand', 'home', 'explore', 'projects', 'settings', 'action']);
  });
  it('resolves every canonical Desktop override in maxWidth order without mutations or a type change', () => {
    const def = freeze({ ...demo(), responsive: { overflow: 'scroll', minTabWidth: 56, breakpoints: [
      { id: 'wide', maxWidth: 1000, overrides: { 'layout.labels': 'active', 'layout.icons': 'hide', 'layout.gap': 22, 'layout.padding': 32,
        'layout.align': 'end', 'layout.distribution': 'between', 'layout.height': 90, 'layout.width': 900,
        'layout.maxWidth': 1000, 'layout.compact': true, 'style.typography.fontSize': 18, 'style.icon.size': 32 } },
      { id: 'narrow', maxWidth: 500, overrides: { 'layout.gap': 4, 'layout.height': 64 } },
    ] } });
    expect(parseDefinition(def).ok).toBe(true);
    expect(resolveDesktopNavbar(def, 1200).breakpoint).toBeNull();
    const wide = resolveDesktopNavbar(def, 1000);
    for (const [path, value] of Object.entries(def.responsive.breakpoints[0]!.overrides)) expect(getPath(wide.definition, path)).toEqual(value);
    expect(resolveDesktopNavbar(def, 400)).toMatchObject({ breakpoint: 'narrow', definition: { type: 'desktop-navbar', layout: { gap: 4, height: 64, icons: 'hide' } } });
    expect(def.layout.height).toBe(72);
  });
  it.each(['glass', 'solid'])('%s: every described visual property changes presentation or is explicitly unsupported', (family) => {
    const def = starterDefinition('desktop-navbar');
    const off = new Set((DESKTOP_NAVBAR_UNSUPPORTED[family] ?? []).map((field) => field.path));
    const written = (next: ComponentDefinition) => JSON.stringify(desktopNavbarPresentation(next, family, null));
    const before = written(def);
    for (const field of DESKTOP_NAVBAR_FIELDS) {
      if (field.section === 'interactions' && !field.path.startsWith('style.motion.')) continue;
      if (field.path.startsWith('responsive.')) continue;
      if (field.path === 'layout.orientation') { expect(setDesktopNavbarField(def, field.path, 'vertical')).toBeNull(); continue; }
      const value = field.type === 'number' ? field.default === field.min ? field.max : field.min
        : field.type === 'enum' ? field.options.find((option) => option.value !== field.default)!.value
        : field.type === 'boolean' ? !field.default : field.type === 'radius' ? 7 : field.type === 'color' ? '#123456' : 'changed';
      const next = setDesktopNavbarField(def, field.path, value)!;
      expect(next, field.path).not.toBeNull();
      expect(written(next) !== before, `${family} ${field.path}`).toBe(!off.has(field.path));
    }
    expect(desktopNavbarPresentation(def, family, null).attrs).not.toHaveProperty('data-anchor');
  });
  it('rejects invalid definitions, unsafe actions and tabs before allocating any DOM/material resources', () => {
    const container = { append: () => { throw new Error('must not touch host'); } } as unknown as HTMLElement;
    const def = demo();
    for (const bad of [
      { ...def, layout: { ...def.layout, height: -1 } },
      { ...def, content: { ...def.content, home: { action: { kind: 'navigate', href: 'javascript:alert(1)' } } } },
      { ...starterDefinition('desktop-navbar'), interactions: { behavior: { semantics: 'tabs' }, events: {} } },
      starterDefinition('button'),
    ]) expect(() => new DesktopNavigation({ container, config: bad as DesktopNavbarDefinition })).toThrow(/non valida|tabs|richiede/);
  });
  it('checks region assignments and structure on real documents', () => {
    expect(parseDefinition({ ...demo(), layout: { ...demo().layout, regions: { absent: 'main' } } }).ok).toBe(false);
    const added = addNavbarItem(demo(), { label: 'New destination' });
    expect(navbarItems(added.definition).some((item) => item.id === added.id)).toBe(true);
    expect(setDesktopNavbarRegion(added.definition, added.id, 'start')).not.toBeNull();
  });
  it('describes working Desktop framework adapters with the bundled runtime', () => {
    for (const adapter of [componentReactAdapter, componentVanillaAdapter]) expect(adapter.describe({ component: demo() }).files.some((f) => f.path === 'runtime/')).toBe(true);
  });
});
