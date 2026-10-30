import { describe, expect, it } from 'vitest';
import {
  addBreakpoint,
  addTab,
  applyNavbarView,
  BN_FIELDS,
  bindingState,
  bindMaterial,
  COMPONENT_TEMPLATES,
  componentTemplate,
  createRoot,
  createTab,
  duplicateTab,
  editNavbar,
  glassMaterialOf,
  getNavbarField,
  iconFromSvg,
  materialRevision,
  moveTab,
  navbarView,
  parseDefinition,
  parseDefinitionText,
  parseSvg,
  removeTab,
  resolveNavbar,
  serializeDefinition,
  setNavbarField,
  setRootField,
  tabStyle,
  uniqueId,
  updateBreakpoint,
  updateTab,
  type ComponentDefinition,
} from '../../src/components';
import { BUILTIN_MATERIALS, createGlassDocument, MATERIALS, materialDefinition, withGlassParams } from '../../src/model';
import { defaultParams, serializeParams } from '../../src/core/params';

const demo = () => componentTemplate('mobile-navbar')!.create();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const parse = (d: unknown) => parseDefinition(d);

describe('material registry', () => {
  it('registers Glass with schema, defaults, presets, capabilities, fallbacks and export info', () => {
    const g = materialDefinition('glass')!;
    expect(g).toMatchObject({ id: 'glass', name: 'Glass', version: 1, document: { format: 'jello-material', schemaVersion: 2 } });
    expect(g.params.length).toBeGreaterThan(20);
    expect(g.defaults()).toEqual(defaultParams());
    expect(g.presets.map((p) => p.doc.id)).toEqual(BUILTIN_MATERIALS.map((b) => b.doc.id));
    expect(g.capabilities.backends.map((b) => b.backend)).toEqual(['svg', 'css', 'webgl2']);
    expect(g.fallbacks).toEqual(['css', 'opaque']);
    expect(g.export).toMatchObject({ module: '@jello/runtime', entry: 'createMaterialGroup' });
    expect(g.create('m-1', 'Nuovo').family).toBe('glass');
    expect(MATERIALS.preset('navbar')?.doc.id).toBe('navbar');
  });

  it('refuses duplicates and families that are only planned', () => {
    expect(() => MATERIALS.register(materialDefinition('glass')!)).toThrow(/già registrato/);
    expect(() => MATERIALS.register({ ...materialDefinition('glass')!, id: 'jelly' })).toThrow(/non è disponibile/);
    expect(MATERIALS.list().map((d) => d.id)).toEqual(['glass', 'solid']);
  });
});

describe('mobile-navbar definition', () => {
  it('the official template is a valid document and survives serialize → parse without any loss', () => {
    for (const t of COMPONENT_TEMPLATES) {
      const doc = t.create();
      const r = parseDefinitionText(serializeDefinition(doc));
      expect(r.ok, t.id).toBe(true);
      if (r.ok) {
        expect(r.doc).toEqual(doc);
        expect(r.warnings).toEqual([]);
        expect(r.migratedFrom).toBeNull();
      }
    }
  });

  it('the official Mobile, Button and Desktop templates are generic', () => {
    expect(COMPONENT_TEMPLATES.map((t) => [t.id, t.label])).toEqual([
      ['mobile-navbar', 'Mobile Navbar'],
      ['button', 'Button'],
      ['desktop-navbar', 'Desktop Navbar'],
    ]);
    expect(componentTemplate('bt-darts')).toBeUndefined();
    expect(componentTemplate('bottom-navigation')).toBeUndefined();
    expect(JSON.stringify(COMPONENT_TEMPLATES.map((t) => t.create()))).not.toMatch(/darts|\bbt\b|cable|matrice|risultati|bottom-navigation/i);
    const d = demo();
    const v = navbarView(d);
    expect(v.children.map((t) => [t.id, t.label, t.icon])).toEqual([
      ['home', 'Home', { kind: 'builtin', name: 'home' }],
      ['explore', 'Explore', { kind: 'builtin', name: 'compass' }],
      ['profile', 'Profile', { kind: 'builtin', name: 'user' }],
    ]);
    expect(v.children.every((t) => t.value === null)).toBe(true);
    expect(v.responsive.breakpoints).toEqual([]);
    expect(d.type).toBe('mobile-navbar');
    expect(d.material.preset).toBe('navbar');
    expect(glassMaterialOf(d).id).toBe('navbar');
    expect(v.layout).toMatchObject({ height: 64, padding: 6, gap: 2, radius: 'capsule', offset: 12, maxWidth: 440 });
  });

  it('keeps structure, content, layout, material and states apart', () => {
    const d = demo();
    expect(d.structure).toMatchObject({ id: 'root', role: 'navbar' });
    expect(d.structure.children!.map((c) => [c.id, c.role, c.children!.map((k) => k.role)])).toEqual([
      ['home', 'item', ['icon', 'label']],
      ['explore', 'item', ['icon', 'label']],
      ['profile', 'item', ['icon', 'label']],
    ]);
    expect(d.content['home-label']).toEqual({ text: 'Home' });
    expect(d.content['home-icon']).toEqual({ icon: { kind: 'builtin', name: 'home' } });
    expect(d.content.root).toEqual({ text: 'Navigazione principale' });
    expect(d.layout).toMatchObject({ placement: 'floating', height: 64 });
    expect(d.states.focus?.style).toMatchObject({ width: 2 });
    expect(d.states.active?.material).toBeUndefined();
    expect(d.interactions.events).toEqual({ change: 'jello-change', press: 'jello-press', reselect: 'jello-reselect' });
    expect(d.material).toMatchObject({ family: 'glass', preset: 'navbar', params: {} });
  });

  it('an edited component (custom tab, svg icon, breakpoint, overrides) round-trips exactly', () => {
    const icon = iconFromSvg('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"/></svg>', 'dot.svg');
    expect(icon.ok).toBe(true);
    const added = addTab(navbarView(demo()), { label: 'Classifica' });
    let root = updateTab(added.root, added.id, { icon: icon.ok ? icon.icon : { kind: 'none' }, value: '/classifica', style: { fontSize: 13 } as never });
    root = setRootField(root, 'layout.height', 70)!;
    root = { ...root, responsive: { ...root.responsive, breakpoints: [{ id: 'narrow', maxWidth: 400, overrides: { 'layout.labels': 'active', 'icon.size': 20 } }] } };
    const d = { ...applyNavbarView(demo(), root), meta: { ...demo().meta, notes: 'prova' } };
    const r = parse(JSON.parse(serializeDefinition(d)));
    expect(r.ok && r.doc).toEqual(d);
    expect(r.ok && JSON.parse(JSON.stringify(navbarView(r.doc)))).toEqual(JSON.parse(JSON.stringify(root)));
  });

  it('applying the view of a definition back to it changes nothing', () => {
    const d = demo();
    expect(applyNavbarView(d, navbarView(d))).toEqual(d);
  });

  it('missing properties take defaults with a warning; unknown ones are reported and dropped', () => {
    const raw = clone(demo()) as unknown as Record<string, any>;
    delete raw.layout.gap;
    raw.layout.magic = 1;
    raw.extra = 1;
    const r = parse(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.layout.gap).toBe(2);
    expect(r.warnings.join('\n')).toMatch(/layout\.gap: assente/);
    expect(r.warnings.join('\n')).toMatch(/layout\.magic: proprietà sconosciuta/);
    expect(r.warnings.join('\n')).toMatch(/extra: campo sconosciuto/);
    expect('magic' in r.doc.layout).toBe(false);
  });

  it('is atomic: every invalid value is reported with its canonical path and nothing is returned', () => {
    const raw = clone(demo()) as unknown as Record<string, any>;
    raw.layout.height = 999;
    raw.states.focus.style.color = 'red';
    raw.style.typography.fontSize = 1;
    raw.interactions.events.press = 'Bad Name';
    const r = parse(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const all = r.errors.join('\n');
    expect(all).toMatch(/layout\.height: 999 fuori intervallo/);
    expect(all).toMatch(/states\.focus\.style\.color/);
    expect(all).toMatch(/style\.typography\.fontSize/);
    expect(all).toMatch(/interactions\.events\.press/);
  });

  it('a duplicated or empty item is refused with its place', () => {
    const raw = clone(demo()) as unknown as Record<string, any>;
    raw.structure.children[1].id = 'home';
    expect(parse(raw)).toMatchObject({ ok: false, errors: [expect.stringMatching(/«home» è duplicato/)] });
    const raw2 = clone(demo()) as unknown as Record<string, any>;
    raw2.content['profile-label'].text = '';
    expect(parse(raw2)).toMatchObject({ ok: false, errors: [expect.stringMatching(/content\.profile-label\.text/)] });
  });

  it('refuses newer versions, unknown types and an invalid embedded material', () => {
    const d = clone(demo()) as unknown as Record<string, any>;
    expect(parse({ ...d, schemaVersion: 2 })).toMatchObject({ ok: false, errors: [expect.stringMatching(/più recente/)] });
    expect(parse({ ...d, typeVersion: 5 })).toMatchObject({ ok: false, errors: [expect.stringMatching(/typeVersion 5/)] });
    expect(parse({ ...d, type: 'carousel' })).toMatchObject({ ok: false, errors: [expect.stringMatching(/sconosciuto/)] });
    expect(parse({ ...d, schemaVersion: 0 })).toMatchObject({ ok: false });
    const bad = clone(d);
    bad.material.document.material.blur = 500;
    const r = parse(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^material\.document\.material\.blur/);
  });

  it('migrates an embedded jello-glass v1 material (the component keeps every other field)', () => {
    const d = clone(demo()) as unknown as Record<string, any>;
    d.material.document = JSON.parse(serializeParams({ ...defaultParams(), blur: 9 }));
    const r = parse(d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe('jello-glass@1');
    expect(glassMaterialOf(r.doc).material.blur).toBe(9);
    expect({ ...r.doc, material: demo().material }).toEqual({ ...demo(), material: demo().material });
  });

  it('a default item that is not an item falls back to the first one', () => {
    const d = clone(demo());
    d.interactions.behavior.defaultItem = 'nowhere';
    const r = parse(d);
    expect(r.ok && navbarView(r.doc).defaultTab).toBe('home');
    expect(r.ok && r.warnings.join()).toMatch(/defaultItem/);
  });

  it('serialized documents contain no functions, only declarative events', () => {
    const text = serializeDefinition(demo());
    expect(text).not.toMatch(/function|=>/);
    expect(JSON.parse(text).interactions.events).toEqual({ change: 'jello-change', press: 'jello-press', reselect: 'jello-reselect' });
  });

  it('every described property has a valid default, reachable by its canonical path', () => {
    for (const f of BN_FIELDS) expect(setRootField(createRoot([createTab('a', 'A')]), f.path, f.default), f.path).not.toBeNull();
    const d = demo();
    expect(setNavbarField(d, 'layout.height', 70)?.layout.height).toBe(70);
    expect(setNavbarField(d, 'style.typography.fontSize', 14)?.style).toMatchObject({ typography: { fontSize: 14 } });
    expect(setNavbarField(d, 'states.focus.style.color', '#112233')?.states.focus?.style).toMatchObject({ color: '#112233' });
    expect(getNavbarField(d, 'interactions.behavior.reselect')).toBe('event');
    expect(setNavbarField(d, 'layout.height', 20)).toBeNull();
    expect(setNavbarField(d, 'layout.nope', 1)).toBeNull();
  });
});

describe('editing tabs', () => {
  it('ids are stable, unique and independent from labels', () => {
    const d = demo();
    const a = addTab(navbarView(d), { after: 'explore' });
    expect(a.id).toBe('tab');
    expect(a.root.children.map((t) => t.id)).toEqual(['home', 'explore', 'tab', 'profile']);
    const b = addTab(a.root);
    expect(b.id).toBe('tab-2');
    const renamed = updateTab(b.root, 'tab', { label: 'Profile' });
    expect(renamed.children.find((t) => t.label === 'Profile' && t.id === 'tab')).toBeTruthy();
    expect(uniqueId('Città è bella!', [])).toBe('citta-e-bella');
    expect(uniqueId('42', [])).toBe('tab-42');
  });

  it('the structure follows: a new item gets an icon slot and a label slot, ids derived and never colliding', () => {
    let d = editNavbar(demo(), (r) => addTab(r, { label: 'Nuova' }).root);
    expect(d.structure.children!.map((c) => c.id)).toEqual(['home', 'explore', 'profile', 'tab']);
    expect(d.structure.children![3]!.children!.map((c) => c.id)).toEqual(['tab-icon', 'tab-label']);
    expect(d.content['tab-label']).toEqual({ text: 'Nuova' });
    // An item named like another item's slot does not steal it.
    d = editNavbar(d, (r) => ({ ...r, children: [...r.children, createTab('tab-icon', 'Strana')] }));
    const ids = JSON.stringify(d.structure).match(/"id":"[^"]+"/g)!;
    expect(new Set(ids).size).toBe(ids.length);
    expect(parse(JSON.parse(serializeDefinition(d))).ok).toBe(true);
  });

  it('existing slot ids are kept across edits (labels change, ids do not)', () => {
    const before = demo();
    const after = editNavbar(before, (r) => updateTab(r, 'explore', { label: 'Scopri' }));
    expect(after.structure).toEqual(before.structure);
    expect(after.content['explore-label']).toEqual({ text: 'Scopri' });
  });

  it('no arbitrary maximum: 30 tabs are a valid document', () => {
    let d = demo();
    for (let i = 0; i < 27; i++) d = editNavbar(d, (r) => addTab(r).root);
    expect(navbarView(d).children).toHaveLength(30);
    expect(parse(JSON.parse(serializeDefinition(d))).ok).toBe(true);
  });

  it('duplicate, move, remove (never the last tab) and default tab follow', () => {
    const root = navbarView(demo());
    const dup = duplicateTab(root, 'explore');
    expect(dup.id).toBe('explore-copia');
    expect(dup.root.children[2]).toMatchObject({ id: 'explore-copia', label: 'Explore (copia)', icon: { kind: 'builtin', name: 'compass' } });
    const moved = moveTab(dup.root, 'profile', 0);
    expect(moved.children.map((t) => t.id)).toEqual(['profile', 'home', 'explore', 'explore-copia']);
    expect(moveTab(moved, 'profile', -5)).toBe(moved);
    const removed = removeTab({ ...moved, defaultTab: 'profile' }, 'profile');
    expect(removed.defaultTab).toBe('home');
    const one = createRoot([createTab('only', 'Solo')]);
    expect(removeTab(one, 'only')).toBe(one);
  });

  it('per-tab overrides inherit from the root when null', () => {
    const root = navbarView(demo());
    const t = updateTab(root, 'explore', { style: { iconSize: 30 } as never }).children[1]!;
    expect(tabStyle(root, t)).toEqual({ iconSize: 30, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.1 });
    const d = editNavbar(demo(), (r) => updateTab(r, 'explore', { style: { iconSize: 30 } as never }));
    expect(d.style.items).toEqual({ explore: { iconSize: 30 } });
  });

  it('a tab without an icon or a label has no slot for it, and comes back', () => {
    let d = editNavbar(demo(), (r) => updateTab(r, 'home', { icon: { kind: 'none' } }));
    expect(d.structure.children![0]!.children!.map((c) => c.role)).toEqual(['label']);
    expect('home-icon' in d.content).toBe(false);
    d = editNavbar(d, (r) => updateTab(r, 'home', { icon: { kind: 'builtin', name: 'star' } }));
    expect(d.structure.children![0]!.children!.map((c) => c.id)).toEqual(['home-icon', 'home-label']);
  });
});

describe('responsive', () => {
  it('breakpoints apply from the widest to the narrowest', () => {
    let d = demo();
    d = editNavbar(d, (r) => {
      const t = addBreakpoint(r, 800);
      let x = updateBreakpoint(t.root, t.id, { set: ['layout.height', 60] });
      x = updateBreakpoint(x, t.id, { set: ['layout.labels', 'active'] });
      const p = addBreakpoint(x, 420);
      return updateBreakpoint(p.root, p.id, { set: ['layout.height', 56] });
    });
    expect((d.responsive.breakpoints as { overrides: object }[]).map((b) => b.overrides)).toEqual([{ 'layout.height': 60, 'layout.labels': 'active' }, { 'layout.height': 56 }]);
    expect(resolveNavbar(d, 1200)).toMatchObject({ breakpoint: null, root: { layout: { height: 64, labels: 'show' } } });
    expect(resolveNavbar(d, 768)).toMatchObject({ breakpoint: 'bp-800', root: { layout: { height: 60, labels: 'active' } } });
    expect(resolveNavbar(d, 390)).toMatchObject({ breakpoint: 'bp-420', root: { layout: { height: 56, labels: 'active' } } });
  });

  it('breakpoint overrides are stored under canonical names and validated', () => {
    const d = editNavbar(demo(), (r) => {
      const t = addBreakpoint(r, 500);
      return updateBreakpoint(t.root, t.id, { set: ['typography.fontSize', 13] });
    });
    expect((d.responsive.breakpoints as { overrides: object }[])[0]!.overrides).toEqual({ 'style.typography.fontSize': 13 });
    expect(navbarView(d).responsive.breakpoints[0]!.overrides).toEqual({ 'typography.fontSize': 13 });
    const bad = clone(d) as unknown as Record<string, any>;
    bad.responsive.breakpoints[0].overrides['style.typography.fontSize'] = 99;
    expect(parse(bad)).toMatchObject({ ok: false, errors: [expect.stringMatching(/overrides\.style\.typography\.fontSize/)] });
    bad.responsive.breakpoints[0].overrides = { 'layout.anchor': 'inline', 'style.typography.fontSize': 13 };
    const r = parse(bad);
    expect(r.ok && r.warnings.join()).toMatch(/layout\.anchor: non sovrascrivibile/);
  });
});

describe('svg icons', () => {
  it('keeps shapes and presentation, rewrites the markup it accepted', () => {
    const r = parseSvg('<?xml version="1.0"?><!-- c --><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="currentColor"><title>x</title><g id="a"><path d="M4 4h16" stroke-width="2"/><rect x="1" y="1" width="3" height="3" rx="1"/></g></svg>');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.viewBox).toBe('0 0 24 24');
    expect(r.paint).toBe('stroke');
    const i = iconFromSvg('<svg viewBox="0 0 10 10"><path d="M0 0L10 10Z"/></svg>', 'my-icon.svg');
    expect(i.ok && i.icon).toEqual({ kind: 'svg', name: 'my-icon', viewBox: '0 0 10 10', body: '<path d="M0 0L10 10Z"/>', paint: 'fill' });
  });

  it.each([
    ['script', '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'],
    ['event handler', '<svg viewBox="0 0 1 1"><path d="M0 0" onclick="alert(1)"/></svg>'],
    ['root event handler', '<svg viewBox="0 0 1 1" onload="alert(1)"><path d="M0 0"/></svg>'],
    ['href', '<svg viewBox="0 0 1 1"><path d="M0 0" href="javascript:alert(1)"/></svg>'],
    ['xlink use', '<svg viewBox="0 0 1 1"><use xlink:href="#a"/></svg>'],
    ['style', '<svg viewBox="0 0 1 1"><path d="M0 0" style="fill:url(http://x)"/></svg>'],
    ['url paint', '<svg viewBox="0 0 1 1"><path d="M0 0" fill="url(#g)"/></svg>'],
    ['foreignObject', '<svg viewBox="0 0 1 1"><foreignObject><div/></foreignObject></svg>'],
    ['image', '<svg viewBox="0 0 1 1"><image href="x.png"/></svg>'],
    ['entity', '<!DOCTYPE svg [<!ENTITY x "y">]><svg viewBox="0 0 1 1">&x;</svg>'],
    ['cdata', '<svg viewBox="0 0 1 1"><![CDATA[x]]></svg>'],
    ['not svg', '<html><body/></html>'],
    ['text', '<svg viewBox="0 0 1 1">hello</svg>'],
    ['bad path data', '<svg viewBox="0 0 1 1"><path d="M0 0 ); alert(1)"/></svg>'],
    ['unclosed', '<svg viewBox="0 0 1 1"><g><path d="M0 0"/></svg>'],
    ['no shapes', '<svg viewBox="0 0 1 1"></svg>'],
    ['no viewBox', '<svg><path d="M0 0"/></svg>'],
  ])('refuses %s', (_, text) => {
    expect(parseSvg(text).ok).toBe(false);
  });

  it('refuses oversized files', () => {
    expect(parseSvg(`<svg viewBox="0 0 1 1"><path d="${'M0 0'.repeat(5000)}"/></svg>`)).toMatchObject({ ok: false, errors: [expect.stringMatching(/troppo grande/)] });
  });

  it('a stored component with tampered svg is refused at parse time', () => {
    const d = clone(demo()) as unknown as Record<string, any>;
    d.content['home-icon'].icon = { kind: 'svg', name: 'x', viewBox: '0 0 1 1', body: '<path d="M0 0" onload="alert(1)"/>', paint: 'fill' };
    const r = parse(d);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/onload non ammesso/);
  });
});

describe('material binding', () => {
  const personal = (blur: number, name = 'Mio vetro') => withGlassParams(createGlassDocument({ id: 'user-1', name }), { ...defaultParams(), blur });

  it('a component applied from a preset follows it until edited locally', () => {
    const v1 = personal(4);
    const b = bindMaterial(v1, 'user-1');
    expect(b.revision).toBe(materialRevision(v1));
    expect(bindingState(b, v1)).toBe('linked');
    // The preset changes in the Material Lab: the untouched component should follow.
    const v2 = personal(9);
    expect(bindingState(b, v2)).toBe('outdated');
    expect(bindingState(bindMaterial(v2, 'user-1'), v2)).toBe('linked');
    // Edited in the component: it keeps its own values…
    const local = { ...b, document: withGlassParams(v1, { ...defaultParams(), blur: 12 }) };
    expect(bindingState(local, v1)).toBe('modified');
    // …and when both changed, updating would replace them.
    expect(bindingState(local, v2)).toBe('diverged');
  });

  it('renaming counts, timestamps and ids do not; a missing preset leaves the material embedded', () => {
    const v1 = personal(4);
    const b = bindMaterial(v1, 'user-1');
    expect(bindingState(b, { ...v1, meta: { ...v1.meta, updatedAt: '2026-10-29T10:00:00Z' } })).toBe('linked');
    expect(bindingState(b, { ...v1, name: 'Nuovo nome' })).toBe('outdated');
    expect(bindingState(b, undefined)).toBe('embedded');
    expect(bindingState(bindMaterial(v1, null), v1)).toBe('embedded');
  });

  it('the revision survives serialization; documents without it still parse', () => {
    const d: ComponentDefinition = { ...demo(), material: bindMaterial(personal(4), 'user-1') };
    const r = parse(JSON.parse(serializeDefinition(d)));
    expect(r.ok && r.doc.material).toEqual(d.material);
    const raw = clone(d) as unknown as { material: Record<string, unknown> };
    delete raw.material.revision;
    const old = parse(raw);
    expect(old.ok && old.doc.material.revision).toBeNull();
    expect(old.ok && bindingState(old.doc.material, personal(9))).toBe('modified');
  });
});
