/**
 * The canonical component definition: the four types, the separation of
 * structure, content, layout, material, states and interactions, atomic
 * validation, serialization, the material resolution through the registry and
 * the compatibility between component types and material families.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFINITION_TYPES,
  definitionFields,
  definitionIcons,
  definitionType,
  materialCompatibility,
  parseDefinition,
  parseDefinitionText,
  resolveDefinitionMaterial,
  serializeDefinition,
  starterDefinition,
  type DefinitionType,
} from '../../src/components';
import { MATERIALS, NO_FLAGS, glassParams, resolveSolid, solidParams } from '../../src/model';

const TYPES: DefinitionType[] = ['button', 'mobile-navbar', 'desktop-navbar', 'input'];
const raw = (type: DefinitionType) => JSON.parse(serializeDefinition(starterDefinition(type))) as Record<string, any>;
const errorsOf = (input: unknown) => {
  const r = parseDefinition(input);
  return r.ok ? [] : r.errors;
};

describe('definition types', () => {
  it('declares the four types; only the mobile navbar has a renderer and an editor so far', () => {
    expect(DEFINITION_TYPES.map((t) => t.type)).toEqual(TYPES);
    expect(DEFINITION_TYPES.filter((t) => t.implemented).map((t) => t.type)).toEqual(['button', 'mobile-navbar']);
    for (const t of DEFINITION_TYPES) {
      expect(t.states[0], t.type).toBe('default');
      expect(t.triggers.length, t.type).toBeGreaterThan(0);
      expect(t.root.slots.length, t.type).toBeGreaterThan(0);
    }
    expect(definitionType('mobile-navbar')?.legacyType).toBe('bottom-navigation');
    expect(definitionType('carousel')).toBeUndefined();
  });

  it('property descriptors include the prepared desktop contract without advertising a renderer', () => {
    const fields = definitionFields('mobile-navbar');
    expect(fields.length).toBeGreaterThan(30);
    expect(fields.map((f) => f.path)).toEqual(expect.arrayContaining(['layout.height', 'style.typography.fontSize', 'states.focus.style.color', 'interactions.behavior.reselect', 'interactions.events.change', 'responsive.minTabWidth']));
    expect(fields.every((f) => !/^(appearance|typography|icon|motion)\./.test(f.path))).toBe(true);
    expect(definitionFields('button').map((f) => f.path)).toEqual(expect.arrayContaining(['layout.size', 'style.variant', 'states.hover.style.background', 'interactions.behavior.semantics', 'interactions.events.press']));
    expect(definitionFields('desktop-navbar').map((f) => f.path)).toContain('layout.orientation');
    expect(definitionFields('input')).toEqual([]);
  });
});

describe('starter definitions', () => {
  it.each(TYPES)('%s: a valid definition that survives serialize → parse without loss', (type) => {
    const doc = starterDefinition(type);
    const text = serializeDefinition(doc);
    const r = parseDefinitionText(text);
    expect(r.ok, r.ok ? '' : r.errors.join()).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.doc).toEqual(doc);
    expect(serializeDefinition(r.doc)).toBe(text);
  });

  it('the JSON separates the concerns under their own keys, in a stable order', () => {
    const json = raw('mobile-navbar');
    expect(Object.keys(json)).toEqual(['format', 'schemaVersion', 'type', 'typeVersion', 'id', 'name', 'runtime', 'structure', 'content', 'layout', 'responsive', 'style', 'material', 'states', 'interactions', 'meta']);
    // Structure carries no text, icon or style; content carries no hierarchy; material carries no content.
    expect(JSON.stringify(json.structure)).not.toMatch(/"text"|"icon":|fill|"value"|height/);
    expect(JSON.stringify(json.structure)).toContain('"role":"item"');
    expect(Object.values(json.content).every((c: any) => !('children' in c) && !('role' in c))).toBe(true);
    expect(Object.keys(json.material)).toEqual(['family', 'preset', 'revision', 'params']);
    expect(JSON.stringify(json.material)).not.toMatch(/Home|label/);
    expect(Object.keys(json.interactions)).toEqual(['behavior', 'events']);
    expect(JSON.stringify(json.layout)).not.toMatch(/Home|foreground|#/);
  });

  it('carries no callbacks: interactions are event names', () => {
    for (const type of TYPES) {
      const doc = starterDefinition(type);
      expect(serializeDefinition(doc)).not.toMatch(/function|=>|onclick/i);
      for (const name of Object.values(doc.interactions.events)) expect(name).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it('the schema module is pure data: no DOM, no renderer', () => {
    for (const f of ['src/components/definition.ts', 'src/components/navbar.ts', 'src/components/templates.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/\b(document|window)\.[a-z]|HTMLElement|createElement|from '\.\.\/(runtime|stage|lab|migration)/);
    }
  });
});

describe('structure', () => {
  it('enforces the slots of each type: roles, counts and nesting', () => {
    const j = raw('button');
    j.structure.children.push({ id: 'second', role: 'label' });
    j.content.second = { text: 'Due' };
    expect(errorsOf(j)).toEqual(['structure: «label» ammesso da 1 a 1, trovati 2']);

    const nav = raw('mobile-navbar');
    nav.structure.children = [];
    // A broken structure is reported once: content and properties that refer to its ids are not checked against it.
    expect(errorsOf(nav)).toEqual(['structure: «item» ammesso da 1 a 200, trovati 0']);

    const wrong = raw('input');
    wrong.structure.children.push({ id: 'oops', role: 'item' });
    expect(errorsOf(wrong)[0]).toMatch(/un nodo «item» non è ammesso dentro «field»/);

    const root = raw('button');
    root.structure.role = 'navbar';
    expect(errorsOf(root).join()).toMatch(/structure\.role: atteso «button», trovato «navbar»/);

    const named = raw('button');
    named.structure.id = 'main';
    expect(errorsOf(named)).toEqual(['structure.id: la radice si chiama «root»']);
  });

  it('desktop items require a label or explicit accessible name; legacy mobile icon-only entries remain valid', () => {
    const d = raw('desktop-navbar');
    d.structure.children[1].children = [];
    expect(errorsOf(d)).toEqual(['content.docs.accessibleLabel: richiesto senza etichetta']);
    d.content.docs.accessibleLabel = 'Documentazione';
    expect(errorsOf(d)).toEqual([]);
    const m = raw('mobile-navbar');
    m.structure.children[0].children = [{ id: 'home-icon', role: 'icon' }];
    delete m.content['home-label'];
    expect(errorsOf(m)).toEqual([]);
  });

  it('rejects duplicate ids, bad ids, unknown roles and non-objects', () => {
    const j = raw('mobile-navbar');
    j.structure.children[1].id = 'home';
    expect(errorsOf(j)).toEqual(['structure.children[1].id: «home» è duplicato']);
    const k = raw('button');
    k.structure.children[0].id = 'Bad Id';
    expect(errorsOf(k)[0]).toMatch(/atteso un identificatore/);
    const r = raw('button');
    r.structure.children[0].role = 'wizard';
    expect(errorsOf(r)).toEqual(['structure: un nodo «wizard» non è ammesso dentro «button» (ammessi: label, icon)']);
    const u = raw('button');
    u.structure.role = 'wizard';
    expect(errorsOf(u)).toEqual(['structure.role: ruolo sconosciuto']);
    const n = raw('button');
    n.structure = 3;
    expect(errorsOf(n)).toEqual(['structure: atteso un oggetto']);
  });
});

describe('content', () => {
  it('requires what each role needs and refuses what it cannot carry', () => {
    const a = raw('button');
    delete a.content.label;
    expect(errorsOf(a)).toEqual(['content.label: «label» richiede text']);
    const b = raw('button');
    b.content.label = { text: 'Ok', href: '/x' };
    expect(errorsOf(b)).toEqual(['content.label.href: non ammesso per un nodo «label»']);
    const c = raw('desktop-navbar');
    delete c.content.signin.value;
    expect(errorsOf(c).join()).toMatch(/content\.signin\.value: richiesto per un nodo «action»/);
    const d = raw('button');
    d.content.root = { text: 'no' };
    expect(errorsOf(d)).toEqual(['content.root.text: non ammesso per un nodo «button»']);
    const e = raw('mobile-navbar');
    delete e.content.root;
    expect(errorsOf(e)).toEqual(['content.root: «navbar» richiede text']);
  });

  it('validates text, values, links, input types and icons', () => {
    const j = raw('desktop-navbar');
    j.content['brand-label'].text = '';
    j.content.docs.href = 'javascript:alert(1)';
    j.content.docs.value = 'x'.repeat(201);
    expect(errorsOf(j)).toEqual([
      'content.brand-label.text: atteso un testo di 1–120 caratteri',
      'content.docs.value: atteso un testo di al più 200 caratteri',
      "content.docs.href: atteso un percorso (/…), un'ancora (#…) o un URL http(s)",
    ]);
    const i = raw('input');
    i.content.control.inputType = 'color';
    i.content.leading.icon = { kind: 'svg', name: 'x', viewBox: '0 0 1 1', body: '<script/>', paint: 'fill' };
    const errs = errorsOf(i);
    expect(errs.join('\n')).toMatch(/content\.leading\.icon: SVG/);
    expect(errs.join('\n')).toMatch(/content\.control\.inputType: atteso uno tra text, email/);
    const unknown = raw('input');
    unknown.content.leading.icon = { kind: 'builtin', name: 'nope' };
    const r = parseDefinition(unknown);
    expect(r.ok && r.warnings).toEqual(['content.leading.icon: icona "nope" sconosciuta a questo runtime, uso «star»']);
    expect(r.ok && r.doc.content.leading).toEqual({ icon: { kind: 'builtin', name: 'star' } });
  });

  it('an item value is free text (a route, a key) and need not be unique: the item id is its identity', () => {
    const j = raw('mobile-navbar');
    j.content.home.value = '/';
    j.content.search.value = '/';
    j.content.profile.disabled = true;
    const r = parseDefinition(j);
    expect(r.ok && r.doc.content.home).toEqual({ value: '/' });
    expect(r.ok && r.doc.content.profile).toEqual({ value: 'profile', disabled: true });
  });

  it('stray content is reported, not kept', () => {
    const k = raw('button');
    k.content.ghost = { text: 'x' };
    const r = parseDefinition(k);
    expect(r.ok && r.warnings).toEqual(['content.ghost: nessun nodo con questo id, ignorato']);
    expect(r.ok && 'ghost' in r.doc.content).toBe(false);
  });

  it('lists the icons a definition uses with the text next to them', () => {
    expect(definitionIcons(starterDefinition('mobile-navbar')).map((i) => [i.node, i.owner, i.icon.kind === 'builtin' && i.icon.name])).toEqual([
      ['home-icon', 'Home', 'home'],
      ['search-icon', 'Cerca', 'search'],
      ['profile-icon', 'Profilo', 'user'],
    ]);
    expect(definitionIcons(starterDefinition('input'))).toHaveLength(1);
  });
});

describe('material, states and interactions', () => {
  it('validates the material through the registry: family, preset and parameters of that family', () => {
    const a = raw('button');
    a.material = { family: 'metal', preset: null, params: {} };
    expect(errorsOf(a)).toEqual(['material.family: «metal» non è un materiale disponibile (disponibili: glass, solid)']);
    const b = raw('button');
    b.material = { family: 'solid', preset: 'navbar', params: {} };
    expect(errorsOf(b)).toEqual(['material.preset: «navbar» non è un preset di Solid']);
    const c = raw('button');
    c.material = { family: 'solid', preset: null, params: { elevation: 9 } };
    expect(errorsOf(c)).toEqual(['material.params.elevation: 9 fuori intervallo [0, 5]']);
    const d = raw('button');
    d.material = { family: 'glass', preset: 'navbar', params: { blur: 12, band: 20 } };
    expect(parseDefinition(d)).toMatchObject({ ok: true, warnings: [] });
    const e = raw('button');
    e.material = { family: 'solid', preset: null, params: { band: 4 } };
    const r = parseDefinition(e);
    expect(r.ok && r.warnings).toEqual(['material.params.band: parametro sconosciuto, ignorato']);
  });

  it('an embedded document may come from a personal preset; its family must match', () => {
    const doc = JSON.parse(JSON.stringify(MATERIALS.get('solid')!.presets[1]!.doc));
    const j = raw('button');
    j.material = { family: 'solid', preset: 'user-1', revision: 'a1b2c3d4', params: {}, document: doc };
    const r = parseDefinition(j);
    expect(r.ok && r.doc.material.document?.id).toBe('solid-dark');
    expect(r.ok && r.doc.material.revision).toBe('a1b2c3d4');
    j.material.family = 'glass';
    expect(errorsOf(j).join()).toMatch(/material\.family: "glass" non corrisponde al documento \(solid\)/);
    j.material = { family: 'solid', preset: 'x', revision: 'zz', params: {} };
    expect(errorsOf(j).join('\n')).toMatch(/material\.preset: «x» non è un preset di Solid/);
    expect(errorsOf(j).join('\n')).toMatch(/material\.revision/);
  });

  it('states must exist in the component type; material overrides also in the material', () => {
    const a = raw('button');
    a.states = { active: { material: { fill: '#000000' } } };
    expect(errorsOf(a)).toEqual(['states.active: il tipo «button» non ha lo stato «active» (ha: default, hover, pressed, focus, disabled)']);
    const b = raw('mobile-navbar');
    b.material = { family: 'glass', preset: null, params: {} };
    b.states.active = { ...b.states.active, material: { fill: '#000000' } };
    expect(errorsOf(b)).toEqual(['states.active.material: il materiale Glass non rende lo stato «active»']);
    const c = raw('mobile-navbar');
    c.states.active = { ...c.states.active, material: { fill: '#000000', scale: 3 } };
    c.states.default = {};
    expect(errorsOf(c)).toEqual(['states.active.material.scale: 3 fuori intervallo [0.9, 1.1]', 'states.default: lo stato iniziale è il materiale (usa material.params)']);
    const d = raw('button');
    d.states = { hover: { material: { fill: '#112233' }, style: { anything: 1 } }, bogus: {} };
    expect(errorsOf(d)).toEqual(['states.bogus: il tipo «button» non ha lo stato «bogus» (ha: default, hover, pressed, focus, disabled)']);
  });

  it('events name a trigger of the type and a DOM event', () => {
    const j = raw('desktop-navbar');
    j.interactions.events = { change: 'x', press: 'Bad Name', hover: 'ok-name' };
    expect(errorsOf(j)).toEqual(['interactions.events.press: testo non valido']);
    const k = raw('mobile-navbar');
    k.interactions.events.change = 'x'.repeat(41);
    expect(errorsOf(k)[0]).toMatch(/interactions\.events\.change/);
    const l = raw('input');
    l.layout = { height: 40 };
    const r = parseDefinition(l);
    expect(r.ok && r.warnings).toEqual(['layout: «Input» non ha ancora proprietà di layout, ignorato']);
    expect(r.ok && r.doc.layout).toEqual({});
  });

  it('resolves the material through the registry: base, then parameters, then state overrides', () => {
    const doc = starterDefinition('mobile-navbar');
    doc.material = { family: 'solid', preset: 'solid-dark', revision: null, params: { elevation: 4 } };
    doc.states = { ...doc.states, active: { ...doc.states.active, material: { fill: '#2563eb', foreground: '#ffffff' } } };
    const m = resolveDefinitionMaterial(doc);
    expect(m.family).toBe('solid');
    if (m.family !== 'solid') return;
    expect(m.material.fill).toBe('#1d2433');
    expect(solidParams(m).elevation).toBe(4);
    expect(resolveSolid(m, { ...NO_FLAGS, active: true })).toMatchObject({ fill: '#2563eb', foreground: '#ffffff' });
    expect(m.states.hover.fill).toBe('#262f42');

    const g = starterDefinition('button');
    g.material = { family: 'glass', preset: 'navbar', revision: null, params: { blur: 12 } };
    const gm = resolveDefinitionMaterial(g);
    expect(gm.family === 'glass' && glassParams(gm).blur).toBe(12);
    expect(gm.family === 'glass' && glassParams(gm).band).toBe(16);

    const bare = starterDefinition('button');
    bare.material = { family: 'solid', preset: null, revision: null, params: {} };
    expect(resolveDefinitionMaterial(bare).family).toBe('solid');
    bare.material.preset = 'gone';
    expect(() => resolveDefinitionMaterial(bare)).toThrow(/Preset non trovato/);
  });

  it('an embedded document wins over the preset, and is returned as it is when nothing is applied on top', () => {
    const doc = starterDefinition('button');
    const embedded = MATERIALS.get('solid')!.presets[2]!.doc;
    doc.material = { family: 'solid', preset: 'solid-neutral', revision: null, params: {}, document: embedded };
    expect(resolveDefinitionMaterial(doc)).toBe(embedded);
    doc.material.params = { radius: 30 };
    const changed = resolveDefinitionMaterial(doc);
    expect(changed).not.toBe(embedded);
    expect(changed.family === 'solid' && changed.geometry.radius).toBe(30);
    expect(changed.family === 'solid' && changed.material.fill).toBe('#2563eb');
  });
});

describe('compatibility between component types and material families', () => {
  it('every type works with every registered material; what the material does not render, the component style does', () => {
    for (const type of TYPES) {
      for (const family of MATERIALS.list().map((d) => d.id)) {
        const c = materialCompatibility(type, family)!;
        expect(c.compatible, `${type}/${family}`).toBe(true);
        const states = definitionType(type)!.states.filter((s) => s !== 'default');
        expect([...c.rendered, ...c.byComponent].sort(), `${type}/${family}`).toEqual([...states].sort());
        expect(c.rendered.filter((s) => c.byComponent.includes(s))).toEqual([]);
      }
    }
  });

  it('is specific: Solid renders hover, pressed, active and disabled itself; Glass only the press feedback', () => {
    expect(materialCompatibility('mobile-navbar', 'solid')).toMatchObject({ rendered: ['hover', 'pressed', 'active', 'disabled'], byComponent: ['focus'] });
    expect(materialCompatibility('mobile-navbar', 'glass')).toMatchObject({ rendered: ['pressed'], byComponent: ['hover', 'active', 'focus', 'disabled'] });
    expect(materialCompatibility('button', 'solid')?.rendered).toEqual(['hover', 'pressed', 'disabled']);
    expect(materialCompatibility('input', 'glass')?.byComponent).toEqual(['hover', 'focus', 'disabled']);
    expect(materialCompatibility('input', 'solid')?.notes[0]).toMatch(/Solid non rende «focus»/);
    expect(materialCompatibility('button', 'jelly')).toBeNull();
    expect(materialCompatibility('carousel' as never, 'solid')).toBeNull();
  });

  it('a material override for a state the material does not render is refused by the parser', () => {
    const j = raw('input');
    j.material = { family: 'glass', preset: null, params: {} };
    j.states.hover = { material: { fill: '#000000' } };
    expect(errorsOf(j)).toEqual(['states.hover.material: il materiale Glass non rende lo stato «hover»']);
    j.material.family = 'solid';
    expect(parseDefinition(j).ok).toBe(true);
  });
});

describe('envelope and versions', () => {
  it('is atomic: every error from every section is reported together', () => {
    const j = raw('input');
    delete j.content.control.value;
    j.material.params = { fill: 'red' };
    j.interactions.events = { change: 'Bad' };
    j.runtime.min = '9.0.0';
    expect(errorsOf(j)).toHaveLength(4);
  });

  it('refuses newer schema and type versions, unknown types and other formats with a reason', () => {
    const j = raw('button');
    expect(errorsOf({ ...j, schemaVersion: 2 })[0]).toMatch(/schemaVersion 2.*più recente/);
    expect(errorsOf({ ...j, typeVersion: 2 })[0]).toMatch(/typeVersion 2.*più recente/);
    expect(errorsOf({ ...j, type: 'carousel' })[0]).toMatch(/type: «carousel» sconosciuto/);
    expect(errorsOf({ ...j, format: 'jello-component' })[0]).toMatch(/format: atteso "jello-component-definition"/);
    expect(errorsOf([])[0]).toMatch(/oggetto JSON/);
    expect(parseDefinitionText('{nope')).toMatchObject({ ok: false });
  });

  it('reports unknown top-level fields and drops stray node fields', () => {
    const j = raw('button');
    j.zzz = 1;
    j.structure.children[0].style = { color: 'red' };
    const r = parseDefinition(j);
    expect(r.ok && r.warnings).toEqual(['zzz: campo sconosciuto, ignorato']);
    expect(r.ok && JSON.stringify(r.doc.structure)).not.toContain('style');
  });

  it('starters accept a custom id and name', () => {
    for (const t of TYPES) {
      const doc = starterDefinition(t, { id: `x-${t}`, name: `X ${t}` });
      expect(doc.id).toBe(`x-${t}`);
      expect(parseDefinition(JSON.parse(serializeDefinition(doc))).ok).toBe(true);
    }
  });
});
