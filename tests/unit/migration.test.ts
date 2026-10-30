/**
 * Legacy data: `jello-component` v1 files written by the previous versions
 * (real fixtures in tests/fixtures/legacy) are converted to the canonical
 * `jello-component-definition` without losing anything, and the identifiers of
 * removed presets and templates still resolve.
 */
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyNavbarView, navbarView, parseDefinitionText, serializeDefinition, resolveDefinitionMaterial, type ComponentDefinition } from '../../src/components';
import { LEGACY_PRESETS, LEGACY_TEMPLATES, convertComponentV1, importComponent, importComponentText, legacyPreset, legacyTemplate } from '../../src/migration';
import { serializeMaterial } from '../../src/model';

const FIXTURES = ['bottom-navigation-template', 'bottom-navigation-custom', 'bt-darts'] as const;
const raw = (name: string) => JSON.parse(readFileSync(`tests/fixtures/legacy/${name}.component.json`, 'utf8')) as Record<string, any>;
const convert = (name: string) => {
  const r = convertComponentV1(raw(name));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r;
};

describe('jello-component v1 → canonical definition', () => {
  it.each(FIXTURES)('%s converts, and its derived view equals the old root exactly', (name) => {
    const old = raw(name);
    const { doc, migratedFrom } = convert(name);
    expect(migratedFrom).toMatch(/jello-component@1.*mobile-navbar/);
    expect(doc.format).toBe('jello-component-definition');
    expect(doc.type).toBe('mobile-navbar');
    // Every tab, icon, label, value, disabled flag, per-tab style, section, event name and breakpoint override survives.
    expect(JSON.parse(JSON.stringify(navbarView(doc)))).toEqual({ ...old.root, kind: 'mobile-navbar' });
  });

  it.each(FIXTURES)('%s keeps identity, material binding and metadata', (name) => {
    const old = raw(name);
    const { doc } = convert(name);
    expect(doc.id).toBe(old.id);
    expect(doc.name).toBe(old.name);
    expect(doc.material).toMatchObject({ family: old.material.family, preset: old.material.preset, revision: old.material.revision, params: {} });
    expect(serializeMaterial(doc.material.document!)).toBe(JSON.stringify(JSON.parse(serializeMaterial(doc.material.document!)), null, 2));
    expect(JSON.parse(serializeMaterial(doc.material.document!))).toEqual(old.material.document);
    expect(resolveDefinitionMaterial(doc)).toEqual(doc.material.document);
    expect(doc.meta.createdAt).toBe(old.meta.createdAt);
    expect(doc.meta.updatedAt).toBe(old.meta.updatedAt);
    expect(doc.meta.notes).toBe(old.meta.notes);
  });

  it('separates the concerns: structure has no text, content has no hierarchy, layout and style are their own sections', () => {
    const { doc } = convert('bottom-navigation-custom');
    expect(doc.structure.role).toBe('navbar');
    expect(JSON.stringify(doc.structure)).not.toMatch(/Menu principale|Avvisi|Solo testo|svg|#|Nuovo/);
    expect(doc.structure.children!.map((c) => c.id)).toEqual(['home', 'Cerca', 'nuovo', 'avvisi', 'solo-testo']);
    // Tabs without an icon or without a label simply have no slot for it.
    expect(doc.structure.children!.find((c) => c.id === 'solo-testo')!.children!.map((c) => c.role)).toEqual(['label']);
    expect(doc.content.root).toEqual({ text: 'Menu principale' });
    expect(doc.content.avvisi).toEqual({ value: '/avvisi', disabled: true });
    expect(doc.layout).toMatchObject({ placement: 'docked', labels: 'active', radius: 18, widthMode: 'hug' });
    expect(doc.style).toMatchObject({ appearance: { foreground: '#223344', indicator: { style: 'none' } }, typography: { fontSize: 12.5 }, icon: { strokeWidth: 2.2 }, motion: { indicator: 'ease', duration: 220 } });
    expect(doc.style.items).toEqual({ home: { iconSize: 26, fontWeight: 700 } });
    expect(doc.states.focus?.style).toMatchObject({ color: '#ff6600' });
    expect(doc.states.pressed?.style).toMatchObject({ scale: 0.95 });
    expect(doc.interactions.events).toEqual({ change: 'menu-change', press: 'jello-press', reselect: 'jello-reselect' });
    expect(doc.interactions.behavior).toMatchObject({ semantics: 'tabs', defaultItem: 'Cerca', reselect: 'none' });
    // Breakpoint override keys are the canonical property names.
    const bp = (doc.responsive.breakpoints as { overrides: Record<string, unknown> }[])[0]!;
    expect(bp.overrides).toEqual({ 'layout.height': 56, 'layout.labels': 'hide' });
  });

  it('keeps a custom SVG icon byte for byte', () => {
    const old = raw('bottom-navigation-custom');
    const { doc } = convert('bottom-navigation-custom');
    const icon = doc.content['nuovo-icon']!.icon!;
    expect(icon).toEqual(old.root.children.find((t: any) => t.id === 'nuovo').icon);
    expect(icon.kind).toBe('svg');
  });

  it('produces a document that survives serialize → parse → serialize unchanged, and apply(view) is the identity', () => {
    for (const name of FIXTURES) {
      const { doc } = convert(name);
      const text = serializeDefinition(doc);
      const again = parseDefinitionText(text);
      expect(again.ok, name).toBe(true);
      if (!again.ok) continue;
      expect(again.warnings, name).toEqual([]);
      expect(serializeDefinition(again.doc)).toBe(text);
      expect(applyNavbarView(doc, navbarView(doc))).toEqual(doc);
    }
  });

  it('is reached through importComponent, which also accepts the canonical format as is', () => {
    const viaImport = importComponent(raw('bottom-navigation-template'));
    expect(viaImport.ok && viaImport.migratedFrom).toBeTruthy();
    const canonical = convert('bottom-navigation-template').doc;
    const again = importComponentText(serializeDefinition(canonical));
    expect(again.ok && again.migratedFrom).toBeNull();
    expect(again.ok && again.doc).toEqual(canonical);
  });

  it('the template becomes the official mobile-navbar: same tabs, no trace of the old type', () => {
    const { doc } = convert('bottom-navigation-template');
    expect(doc.meta.basedOn).toBe('mobile-navbar');
    // The type and the view are the new ones; the document keeps its own id (user data).
    expect(JSON.parse(serializeDefinition(doc)).type).toBe('mobile-navbar');
    expect(serializeDefinition(doc)).not.toMatch(/"(type|kind|basedOn)": "bottom-navigation"/);
    expect(navbarView(doc).children.map((t) => [t.id, t.label, t.icon])).toEqual([
      ['home', 'Home', { kind: 'builtin', name: 'home' }],
      ['explore', 'Explore', { kind: 'builtin', name: 'compass' }],
      ['profile', 'Profile', { kind: 'builtin', name: 'user' }],
    ]);
  });

  it('refuses what v1 never was, with a reason, and applies nothing', () => {
    const base = raw('bottom-navigation-template');
    const bad = (patch: (d: any) => void) => {
      const d = structuredClone(base);
      patch(d);
      const r = convertComponentV1(d);
      return r.ok ? [] : r.errors;
    };
    expect(bad((d) => (d.schemaVersion = 2))[0]).toMatch(/più recente/);
    expect(bad((d) => (d.type = 'carousel'))[0]).toMatch(/sconosciuto/);
    expect(bad((d) => (d.root.children = 'x'))[0]).toMatch(/root\.children/);
    expect(bad((d) => (d.root.layout.height = 9999)).join()).toMatch(/layout\.height: 9999 fuori intervallo/);
    expect(bad((d) => (d.root.children[1].id = 'home')).join()).toMatch(/duplicato/);
    expect(bad((d) => (d.material.document.family = 'solid')).join()).toMatch(/material/);
    expect(convertComponentV1({ format: 'other' }).ok).toBe(false);
  });
});

describe('legacy identifiers (isolated compatibility table)', () => {
  it('removed presets resolve to a generic replacement and keep their original parameters', () => {
    for (const id of ['cable', 'bt']) {
      const l = legacyPreset(id)!;
      expect(l.replacement).toMatch(/^(satin|navbar)$/);
      expect(l.name).not.toMatch(/cable|\bbt\b|darts/i);
      expect(Object.keys(l.params)).toHaveLength(24);
    }
    expect(legacyPreset('bt')!.params).toMatchObject({ profile: 'bump', band: 12, blur: 10 });
    expect(legacyPreset('cable')!.params).toMatchObject({ shape: 'rounded', radius: 28, blur: 30 });
    expect(legacyPreset('jello')).toBeUndefined();
    expect(legacyPreset(null)).toBeUndefined();
  });

  it('removed and renamed templates open the official one, and say whether to tell the user', () => {
    expect(legacyTemplate('bottom-navigation')).toEqual({ replacement: 'mobile-navbar', reason: 'renamed' });
    expect(legacyTemplate('bt-darts')).toEqual({ replacement: 'mobile-navbar', reason: 'removed' });
    expect(legacyTemplate('mobile-navbar')).toBeUndefined();
    expect(Object.keys(LEGACY_TEMPLATES).sort()).toEqual(['bottom-navigation', 'bt-darts']);
    expect(Object.keys(LEGACY_PRESETS).sort()).toEqual(['bt', 'cable']);
  });

  it('a component saved under a removed id still opens, keeping its id, name and material', () => {
    const { doc } = convert('bt-darts');
    expect(doc.id).toBe('bt-darts');
    expect(doc.name).toBe('BT Darts');
    expect(doc.meta.basedOn).toBe('mobile-navbar');
    expect(doc.material.preset).toBe('bt');
    expect(navbarView(doc).children.map((t) => t.id)).toEqual(['matrice', 'live', 'risultati']);
    expect(navbarView(doc).defaultTab).toBe('live');
  });
});

describe('type of the result', () => {
  it('is the canonical ComponentDefinition', () => {
    const doc: ComponentDefinition = convert('bottom-navigation-template').doc;
    expect(doc.schemaVersion).toBe(1);
  });
});

describe('legacy data through the places that read stored and imported data', () => {
  it('a component stored by the previous version reads back as a canonical definition (and is stored canonical when saved)', async () => {
    const { IDBFactory } = await import('fake-indexeddb');
    const { openRepository } = await import('../../src/lab/storage/repository');
    const factory = new IDBFactory();
    const repo = await openRepository(factory, 'jello-legacy-components');
    const iso = '2026-10-10T09:00:00.000Z';
    for (const name of FIXTURES) await repo.putComponent({ id: `cmp-${name}`, doc: raw(name) as never, createdAt: iso, updatedAt: iso });
    const read = await repo.listComponents();
    expect(read.skipped).toEqual([]);
    const byId = (id: string) => read.items.find((c) => c.id === id)!;
    expect(read.items.map((c) => [c.id, c.doc.type, c.doc.format]).sort()).toEqual(FIXTURES.map((n) => [`cmp-${n}`, 'mobile-navbar', 'jello-component-definition']).sort());
    const custom = byId('cmp-bottom-navigation-custom');
    expect(navbarView(custom.doc).children.map((t) => t.id)).toEqual(['home', 'Cerca', 'nuovo', 'avvisi', 'solo-testo']);
    // Saving what was read writes the canonical shape; reading that again changes nothing.
    await repo.putComponent({ ...custom, id: 'cmp-resaved' });
    const again = (await repo.listComponents()).items.find((c) => c.id === 'cmp-resaved')!;
    expect({ ...again.doc, id: custom.doc.id }).toEqual(custom.doc); // the record id is the document id in the library
    repo.close();
  });

  it('a stored component that is neither format is skipped with a reason, not lost silently', async () => {
    const { IDBFactory } = await import('fake-indexeddb');
    const { openRepository } = await import('../../src/lab/storage/repository');
    const repo = await openRepository(new IDBFactory(), 'jello-legacy-bad');
    const iso = '2026-10-10T09:00:00.000Z';
    await repo.putComponent({ id: 'cmp-bad', doc: { format: 'jello-component', schemaVersion: 1, type: 'carousel' } as never, createdAt: iso, updatedAt: iso });
    const r = await repo.listComponents();
    expect(r.items).toEqual([]);
    expect(r.skipped[0]).toMatch(/cmp-bad/);
    repo.close();
  });

  it('importing a file in the old format yields a canonical component; the new format passes through', async () => {
    const { inspectJsonText } = await import('../../src/project/importer');
    for (const name of FIXTURES) {
      const item = inspectJsonText(`${name}.json`, readFileSync(`tests/fixtures/legacy/${name}.component.json`, 'utf8'));
      expect(item.kind, name).toBe('component');
      if (item.kind !== 'component') continue;
      expect(item.doc.format).toBe('jello-component-definition');
      const again = inspectJsonText('x.json', serializeDefinition(item.doc));
      expect(again.kind === 'component' && again.doc).toEqual(item.doc);
    }
    expect(inspectJsonText('x.json', JSON.stringify({ format: 'jello-component', schemaVersion: 1, type: 'carousel' })).kind).toBe('rejected');
  });
});
