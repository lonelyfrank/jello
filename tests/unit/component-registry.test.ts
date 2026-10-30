/**
 * Component registry (src/components/registry.ts): what is registered, what is
 * only planned, consistency of every entry, the runtime binding, the mobile
 * navbar's presentation per material family, and the link state of a
 * component with its preset when the component overrides values.
 */
import { describe, expect, it } from 'vitest';
import {
  COMPONENTS,
  ComponentRegistry,
  DEFINITION_TYPES,
  NAVBAR_FIELDS,
  NAVBAR_UNSUPPORTED,
  bindMaterial,
  bindingState,
  componentSpec,
  componentTemplate,
  getNavbarField,
  hasMaterialOverrides,
  materialCompatibility,
  navbarPresentation,
  navbarView,
  parseDefinition,
  serializeDefinition,
  setNavbarField,
  starterDefinition,
  switchMaterialFamily,
  unsupportedProperties,
  validateComponentSpec,
  type ComponentDefinition,
  type ComponentSpec,
} from '../../src/components';
import { getPath } from '../../src/components/fields';
import { MATERIALS, builtinMaterial } from '../../src/model';
import { componentRuntime, componentRuntimes } from '../../src/runtime/components';

const navbar = (): ComponentDefinition => componentTemplate('mobile-navbar')!.create();
const spec = (id: string): ComponentSpec => COMPONENTS.get(id)!;

describe('registration', () => {
  it('registers the button and the mobile navbar; desktop navbar and input are planned, not available', () => {
    expect(COMPONENTS.list().map((c) => c.id)).toEqual(['button', 'mobile-navbar']);
    expect(COMPONENTS.planned().map((p) => p.id)).toEqual(['desktop-navbar', 'input']);
    for (const p of COMPONENTS.planned()) {
      expect(COMPONENTS.has(p.id)).toBe(false);
      expect(componentSpec(p.id)).toBeUndefined();
      expect(p.reason).toMatch(/non ci sono ancora renderer, editor ed export/);
    }
  });

  it('every implemented type of the schema is registered, and the other way round', () => {
    expect(DEFINITION_TYPES.filter((t) => t.implemented).map((t) => t.type).sort()).toEqual(COMPONENTS.list().map((c) => c.id).sort());
  });

  it('refuses a duplicate and an entry that does not pass the consistency check, listing every reason', () => {
    const r = new ComponentRegistry();
    r.register(spec('button'));
    expect(() => r.register(spec('button'))).toThrow(/già registrato/);
    const broken: ComponentSpec = { ...spec('mobile-navbar'), renderer: { id: '' }, materials: { glass: { preset: 'inesistente' } }, states: ['hover'] };
    expect(() => new ComponentRegistry().register(broken)).toThrow(/renderer non dichiarato.*«default».*preset «inesistente» non esiste.*solid.*manca il preset/s);
    const planned: ComponentSpec = { ...spec('button'), id: 'input', info: DEFINITION_TYPES.find((t) => t.type === 'input')! };
    expect(validateComponentSpec(planned)).toContain('il tipo è dichiarato non implementato in DEFINITION_TYPES');
  });

  it('describes, for each type: identity, properties, defaults, states, interactions, materials, export', () => {
    for (const c of COMPONENTS.list()) {
      expect(validateComponentSpec(c), c.id).toEqual([]);
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.fields.length).toBeGreaterThan(20);
      expect(c.states[0]).toBe('default');
      expect(c.interactions.length).toBeGreaterThan(0);
      expect(Object.keys(c.materials).sort()).toEqual(MATERIALS.list().map((m) => m.id).sort());
      expect(c.export.formats).toEqual(['component-json', 'component-react', 'component-vanilla']);
      expect(c.renderer.id).toBe(c.id);
      // The defaults are the descriptors' defaults and a new component carries them.
      const fresh = c.create();
      for (const f of c.fields) expect(getPath(fresh, f.path), `${c.id} ${f.path}`).toEqual(f.default);
    }
    expect(spec('button').interactions.map((i) => i.trigger)).toEqual(['press', 'hover', 'focus']);
    expect(spec('mobile-navbar').interactions.map((i) => i.trigger)).toEqual(['press', 'change', 'reselect']);
  });

  it('every property is addressed by one path and set through the spec, which refuses invalid values', () => {
    for (const c of COMPONENTS.list()) {
      const d = c.create();
      for (const f of c.fields) {
        expect(c.setField(d, f.path, f.default), `${c.id} ${f.path}`).not.toBeNull();
        if (f.type === 'number') expect(c.setField(d, f.path, f.max + 1000)).toBeNull();
      }
      expect(c.setField(d, 'nope.nothing', 1)).toBeNull();
    }
  });
});

describe('runtime binding', () => {
  it('every registered component has a runtime with the same renderer id, and every runtime an entry', () => {
    expect(componentRuntimes().map((r) => r.renderer).sort()).toEqual(COMPONENTS.list().map((c) => c.renderer.id).sort());
    for (const c of COMPONENTS.list()) {
      expect(componentRuntime(c.id)?.renderer, c.id).toBe(c.renderer.id);
      expect(componentRuntime(c.id)?.type).toBe(c.id);
    }
    // Planned types have neither.
    expect(componentRuntime('desktop-navbar')).toBeUndefined();
    expect(componentRuntime('input')).toBeUndefined();
  });
});

describe('material compatibility', () => {
  it('both components are drawn with every registered family, and the compatibility matrix agrees', () => {
    for (const c of COMPONENTS.list()) {
      for (const m of MATERIALS.list()) {
        expect(COMPONENTS.supports(c.id, m.id), `${c.id}/${m.id}`).toBe(true);
        expect(materialCompatibility(c.id, m.id)?.compatible).toBe(true);
        // Starting material of the family: a preset that exists in it.
        expect(m.presets.some((p) => p.doc.id === c.materials[m.id]!.preset)).toBe(true);
      }
    }
    expect(COMPONENTS.supports('button', 'jelly')).toBe(false);
  });

  it('Glass renders only the press; the states it does not render stay the component’s own style', () => {
    const g = materialCompatibility('button', 'glass')!;
    expect(g.rendered).toEqual(['pressed']);
    expect(g.byComponent).toEqual(['hover', 'focus', 'disabled']);
    const s = materialCompatibility('button', 'solid')!;
    expect(s.rendered).toEqual(['hover', 'pressed', 'disabled']);
    expect(s.byComponent).toEqual(['focus']);
  });
});

describe('mobile navbar on Solid', () => {
  const solid = (d = navbar()) => switchMaterialFamily(d, 'solid').definition;

  it('a Solid navbar is a valid definition that keeps the tabs, and survives serialize → parse', () => {
    const d = solid();
    expect(d.material).toMatchObject({ family: 'solid', preset: 'solid-neutral' });
    const r = parseDefinition(JSON.parse(serializeDefinition(d)));
    expect(r.ok && r.warnings).toEqual([]);
    expect(navbarView(d).children.map((t) => t.label)).toEqual(['Home', 'Explore', 'Profile']);
  });

  it('what Solid cannot render is listed with the reason, and not written', () => {
    const d = solid();
    expect(unsupportedProperties(d).map((u) => u.path)).toEqual(NAVBAR_UNSUPPORTED.solid!.map((u) => u.path));
    expect(unsupportedProperties(navbar())).toEqual([]);
    const g = navbarPresentation(navbarView(navbar()), 'glass', { breakpoint: null });
    const s = navbarPresentation(navbarView(d), 'solid', { breakpoint: null });
    expect(g.vars['--jbn-fg']).toBeDefined();
    expect(g.vars['--jbn-indicator']).toBeDefined();
    expect(g.attrs['data-text-shadow']).toBeDefined();
    for (const name of ['--jbn-fg', '--jbn-indicator']) expect(s.vars[name], name).toBeUndefined();
    expect(s.attrs['data-text-shadow']).toBeUndefined();
  });

  /** Behavior, not presentation: checked in the browser (tests/e2e/components.spec.ts). */
  const BEHAVIOR_ONLY = new Set(['interactions.behavior.pressFeedback', 'interactions.behavior.wheelForward', 'interactions.behavior.reselect', 'interactions.events.change', 'interactions.events.press', 'interactions.events.reselect']);
  const another = (f: (typeof NAVBAR_FIELDS)[number], now: unknown): unknown => {
    switch (f.type) {
      case 'number':
        return now === f.min ? f.max : f.min;
      case 'enum':
        return f.options.find((o) => o.value !== now)!.value;
      case 'color':
        return now === '#123456' ? '#654321' : '#123456';
      case 'radius':
        return now === 7 ? 9 : 7;
      case 'boolean':
        return !now;
      case 'text':
        return 'altro-nome';
    }
  };

  it.each(['glass', 'solid'] as const)('%s: every described property changes what is written, except the ones the family cannot render (listed)', (family) => {
    const base = family === 'glass' ? navbar() : solid();
    const off = new Set((NAVBAR_UNSUPPORTED[family] ?? []).map((u) => u.path));
    const written = (d: ComponentDefinition) => JSON.stringify(navbarPresentation(navbarView(d), family, { breakpoint: null }));
    const before = written(base);
    const seen: string[] = [];
    for (const f of NAVBAR_FIELDS) {
      if (BEHAVIOR_ONLY.has(f.path)) continue;
      const next = setNavbarField(base, f.path, another(f, getNavbarField(base, f.path)));
      expect(next, f.path).not.toBeNull();
      expect(written(next!) !== before, `${family} ${f.path}`).toBe(!off.has(f.path));
      seen.push(f.path);
    }
    expect(NAVBAR_FIELDS.map((f) => f.path).filter((p) => !seen.includes(p)).sort()).toEqual([...BEHAVIOR_ONLY].sort());
    // Every unsupported property is one of the described ones.
    for (const p of off) expect(NAVBAR_FIELDS.some((f) => f.path === p), p).toBe(true);
  });

  it('changing the material keeps tabs, labels, icons, disabled tabs, the active tab, breakpoints and state styles', () => {
    let d = navbar();
    d = setNavbarField(d, 'layout.height', 72)!;
    d = setNavbarField(d, 'states.focus.style.width', 3)!;
    d = { ...d, content: { ...d.content, explore: { ...d.content.explore, disabled: true } } };
    const before = JSON.parse(serializeDefinition(d));
    const after = JSON.parse(serializeDefinition(solid(d)));
    for (const k of ['structure', 'content', 'layout', 'responsive', 'style', 'interactions']) expect(after[k], k).toEqual(before[k]);
    expect(after.states.focus).toEqual(before.states.focus);
    expect(navbarView(solid(d)).children.find((t) => t.id === 'explore')?.disabled).toBe(true);
  });
});

describe('link state with local overrides', () => {
  const preset = builtinMaterial('navbar')!.doc;
  it('a component that overrides values over its preset is modified, or diverged when the preset also moved', () => {
    const d = navbar();
    expect(hasMaterialOverrides(d)).toBe(false);
    expect(bindingState(d.material, preset, hasMaterialOverrides(d))).toBe('linked');
    const edited: ComponentDefinition = { ...d, material: { ...d.material, params: { blur: 9 } } };
    expect(hasMaterialOverrides(edited)).toBe(true);
    expect(bindingState(edited.material, preset, true)).toBe('modified');
    const moved = { ...preset, name: 'Cambiato', material: { ...preset.material, blur: 3 } } as typeof preset;
    expect(bindingState(edited.material, moved, true)).toBe('diverged');
    expect(bindingState(d.material, moved, false)).toBe('outdated');
    const stateOnly = { ...starterDefinition('button'), states: { hover: { material: { fill: '#112233' } } } } as ComponentDefinition;
    expect(hasMaterialOverrides(stateOnly)).toBe(true);
    // A binding made now has nothing local, whatever it came from.
    expect(hasMaterialOverrides({ material: bindMaterial(preset, 'navbar'), states: {} })).toBe(false);
  });
});
