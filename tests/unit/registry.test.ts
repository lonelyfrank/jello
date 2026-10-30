/**
 * Material registry: registration and retrieval, definition consistency,
 * parameter validation through the descriptors, the Jelly contract, and
 * compatibility of everything Glass exposed before Solid.
 */
import { describe, expect, it } from 'vitest';
import { PARAMS, PARAM_INDEX, defaultParams, parseNumberInput, serializeParams } from '../../src/core/params';
import { checkKeys, defaultsOf, type Descriptor } from '../../src/core/descriptors';
import { PRESETS } from '../../src/core/presets';
import {
  BUILTIN_MATERIALS,
  FAMILIES,
  FAMILY_MIN_RUNTIME,
  MATERIALS,
  MaterialRegistry,
  RUNTIME_VERSION,
  controlGroups,
  createGlassDocument,
  createSolidDocument,
  glassParams,
  materialDefinition,
  onlyGlass,
  parseGlassMaterial,
  parseMaterial,
  parseMaterialText,
  serializeMaterial,
  validateDefinition,
  type MaterialDefinition,
} from '../../src/model';
import { materialRuntime } from '../../src/runtime/materials';

const glass = () => materialDefinition('glass')!;
const solid = () => materialDefinition('solid')!;
/** A definition for a family that is not registered anywhere: a fresh registry takes it. */
const clone = (over: Partial<MaterialDefinition> = {}): MaterialDefinition => ({ ...solid(), ...over });

describe('registration and retrieval', () => {
  it('lists Glass and Solid, by id, in registration order', () => {
    expect(MATERIALS.list().map((d) => d.id)).toEqual(['glass', 'solid']);
    expect(MATERIALS.get('solid')).toBe(solid());
    expect(MATERIALS.has('glass')).toBe(true);
    expect(MATERIALS.get('metal')).toBeUndefined();
    expect(MATERIALS.has('jelly')).toBe(false);
  });

  it('finds a built-in preset of any family', () => {
    expect(MATERIALS.preset('navbar')?.doc.family).toBe('glass');
    expect(MATERIALS.preset('solid-dark')?.doc.family).toBe('solid');
    expect(MATERIALS.preset('nope')).toBeUndefined();
  });

  it('refuses duplicates, planned families and unknown families', () => {
    const r = new MaterialRegistry();
    r.register(solid());
    expect(() => r.register(solid())).toThrow(/già registrato/);
    expect(() => r.register(clone({ id: 'jelly' }))).toThrow(/non è disponibile/);
    expect(() => r.register(clone({ id: 'metal' as never }))).toThrow(/non è disponibile/);
  });

  it('every definition declares identity, schema, presets, features, states, interactions and a renderer', () => {
    for (const d of MATERIALS.list()) {
      expect(d.name.length, d.id).toBeGreaterThan(0);
      expect(d.document, d.id).toEqual({ format: 'jello-material', schemaVersion: 2 });
      expect(d.presets.length, d.id).toBeGreaterThan(0);
      expect(d.features.length, d.id).toBeGreaterThan(0);
      expect(d.states[0], d.id).toBe('default');
      expect(d.interactions.length, d.id).toBeGreaterThan(0);
      expect(d.renderer.id, d.id).toBeTruthy();
      expect(d.export.minRuntime, d.id).toBe(FAMILY_MIN_RUNTIME[d.id as 'glass' | 'solid']);
    }
  });

  it('Solid declares its capabilities, states and interactions', () => {
    const s = solid();
    expect(s.features).toEqual(expect.arrayContaining(['border', 'shadow', 'elevation', 'states', 'transitions']));
    expect(s.features).not.toContain('refraction');
    expect(s.features).not.toContain('backdrop');
    expect(s.states).toEqual(['default', 'hover', 'pressed', 'active', 'disabled']);
    expect(s.interactions).toEqual(['hover', 'press']);
    expect(s.capabilities.backends).toEqual([]);
    expect(s.fallbacks).toEqual([]);
    expect(s.renderer.requires).toEqual([]);
  });
});

describe('definition consistency', () => {
  it('the registered definitions are consistent', () => {
    for (const d of MATERIALS.list()) expect(validateDefinition(d), d.id).toEqual([]);
  });

  it('reports a missing group, a bad default, an unsupported interaction and a foreign preset', () => {
    const bad = clone({
      groups: [{ id: 'surface', label: 'Superficie' }],
      interactions: ['drag'],
      presets: [...glass().presets],
      params: solid().params.map((d) => (d.key === 'finish' ? ({ ...d, default: 'nope' } as Descriptor) : d)),
    });
    const problems = validateDefinition(bad).join(' | ');
    expect(problems).toMatch(/gruppo «.*» non dichiarato/);
    expect(problems).toMatch(/valore iniziale non valido/);
    expect(problems).toMatch(/interazione «drag» richiede la capacità «drag»/);
    expect(problems).toMatch(/famiglia glass, atteso solid/);
  });

  it('register() refuses an inconsistent definition with every reason', () => {
    expect(() => new MaterialRegistry().register(clone({ states: ['pressed'] }))).toThrow(/primo stato deve essere «default»/);
    expect(() => new MaterialRegistry().register(clone({ renderer: { id: '', requires: [] } }))).toThrow(/renderer non dichiarato/);
  });

  it('every registered definition has a runtime with the same renderer id, and the other way round', () => {
    for (const d of MATERIALS.list()) expect(materialRuntime(d.id)?.renderer, d.id).toBe(d.renderer.id);
    for (const f of FAMILIES.filter((f) => f.status === 'planned')) expect(materialRuntime(f.id), f.id).toBeUndefined();
  });

  it('editor control groups come from the descriptors and cover every parameter once', () => {
    for (const d of MATERIALS.list()) {
      const groups = controlGroups(d);
      expect(groups.flatMap((g) => g.keys).sort(), d.id).toEqual(d.params.map((p) => p.key).sort());
    }
    expect(controlGroups(solid()).map((g) => g.id)).toEqual(['surface', 'border', 'elevation', 'shape', 'motion']);
  });
});

describe('parameter validation', () => {
  it('shares one policy across families: error for a bad value (in table order), default for a missing key, warning for an unknown one', () => {
    for (const d of MATERIALS.list()) {
      const ok = MATERIALS.validateParams(d.id, d.defaults());
      expect(ok.errors, d.id).toEqual([]);
      expect(ok.warnings, d.id).toEqual([]);
      const partial = d.validateParams({ nope: 1 });
      expect(partial.errors, d.id).toEqual([]);
      expect(partial.warnings.some((w) => w.includes('nope'))).toBe(true);
      expect(partial.warnings.some((w) => w.includes('assente'))).toBe(true);
      expect(Object.keys(partial.values).sort(), d.id).toEqual(d.params.map((p) => p.key).sort());
    }
    expect(MATERIALS.validateParams('solid', { elevation: 9, fill: 'red', easing: 'bounce', borderWidth: '1' }).errors).toEqual([
      'params.fill: atteso un colore #rrggbb',
      'params.borderWidth: atteso un numero',
      'params.elevation: 9 fuori intervallo [0, 5]',
      'params.easing: atteso uno tra standard, emphasized, linear',
    ]);
    expect(MATERIALS.validateParams('metal', {}).errors[0]).toMatch(/non è un materiale registrato/);
  });

  it('partial validation reports only what is given and normalises colors', () => {
    const r = solid().validateParams({ fill: '#ABCDEF' }, { partial: true, scope: 'material.params' });
    expect(r).toEqual({ values: { fill: '#abcdef' }, errors: [], warnings: [] });
  });

  it('the generic helpers behave as the Glass ones did', () => {
    expect(defaultsOf(PARAMS)).toEqual(defaultParams());
    expect(checkKeys(PARAMS, { band: 500 }, { scope: 'x', partial: true }).errors).toEqual(['x.band: 500 fuori intervallo [2, 80]']);
    expect(parseNumberInput(PARAM_INDEX.refraction as never, '12,5')).toEqual({ ok: true, value: 12.5 });
    expect(checkKeys(PARAMS, 3, { scope: 'material' }).errors).toEqual(['material: atteso un oggetto']);
  });
});

describe('serialization across families', () => {
  it('parseMaterial dispatches by family and round-trips byte for byte', () => {
    for (const d of MATERIALS.list()) {
      for (const p of d.presets) {
        const text = serializeMaterial(p.doc);
        const r = parseMaterialText(text);
        expect(r.ok, p.doc.id).toBe(true);
        if (!r.ok) continue;
        expect(r.doc.family).toBe(d.id);
        expect(r.warnings, p.doc.id).toEqual([]);
        expect(r.doc).toEqual(p.doc);
        expect(serializeMaterial(r.doc)).toBe(text);
      }
    }
  });

  it('Glass-only code gets a reason, not a half-applied Solid document', () => {
    const text = serializeMaterial(createSolidDocument({ id: 'x', name: 'X' }));
    expect(parseMaterial(JSON.parse(text)).ok).toBe(true);
    const r = parseGlassMaterial(JSON.parse(text));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Solid.*solo Glass/);
    expect(onlyGlass(parseMaterial(JSON.parse(serializeMaterial(createGlassDocument({ id: 'g', name: 'G' }))))).ok).toBe(true);
  });

  it('a family never accepts the other family’s document', () => {
    const g = JSON.parse(serializeMaterial(createGlassDocument({ id: 'g', name: 'G' })));
    const s = JSON.parse(serializeMaterial(createSolidDocument({ id: 's', name: 'S' })));
    expect(solid().parse(g).ok).toBe(false);
    expect(glass().parse(s).ok).toBe(false);
    expect(solid().parse(s).ok).toBe(true);
  });
});

describe('Jelly: the contract, nothing more', () => {
  it('is planned: listed, not registered, not parseable, not renderable', () => {
    const jelly = FAMILIES.find((f) => f.id === 'jelly')!;
    expect(jelly).toMatchObject({ status: 'planned', editor: false, version: 0 });
    expect(jelly.planned).toEqual(['physics', 'deformation', 'bubbles']);
    expect(MATERIALS.get('jelly')).toBeUndefined();
    const base = JSON.parse(serializeMaterial(createGlassDocument({ id: 'j', name: 'J' })));
    const r = parseMaterialText(JSON.stringify({ ...base, family: 'jelly' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/Jelly.*non è ancora disponibile/);
    expect(materialRuntime('jelly')).toBeUndefined();
  });

  it('no available family claims the reserved features', () => {
    for (const d of MATERIALS.list()) for (const f of ['physics', 'deformation', 'bubbles'] as const) expect(d.features, d.id).not.toContain(f);
  });
});

describe('Glass compatibility', () => {
  it('keeps the 24 parameters, the presets and their order', () => {
    expect(PARAMS).toHaveLength(24);
    expect(glass().params).toBe(PARAMS);
    expect(PRESETS.map((p) => p.id)).toEqual(['jello', 'optics', 'satin', 'deep', 'navbar']);
    expect(BUILTIN_MATERIALS.map((b) => b.doc.id)).toEqual(PRESETS.map((p) => p.id));
    expect(glass().defaults()).toEqual(defaultParams());
  });

  it('Glass documents still declare runtime 0.2.0, so files written before Solid are byte-identical', () => {
    expect(RUNTIME_VERSION).toBe('0.3.0');
    for (const b of BUILTIN_MATERIALS) expect(b.doc.runtime.min).toBe('0.2.0');
    expect(createGlassDocument({ id: 'a', name: 'A' }).runtime.min).toBe('0.2.0');
    expect(createSolidDocument({ id: 'a', name: 'A' }).runtime.min).toBe('0.3.0');
  });

  it('a v1 file and a v2 Glass file still open through the shared parser', () => {
    const v1 = parseMaterialText(serializeParams(defaultParams()));
    expect(v1.ok && v1.doc.family === 'glass' && v1.migratedFrom).toBe('jello-glass@1');
    const v2 = parseGlassMaterial(JSON.parse(serializeMaterial(BUILTIN_MATERIALS[4]!.doc)));
    expect(v2.ok && glassParams(v2.doc)).toEqual(PRESETS[4]!.params);
  });

  it('Glass states and interactions: pressed feedback and drag, no per-state values', () => {
    expect(glass().states).toEqual(['default', 'pressed']);
    expect(glass().interactions).toEqual(['press', 'drag']);
    expect(glass().stateParams).toEqual([]);
    expect(glass().features).toEqual(expect.arrayContaining(['backdrop', 'refraction']));
  });
});

describe('the public runtime API still exposes Glass', () => {
  it('exports the Glass entry points and the new Solid ones', async () => {
    const rt = await import('../../src/runtime');
    for (const name of ['createGlassGroup', 'GlassGroup', 'GlassContext', 'createMaterialGroup', 'createBottomNavigation', 'bindPress', 'bindDrag', 'engineParams']) {
      expect(typeof (rt as Record<string, unknown>)[name], name).toBe('function');
    }
    for (const name of ['createSolidGroup', 'SolidGroup', 'SolidSurface', 'resolveSolid', 'parseDefinition']) {
      expect(typeof (rt as Record<string, unknown>)[name], name).toBe('function');
    }
  });
});
