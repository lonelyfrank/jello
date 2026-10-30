/**
 * Button / CTA: the definition, its described properties, the canonical
 * format, the presentation written to the DOM per material family, the
 * material binding (variant accent, switching family) and what a family
 * cannot render being reported instead of silently ignored.
 */
import { describe, expect, it } from 'vitest';
import {
  BUTTON_FIELDS,
  BUTTON_OVERRIDE_PATHS,
  BUTTON_SIZES,
  BUTTON_UNSUPPORTED,
  addButtonBreakpoint,
  bindComponentMaterial,
  bindMaterial,
  buttonPresentation,
  componentTemplate,
  getButtonField,
  parseDefinition,
  parseDefinitionText,
  removeButtonBreakpoint,
  resolveButton,
  resolveDefinitionMaterial,
  serializeDefinition,
  setButtonDisabled,
  setButtonField,
  setButtonIcon,
  setButtonLink,
  setButtonText,
  setButtonValue,
  starterDefinition,
  switchMaterialFamily,
  unsupportedProperties,
  updateButtonBreakpoint,
  type ComponentDefinition,
} from '../../src/components';
import { MATERIALS, glassParams, resolveSolid, type SolidDocument } from '../../src/model';
import { getPath } from '../../src/components/fields';

const button = (): ComponentDefinition => componentTemplate('button')!.create();
const raw = (d: ComponentDefinition) => JSON.parse(serializeDefinition(d));
const errors = (input: unknown): string[] => {
  const r = parseDefinition(input);
  return r.ok ? [] : r.errors;
};
const solidOf = (d: ComponentDefinition): ComponentDefinition => switchMaterialFamily(d, 'solid').definition;

// WCAG relative luminance and contrast ratio.
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};
/** Colour of a translucent tint over an opaque backdrop. */
const over = (tint: string, alpha: number, backdrop: string) => {
  const t = parseInt(tint.slice(1, 7), 16);
  const b = parseInt(backdrop.slice(1, 7), 16);
  const mix = (shift: number) => Math.round(((t >> shift) & 255) * alpha + ((b >> shift) & 255) * (1 - alpha));
  return `#${[16, 8, 0].map((s) => mix(s).toString(16).padStart(2, '0')).join('')}`;
};

describe('the button definition', () => {
  it('is an implemented type with its own property table', () => {
    const d = starterDefinition('button');
    expect(parseDefinition(raw(d)).ok).toBe(true);
    expect(BUTTON_FIELDS.length).toBeGreaterThan(25);
    // Every described path exists in a new definition, with its descriptor default.
    for (const f of BUTTON_FIELDS) expect(getPath(d, f.path), f.path).toEqual(f.default);
  });

  it('survives serialize → parse → serialize without loss or warnings', () => {
    const d = button();
    const text = serializeDefinition(d);
    const r = parseDefinitionText(text);
    expect(r.ok && r.warnings).toEqual([]);
    expect(r.ok && serializeDefinition(r.doc)).toBe(text);
  });

  it('describes content by node: the label is required, the icon optional, the root takes href, value and disabled', () => {
    const d = raw(button());
    delete d.content.label;
    expect(errors(d)).toEqual(['content.label: «label» richiede text']);
    const e = raw(button());
    e.content.root = { text: 'x' };
    expect(errors(e)).toEqual(['content.root.text: non ammesso per un nodo «button»']);
    const f = raw(button());
    f.content.root = { value: 'conferma', disabled: true };
    expect(parseDefinition(f).ok).toBe(true);
  });

  it('an invalid property refuses the whole document with its path; a missing one takes its default with a warning', () => {
    const d = raw(button());
    d.layout.size = 'xl';
    d.style.colors.primary = 'blue';
    d.states.focus.style.width = 9;
    expect(errors(d)).toEqual(['layout.size: atteso uno tra sm, md, lg', 'style.colors.primary: atteso un colore #rrggbb o #rrggbbaa', 'states.focus.style.width: 9 fuori intervallo [1, 4]']);
    const w = raw(button());
    delete w.layout.gap;
    const r = parseDefinition(w);
    expect(r.ok && r.warnings).toEqual(['layout.gap: assente, uso il valore iniziale']);
    expect(r.ok && r.doc.layout.gap).toBe(8);
  });

  it('unknown properties are reported, never silently dropped', () => {
    const d = raw(button());
    d.layout.shadow = 3;
    d.style.glow = true;
    d.interactions.behavior.autofocus = true;
    d.states.hover.style.blur = 4;
    d.responsive.mode = 'x';
    const r = parseDefinition(d);
    expect(r.ok && r.warnings.sort()).toEqual(
      ['interactions.behavior.autofocus: proprietà sconosciuta, ignorata', 'layout.shadow: proprietà sconosciuta, ignorata', 'responsive.mode: proprietà sconosciuta, ignorata', 'states.hover.style.blur: proprietà sconosciuta, ignorata', 'style.glow: proprietà sconosciuta, ignorata'].sort(),
    );
  });

  it('a link needs an address; an action with one says it is not used', () => {
    const d = raw(button());
    d.interactions.behavior.semantics = 'link';
    expect(errors(d)).toEqual(['interactions.behavior.semantics: «link» richiede content.root.href']);
    d.content.root = { href: 'javascript:alert(1)' };
    expect(errors(d)[0]).toMatch(/content\.root\.href: atteso un percorso/);
    d.content.root = { href: '/prezzi' };
    expect(parseDefinition(d).ok).toBe(true);
    const a = raw(button());
    a.content.root = { href: '/prezzi' };
    const r = parseDefinition(a);
    expect(r.ok && r.warnings).toEqual(['content.root.href: un pulsante di azione non naviga, indirizzo ignorato (usa semantics «link»)']);
  });

  it('states are the type’s: default, hover, pressed, focus, disabled — not active', () => {
    const d = raw(button());
    d.states.active = { style: {} };
    expect(errors(d)).toEqual(['states.active: il tipo «button» non ha lo stato «active» (ha: default, hover, pressed, focus, disabled)']);
  });

  it('a structure that is not a button is refused', () => {
    const d = raw(button());
    d.structure.children.push({ id: 'extra', role: 'item' });
    expect(errors(d)[0]).toMatch(/non è ammesso dentro «button»/);
  });
});

describe('editing', () => {
  it('sets one described property; an invalid value is refused and changes nothing', () => {
    const d = button();
    const next = setButtonField(d, 'layout.size', 'lg')!;
    expect(getButtonField(next, 'layout.size')).toBe('lg');
    expect(getButtonField(d, 'layout.size')).toBe('md');
    expect(setButtonField(d, 'layout.size', 'xl')).toBeNull();
    expect(setButtonField(d, 'layout.nope', 1)).toBeNull();
    expect(setButtonField(d, 'states.hover.style.background', 'rosso')).toBeNull();
    expect(getButtonField(setButtonField(d, 'style.colors.ghost', '#ABCDEF')!, 'style.colors.ghost')).toBe('#abcdef');
    // Editing one state's style leaves that state's material overrides alone.
    const s = { ...solidOf(d), states: { hover: { material: { fill: '#112233' }, style: {} } } } as ComponentDefinition;
    const t = setButtonField(s, 'states.hover.style.background', '#ffffff10')!;
    expect(t.states.hover).toEqual({ material: { fill: '#112233' }, style: { background: '#ffffff10' } });
  });

  it('every described property accepts its initial value and its extremes', () => {
    const d = button();
    for (const f of BUTTON_FIELDS) {
      expect(setButtonField(d, f.path, f.default), f.path).not.toBeNull();
      if (f.type === 'number') {
        expect(setButtonField(d, f.path, f.min), f.path).not.toBeNull();
        expect(setButtonField(d, f.path, f.max), f.path).not.toBeNull();
        expect(setButtonField(d, f.path, f.max + f.step), f.path).toBeNull();
      }
    }
  });

  it('text: 1–60 characters after trimming', () => {
    const d = button();
    expect(getPath(setButtonText(d, '  Salva  ')!, 'content.label.text')).toBe('Salva');
    expect(setButtonText(d, '   ')).toBeNull();
    expect(setButtonText(d, 'x'.repeat(61))).toBeNull();
    expect(resolveButton(setButtonText(d, 'Salva')!, 400).text).toBe('Salva');
  });

  it('the icon is optional: removing it removes its node and content, adding it creates them', () => {
    const d = button();
    const none = setButtonIcon(d, null);
    expect(none.structure.children?.map((n) => n.role)).toEqual(['label']);
    expect(none.content.icon).toBeUndefined();
    expect(parseDefinition(raw(none)).ok).toBe(true);
    expect(resolveButton(none, 400).icon).toBeNull();
    const back = setButtonIcon(none, { kind: 'builtin', name: 'star' });
    expect(back.structure.children?.map((n) => n.role)).toEqual(['icon', 'label']);
    expect(resolveButton(back, 400).icon).toEqual({ kind: 'builtin', name: 'star' });
    expect(setButtonIcon(none, { kind: 'none' })).toBe(none);
    expect(parseDefinition(raw(back)).ok).toBe(true);
  });

  it('link / action: a link without an address is refused, an action carries none', () => {
    const d = button();
    expect(setButtonLink(d, 'link')).toBeNull();
    expect(setButtonLink(d, 'link', 'ciao')).toBeNull();
    const l = setButtonLink(d, 'link', '/prezzi')!;
    expect(resolveButton(l, 400)).toMatchObject({ semantics: 'link', href: '/prezzi' });
    expect(parseDefinition(raw(l)).ok).toBe(true);
    const a = setButtonLink(l, 'action')!;
    expect(resolveButton(a, 400)).toMatchObject({ semantics: 'action', href: null });
    expect(parseDefinition(raw(a)).ok && !errors(raw(a)).length).toBe(true);
  });

  it('disabled and value live on the root', () => {
    const d = setButtonValue(setButtonDisabled(button(), true), 'conferma')!;
    expect(resolveButton(d, 400)).toMatchObject({ disabled: true, value: 'conferma' });
    expect(resolveButton(setButtonDisabled(d, false), 400).disabled).toBe(false);
    expect(setButtonValue(d, 'x'.repeat(201))).toBeNull();
  });
});

describe('responsive', () => {
  it('the narrowest breakpoint that matches the container wins, and nothing applies when the width is unknown', () => {
    let d = button();
    d = addButtonBreakpoint(d, 480).def;
    d = updateButtonBreakpoint(d, 'bp-480', { set: ['layout.size', 'sm'] });
    d = updateButtonBreakpoint(d, 'bp-480', { set: ['layout.widthMode', 'fill'] });
    const second = addButtonBreakpoint(d, 360);
    d = updateButtonBreakpoint(second.def, second.id, { set: ['layout.size', 'lg'] });
    expect(parseDefinition(raw(d)).ok).toBe(true);
    expect(resolveButton(d, 800)).toMatchObject({ breakpoint: null, layout: { size: 'md', widthMode: 'hug' } });
    expect(resolveButton(d, 480)).toMatchObject({ breakpoint: 'bp-480', layout: { size: 'sm', widthMode: 'fill' } });
    // Both match at 360: every matching one applies, the narrowest last.
    expect(resolveButton(d, 360)).toMatchObject({ breakpoint: 'bp-360', layout: { size: 'lg', widthMode: 'fill' } });
    expect(resolveButton(d, Number.POSITIVE_INFINITY).breakpoint).toBeNull();
    // The presentation follows.
    expect(buttonPresentation(resolveButton(d, 480), 'glass').vars['--jbtn-min-height']).toBe(`${BUTTON_SIZES.sm}px`);
    expect(buttonPresentation(resolveButton(d, 480), 'glass').attrs['data-width']).toBe('fill');
  });

  it('only listed properties can be overridden, with valid values; the rest is reported on read', () => {
    const d = raw(addButtonBreakpoint(button(), 400).def);
    d.responsive.breakpoints[0].overrides = { 'layout.size': 'sm', 'layout.radius': 4, 'style.typography.fontSize': 99 };
    expect(errors(d)).toEqual(['responsive.breakpoints.0.overrides.style.typography.fontSize: 99 fuori intervallo [8, 32]']);
    d.responsive.breakpoints[0].overrides = { 'layout.size': 'sm', 'layout.radius': 4 };
    const r = parseDefinition(d);
    expect(r.ok && r.warnings).toEqual(['responsive.breakpoints.0.overrides.layout.radius: non sovrascrivibile da un breakpoint, ignorato']);
    expect(BUTTON_OVERRIDE_PATHS.every((p) => BUTTON_FIELDS.some((f) => f.path === p))).toBe(true);
  });

  it('breakpoints can be changed and removed; ids stay unique', () => {
    let d = addButtonBreakpoint(button(), 400).def;
    const again = addButtonBreakpoint(d, 400);
    expect(again.id).toBe('bp-400-2');
    d = removeButtonBreakpoint(again.def, 'bp-400');
    expect((d.responsive.breakpoints as { id: string }[]).map((b) => b.id)).toEqual(['bp-400-2']);
    d = updateButtonBreakpoint(d, 'bp-400-2', { maxWidth: 99 });
    expect((d.responsive.breakpoints as { maxWidth: number }[])[0]!.maxWidth).toBe(400);
  });
});

describe('presentation: what the renderer writes, per material family', () => {
  const baseFor = (family: 'glass' | 'solid') => (family === 'glass' ? button() : solidOf(button()));
  const BEHAVIOR_ONLY = new Set(['interactions.behavior.pressFeedback', 'interactions.events.press', 'interactions.events.hover', 'interactions.events.focus']);
  /** A valid value different from the one the definition has now. */
  const another = (f: (typeof BUTTON_FIELDS)[number], now: unknown): unknown => {
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
  const present = (d: ComponentDefinition, family: string) => JSON.stringify(buttonPresentation(resolveButton(d, 400), family));

  it.each(['glass', 'solid'] as const)('%s: every described property changes what is written — except the ones the family cannot render, which are listed', (family) => {
    const base = baseFor(family);
    const off = new Set(BUTTON_UNSUPPORTED[family]!.map((u) => u.path));
    const before = present(base, family);
    const seen: string[] = [];
    for (const f of BUTTON_FIELDS) {
      if (BEHAVIOR_ONLY.has(f.path)) continue;
      const next = setButtonField(base, f.path, another(f, getPath(base, f.path)));
      expect(next, f.path).not.toBeNull();
      const changed = present(next!, family) !== before;
      expect(changed, `${family} ${f.path}`).toBe(!off.has(f.path));
      seen.push(f.path);
    }
    // Nothing was skipped by accident: only behavior-only properties are left out.
    expect(BUTTON_FIELDS.map((f) => f.path).filter((p) => !seen.includes(p)).sort()).toEqual([...BEHAVIOR_ONLY].sort());
  });

  it('what a family cannot render is reported, with a reason, by the registry and by the component', () => {
    expect(unsupportedProperties(button())).toEqual([]);
    const s = unsupportedProperties(solidOf(button()));
    expect(s.map((u) => u.path)).toEqual(BUTTON_UNSUPPORTED.solid!.map((u) => u.path));
    for (const u of s) expect(u.reason.length, u.path).toBeGreaterThan(20);
    // And it is not written: the variables of an unsupported property are absent, not merely unused.
    const vars = buttonPresentation(resolveButton(solidOf(button()), 400), 'solid').vars;
    for (const name of ['--jbtn-color-primary', '--jbtn-color-secondary', '--jbtn-hover', '--jbtn-press', '--jbtn-disabled']) expect(vars[name], name).toBeUndefined();
    expect(vars['--jbtn-color-ghost']).toBeDefined();
  });

  it('the element follows the semantics: action → button, link → a (disabled or not)', () => {
    const l = setButtonLink(button(), 'link', '/x')!;
    expect(buttonPresentation(resolveButton(button(), 400), 'glass').tag).toBe('button');
    expect(buttonPresentation(resolveButton(l, 400), 'glass').tag).toBe('a');
    expect(buttonPresentation(resolveButton(setButtonDisabled(l, true), 400), 'glass').tag).toBe('a');
  });

  it('the same definition gives the same layout, size, padding, radius and alignment on both families', () => {
    let d = button();
    d = setButtonField(d, 'layout.size', 'lg')!;
    d = setButtonField(d, 'layout.paddingX', 30)!;
    d = setButtonField(d, 'layout.radius', 9)!;
    d = setButtonField(d, 'layout.align', 'end')!;
    d = setButtonField(d, 'layout.iconPosition', 'end')!;
    const g = buttonPresentation(resolveButton(d, 400), 'glass');
    const s = buttonPresentation(resolveButton(solidOf(d), 400), 'solid');
    const layoutKeys = ['--jbtn-min-height', '--jbtn-pad-x', '--jbtn-pad-y', '--jbtn-gap', '--jbtn-radius', '--jbtn-width', '--jbtn-font-size', '--jbtn-font-weight', '--jbtn-icon'];
    for (const k of layoutKeys) expect(s.vars[k], k).toBe(g.vars[k]);
    for (const k of ['data-size', 'data-width', 'data-align', 'data-icon-position', 'data-has-icon', 'data-variant']) expect(s.attrs[k], k).toBe(g.attrs[k]);
    expect([g.attrs['data-material'], s.attrs['data-material']]).toEqual(['glass', 'solid']);
  });
});

describe('material binding', () => {
  it('Secondary shows the material as it is (the very same document); Ghost too', () => {
    const d = { ...button(), style: { ...button().style, variant: 'secondary' } };
    const g = resolveDefinitionMaterial(d);
    expect(g).toBe(d.material.document);
    const ghost = { ...d, style: { ...d.style, variant: 'ghost' } };
    expect(resolveDefinitionMaterial(ghost)).toBe(g);
  });

  it('Primary asks the family for its accent; the family decides the values', () => {
    for (const family of ['glass', 'solid'] as const) {
      const base = family === 'glass' ? button() : solidOf(button());
      const secondary = { ...base, style: { ...base.style, variant: 'secondary' } };
      const primary = { ...base, style: { ...base.style, variant: 'primary' } };
      const def = MATERIALS.get(family)!;
      const m = resolveDefinitionMaterial(primary);
      expect(m.family).toBe(family);
      expect(def.serialize(m)).not.toBe(def.serialize(resolveDefinitionMaterial(secondary)));
      for (const [k, v] of Object.entries(def.accent.params ?? {})) expect(def.read(m).params[k], `${family}.${k}`).toBe(v);
    }
  });

  it('the component’s own parameters win over the accent, and state overrides over both', () => {
    const d = solidOf(button());
    const primary = { ...d, style: { ...d.style, variant: 'primary' }, material: { ...d.material, params: { fill: '#10b981' } }, states: { hover: { material: { fill: '#065f46' } } } } as ComponentDefinition;
    const m = resolveDefinitionMaterial(primary) as SolidDocument;
    expect(m.material.fill).toBe('#10b981');
    expect(m.material.foreground).toBe('#ffffff');
    expect(m.states.hover.fill).toBe('#065f46');
    expect(m.states.pressed.fill).toBe('#1b4bbd');
  });

  it('Primary keeps its content readable: white over the Glass accent even over a white backdrop, and over Solid in every state', () => {
    const primary = (d: ComponentDefinition) => ({ ...d, style: { ...d.style, variant: 'primary' } });
    const g = glassParams(resolveDefinitionMaterial(primary(button())) as never);
    expect(contrast('#ffffff', over(g.tint, g.tintOpacity, '#ffffff'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#ffffff', over(g.tint, g.tintOpacity, '#000000'))).toBeGreaterThanOrEqual(4.5);
    const s = resolveDefinitionMaterial(primary(solidOf(button()))) as SolidDocument;
    for (const flags of [{}, { hover: true }, { pressed: true }, { active: true }]) {
      const st = resolveSolid(s, { hover: false, pressed: false, active: false, disabled: false, ...flags });
      expect(contrast(st.foreground, st.fill), JSON.stringify(flags)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('changing the material keeps content, structure, layout, style, state styles and interactions', () => {
    let d = button();
    d = setButtonText(d, 'Salva')!;
    d = setButtonField(d, 'layout.size', 'lg')!;
    d = setButtonField(d, 'states.hover.style.background', '#11223344')!;
    d = setButtonField(d, 'states.focus.style.width', 3)!;
    d = setButtonLink(d, 'link', '/salva')!;
    d = setButtonDisabled(d, true);
    d = setButtonField(d, 'interactions.events.press', 'salva-premuto')!;
    d = addButtonBreakpoint(d, 420).def;
    const before = raw(d);
    const to = switchMaterialFamily(d, 'solid').definition;
    const after = raw(to);
    for (const key of ['structure', 'content', 'layout', 'responsive', 'style', 'interactions', 'name', 'id', 'type']) expect(after[key], key).toEqual(before[key]);
    expect(after.states.hover.style).toEqual(before.states.hover.style);
    expect(after.states.focus.style).toEqual(before.states.focus.style);
    expect(after.material.family).toBe('solid');
    // And back again: the definition is the same one, apart from the material.
    const back = raw(switchMaterialFamily(to, 'glass').definition);
    for (const key of ['structure', 'content', 'layout', 'responsive', 'style', 'interactions', 'states']) expect(back[key], key).toEqual(before[key]);
    expect(parseDefinition(after).ok && parseDefinition(back).ok).toBe(true);
  });

  it('the material’s own state overrides are dropped when the family changes — and the result says which', () => {
    const d = solidOf(button());
    const withOverrides = { ...d, material: { ...d.material, params: { fill: '#10b981' } }, states: { ...d.states, hover: { ...d.states.hover, material: { fill: '#065f46' } } } } as ComponentDefinition;
    const r = switchMaterialFamily(withOverrides, 'glass');
    expect(r.dropped).toEqual(['material.params', 'states.hover.material']);
    expect(r.definition.states.hover).toEqual({ style: withOverrides.states.hover!.style });
    expect(parseDefinition(raw(r.definition)).ok).toBe(true);
    // Staying on the family keeps them (when valid).
    const same = bindComponentMaterial(withOverrides, bindMaterial(MATERIALS.get('solid')!.presets[1]!.doc, 'solid-dark'));
    expect(same.dropped).toEqual([]);
    expect(same.definition.states.hover?.material).toEqual({ fill: '#065f46' });
    expect(same.definition.material.preset).toBe('solid-dark');
  });

  it('a type that cannot be drawn with a family is refused, not half applied', () => {
    expect(() => switchMaterialFamily(button(), 'jelly')).toThrow(/non si disegna/);
  });
});

describe('serialization is canonical', () => {
  it('a definition reads the same however it was edited: content follows the structure, and serialize → parse → serialize is the identity', () => {
    let d = button();
    d = setButtonLink(d, 'link', '/docs')!; // adds content.root last
    d = setButtonDisabled(d, true);
    const text = serializeDefinition(d);
    expect(Object.keys(JSON.parse(text).content)).toEqual(['root', 'icon', 'label']);
    const r = parseDefinitionText(text);
    expect(r.ok && serializeDefinition(r.doc)).toBe(text);
    // Removing and re-adding the icon puts it back where the structure says.
    const again = setButtonIcon(setButtonIcon(d, null), { kind: 'builtin', name: 'star' });
    expect(Object.keys(JSON.parse(serializeDefinition(again)).content)).toEqual(['root', 'icon', 'label']);
  });
});
