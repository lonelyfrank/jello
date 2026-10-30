import { describe, expect, it } from 'vitest';
import {
  addTab,
  bindingState,
  bindMaterial,
  materialRevision,
  BN_FIELDS,
  COMPONENT_TEMPLATES,
  componentTemplate,
  createRoot,
  createTab,
  duplicateTab,
  iconFromSvg,
  moveTab,
  parseComponent,
  parseComponentText,
  parseSvg,
  removeTab,
  resolveRoot,
  serializeComponent,
  setRootField,
  tabStyle,
  uniqueId,
  updateTab,
  withRootField,
  type ComponentDocument,
} from '../../src/components';
import { BUILTIN_MATERIALS, createGlassDocument, MATERIALS, materialDefinition, withGlassParams } from '../../src/model';
import { defaultParams, serializeParams } from '../../src/core/params';

const demo = () => componentTemplate('bottom-navigation')!.create();
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

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
    expect(() => MATERIALS.register({ ...materialDefinition('glass')!, id: 'gel' })).toThrow(/non è disponibile/);
    expect(MATERIALS.list().map((d) => d.id)).toEqual(['glass']);
  });
});

describe('component document', () => {
  it('templates are valid documents and survive serialize → parse without any loss', () => {
    for (const t of COMPONENT_TEMPLATES) {
      const doc = t.create();
      const r = parseComponentText(serializeComponent(doc));
      expect(r.ok, t.id).toBe(true);
      if (r.ok) {
        expect(r.doc).toEqual(doc);
        expect(r.warnings).toEqual([]);
      }
    }
  });

  it('the only official template is the generic Bottom Navigation: Home, Explore, Profile', () => {
    expect(COMPONENT_TEMPLATES.map((t) => [t.id, t.label])).toEqual([['bottom-navigation', 'Bottom Navigation']]);
    expect(componentTemplate('bt-darts')).toBeUndefined();
    expect(JSON.stringify(COMPONENT_TEMPLATES.map((t) => t.create()))).not.toMatch(/darts|\bbt\b|cable|matrice|risultati/i);
    const d = demo();
    expect(d.root.children.map((t) => [t.id, t.label, t.icon])).toEqual([
      ['home', 'Home', { kind: 'builtin', name: 'home' }],
      ['explore', 'Explore', { kind: 'builtin', name: 'compass' }],
      ['profile', 'Profile', { kind: 'builtin', name: 'user' }],
    ]);
    expect(d.root.children.every((t) => t.value === null)).toBe(true);
    expect(d.root.responsive.breakpoints).toEqual([]);
    expect(d.material.preset).toBe('navbar');
    expect(d.material.document.id).toBe('navbar');
    expect(d.root.layout).toMatchObject({ height: 64, padding: 6, gap: 2, radius: 'capsule', offset: 12, maxWidth: 440 });
  });

  it('an edited component (custom tab, svg icon, breakpoint, overrides) round-trips exactly', () => {
    let d = demo();
    const icon = iconFromSvg('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"/></svg>', 'dot.svg');
    expect(icon.ok).toBe(true);
    const added = addTab(d.root, { label: 'Classifica' });
    let root = updateTab(added.root, added.id, { icon: icon.ok ? icon.icon : { kind: 'none' }, value: '/classifica', style: { fontSize: 13 } as never });
    root = setRootField(root, 'layout.height', 70)!;
    root = { ...root, responsive: { ...root.responsive, breakpoints: [{ id: 'narrow', maxWidth: 400, overrides: { 'layout.labels': 'active', 'icon.size': 20 } }] } };
    d = { ...d, root, meta: { ...d.meta, notes: 'prova' } };
    const r = parseComponent(JSON.parse(serializeComponent(d)));
    expect(r.ok && r.doc).toEqual(d);
  });

  it('missing properties take defaults with a warning; unknown ones are reported and dropped', () => {
    const raw = clone(demo()) as unknown as { root: Record<string, Record<string, unknown>>; extra?: number };
    delete raw.root.layout!.gap;
    (raw.root.layout as Record<string, unknown>).magic = 1;
    raw.extra = 1;
    const r = parseComponent(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.doc.root.layout.gap).toBe(2);
    expect(r.warnings.join('\n')).toMatch(/root\.layout\.gap: assente/);
    expect(r.warnings.join('\n')).toMatch(/root\.layout\.magic: proprietà sconosciuta/);
    expect(r.warnings.join('\n')).toMatch(/extra: campo sconosciuto/);
    expect('magic' in r.doc.root.layout).toBe(false);
  });

  it('is atomic: every invalid value is reported and nothing is returned', () => {
    const raw = clone(demo()) as unknown as Record<string, any>;
    raw.root.layout.height = 999;
    raw.root.states.focus.color = 'red';
    raw.root.children[1].id = 'home';
    raw.root.children[2].label = '';
    const r = parseComponent(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const all = r.errors.join('\n');
    expect(all).toMatch(/root\.layout\.height: 999 fuori intervallo/);
    expect(all).toMatch(/root\.states\.focus\.color/);
    expect(all).toMatch(/"home" duplicato/);
    expect(all).toMatch(/root\.children\.2/);
  });

  it('refuses newer versions, unknown types and an invalid embedded material', () => {
    const d = clone(demo()) as unknown as Record<string, any>;
    expect(parseComponent({ ...d, schemaVersion: 2 })).toMatchObject({ ok: false, errors: [expect.stringMatching(/più recente/)] });
    expect(parseComponent({ ...d, typeVersion: 5 })).toMatchObject({ ok: false, errors: [expect.stringMatching(/typeVersion 5/)] });
    expect(parseComponent({ ...d, type: 'carousel' })).toMatchObject({ ok: false, errors: [expect.stringMatching(/sconosciuto/)] });
    expect(parseComponent({ ...d, schemaVersion: 0 })).toMatchObject({ ok: false });
    const bad = clone(d);
    bad.material.document.material.blur = 500;
    const r = parseComponent(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^material\.document\.material\.blur/);
  });

  it('migrates an embedded jello-glass v1 material (component keeps every other field)', () => {
    const d = clone(demo()) as unknown as Record<string, any>;
    d.material.document = JSON.parse(serializeParams({ ...defaultParams(), blur: 9 }));
    const r = parseComponent(d);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.migratedFrom).toBe('jello-glass@1');
    expect(r.doc.material.document.material.blur).toBe(9);
    expect(r.doc.root).toEqual(demo().root);
  });

  it('a defaultTab that is not a tab falls back to the first one', () => {
    const d = clone(demo());
    d.root.defaultTab = 'nowhere';
    const r = parseComponent(d);
    expect(r.ok && r.doc.root.defaultTab).toBe('home');
  });

  it('serialized documents contain no functions, only declarative events', () => {
    const text = serializeComponent(demo());
    expect(text).not.toMatch(/function|=>/);
    expect(JSON.parse(text).root.interactions.events).toEqual({ change: 'jello-change', press: 'jello-press', reselect: 'jello-reselect' });
  });

  it('every described property has a valid default', () => {
    const root = createRoot([createTab('a', 'A')]);
    for (const f of BN_FIELDS) expect(setRootField(root, f.path, f.default), f.path).not.toBeNull();
    expect(withRootField(demo(), 'layout.height', 20)).toBeNull();
  });
});

describe('editing tabs', () => {
  it('ids are stable, unique and independent from labels', () => {
    const d = demo();
    const a = addTab(d.root, { after: 'explore' });
    expect(a.id).toBe('tab');
    expect(a.root.children.map((t) => t.id)).toEqual(['home', 'explore', 'tab', 'profile']);
    const b = addTab(a.root);
    expect(b.id).toBe('tab-2');
    const renamed = updateTab(b.root, 'tab', { label: 'Profile' });
    expect(renamed.children.find((t) => t.label === 'Profile' && t.id === 'tab')).toBeTruthy();
    expect(uniqueId('Città è bella!', [])).toBe('citta-e-bella');
    expect(uniqueId('42', [])).toBe('tab-42');
  });

  it('no arbitrary maximum: 30 tabs are a valid document', () => {
    let root = demo().root;
    for (let i = 0; i < 27; i++) root = addTab(root).root;
    expect(root.children).toHaveLength(30);
    expect(parseComponent({ ...demo(), root }).ok).toBe(true);
  });

  it('duplicate, move, remove (never the last tab) and default tab follow', () => {
    const d = demo();
    const dup = duplicateTab(d.root, 'explore');
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
    const root = demo().root;
    const t = updateTab(root, 'explore', { style: { iconSize: 30 } as never }).children[1]!;
    expect(tabStyle(root, t)).toEqual({ iconSize: 30, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.1 });
  });
});

describe('responsive', () => {
  it('breakpoints apply from the widest to the narrowest', () => {
    const root = {
      ...demo().root,
      responsive: {
        ...demo().root.responsive,
        breakpoints: [
          { id: 'tablet', maxWidth: 800, overrides: { 'layout.height': 60, 'layout.labels': 'active' } },
          { id: 'phone', maxWidth: 420, overrides: { 'layout.height': 56 } },
        ],
      },
    };
    expect(resolveRoot(root, 1200)).toMatchObject({ breakpoint: null, root: { layout: { height: 64, labels: 'show' } } });
    expect(resolveRoot(root, 768)).toMatchObject({ breakpoint: 'tablet', root: { layout: { height: 60, labels: 'active' } } });
    expect(resolveRoot(root, 390)).toMatchObject({ breakpoint: 'phone', root: { layout: { height: 56, labels: 'active' } } });
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
    const d = clone(demo()) as ComponentDocument;
    d.root.children[0]!.icon = { kind: 'svg', name: 'x', viewBox: '0 0 1 1', body: '<path d="M0 0" onload="alert(1)"/>', paint: 'fill' };
    const r = parseComponent(d);
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
    const d = { ...demo(), material: bindMaterial(personal(4), 'user-1') };
    const r = parseComponent(JSON.parse(serializeComponent(d)));
    expect(r.ok && r.doc.material).toEqual(d.material);
    const raw = clone(d) as unknown as { material: Record<string, unknown> };
    delete raw.material.revision;
    const old = parseComponent(raw);
    expect(old.ok && old.doc.material.revision).toBeNull();
    expect(old.ok && bindingState(old.doc.material, personal(9))).toBe('modified');
  });
});
