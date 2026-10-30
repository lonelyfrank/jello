import { describe, expect, it } from 'vitest';
import { PARAMS, defaultParams, serializeParams, type GlassParams } from '../../src/core/params';
import { PRESETS } from '../../src/core/presets';
import {
  BUILTIN_MATERIALS,
  SCHEMA_VERSION,
  SECTION_KEYS,
  compareVersions,
  createGlassDocument,
  glassParams,
  parseGlassMaterial,
  parseGlassMaterialText,
  resolveQuality,
  sectionOf,
  serializeMaterial,
  supportOf,
  supportReport,
  toLegacyV1,
  withGlassParams,
} from '../../src/model';

const custom: GlassParams = {
  ...defaultParams(),
  shape: 'rounded',
  radius: 18,
  width: 300,
  band: 33,
  refraction: -12.5,
  profile: 'bump',
  dome: 0.4,
  chroma: 0.25,
  blur: 7.5,
  tint: '#123abc',
  stiffness: 600,
  pressLight: 0.9,
};

describe('sections', () => {
  it('assigns every parameter to exactly one section', () => {
    const all = [...SECTION_KEYS.material, ...SECTION_KEYS.geometry, ...SECTION_KEYS.behavior];
    expect(all.sort()).toEqual(PARAMS.map((d) => d.key).sort());
    expect(sectionOf('width')).toBe('geometry');
    expect(sectionOf('refraction')).toBe('material');
    expect(sectionOf('pressScale')).toBe('behavior');
  });

  it('splits and joins without loss', () => {
    const doc = createGlassDocument({ id: 'x', name: 'X', params: custom });
    expect(glassParams(doc)).toEqual(custom);
    expect(doc.geometry).toEqual({ shape: 'rounded', width: 300, height: 104, radius: 18 });
    expect('refraction' in doc.geometry).toBe(false);
  });
});

describe('jello-glass v1 migration', () => {
  it('keeps every parameter of every preset and of a custom file', () => {
    for (const params of [...PRESETS.map((p) => p.params), custom]) {
      const r = parseGlassMaterialText(serializeParams(params));
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.migratedFrom).toBe('jello-glass@1');
      expect(r.warnings).toEqual([]);
      expect(glassParams(r.doc)).toEqual(params);
      expect(r.doc.schemaVersion).toBe(SCHEMA_VERSION);
    }
  });

  it('round-trips v1 → v2 → v1 to the same parameters and reports what v1 cannot hold', () => {
    const v1 = serializeParams(custom);
    const r = parseGlassMaterialText(v1);
    if (!r.ok) throw new Error(r.errors.join());
    const back = toLegacyV1(r.doc);
    expect(JSON.parse(back.text)).toEqual(JSON.parse(v1));
    expect(back.dropped.some((d) => d.startsWith('id'))).toBe(true);
    const richer = { ...r.doc, quality: { ...r.doc.quality, profile: 'economy' as const }, target: { backend: 'webgl2' as const, fallback: 'opaque' as const } };
    const dropped = toLegacyV1(richer).dropped.join(' | ');
    expect(dropped).toContain('quality (economy)');
    expect(dropped).toContain('target (webgl2, fallback opaque)');
  });

  it('derives a stable id from the content', () => {
    const a = parseGlassMaterialText(serializeParams(custom));
    const b = parseGlassMaterialText(serializeParams(custom));
    expect(a.ok && b.ok && a.doc.id === b.doc.id).toBe(true);
  });

  it('fills missing v1 keys with defaults and reports them', () => {
    const r = parseGlassMaterial({ format: 'jello-glass', version: 1, params: { refraction: 30, nope: 1 } });
    if (!r.ok) throw new Error(r.errors.join());
    expect(glassParams(r.doc).refraction).toBe(30);
    expect(r.warnings.some((w) => w.includes('nope'))).toBe(true);
    expect(r.warnings.some((w) => w.startsWith('blur'))).toBe(true);
  });
});

describe('jello-material v2', () => {
  const doc = createGlassDocument({ id: 'nav-1', name: 'Navbar', params: custom, target: { backend: 'svg' } });

  it('round-trips through JSON unchanged', () => {
    const r = parseGlassMaterialText(serializeMaterial(doc));
    if (!r.ok) throw new Error(r.errors.join());
    expect(r.doc).toEqual(doc);
    expect(r.warnings).toEqual([]);
    expect(r.migratedFrom).toBeNull();
  });

  it('is atomic: one bad value rejects the whole document with every reason', () => {
    const bad = JSON.parse(serializeMaterial(doc));
    bad.material.refraction = 999;
    bad.geometry.shape = 'star';
    bad.material.tint = 'red';
    const r = parseGlassMaterial(bad);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join('\n')).toMatch(/material\.refraction/);
    expect(r.errors.join('\n')).toMatch(/geometry\.shape/);
    expect(r.errors.join('\n')).toMatch(/material\.tint/);
  });

  it('refuses newer schema, family and runtime versions with a readable reason', () => {
    const base = JSON.parse(serializeMaterial(doc));
    const future = parseGlassMaterial({ ...base, schemaVersion: SCHEMA_VERSION + 1 });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.errors[0]).toMatch(/più recente.*aggiorna il runtime/);
    const runtime = parseGlassMaterial({ ...base, runtime: { min: '9.0.0' } });
    if (!runtime.ok) expect(runtime.errors[0]).toMatch(/richiede il runtime 9\.0\.0/);
    else throw new Error('accepted a document for a newer runtime');
    const family = parseGlassMaterial({ ...base, familyVersion: 7 });
    expect(family.ok).toBe(false);
  });

  it('does not accept planned or unknown families as usable', () => {
    const base = JSON.parse(serializeMaterial(doc));
    const jelly = parseGlassMaterial({ ...base, family: 'jelly' });
    expect(jelly.ok).toBe(false);
    if (!jelly.ok) expect(jelly.errors[0]).toMatch(/non è ancora disponibile/);
    const metal = parseGlassMaterial({ ...base, family: 'metal' });
    if (!metal.ok) expect(metal.errors[0]).toMatch(/sconosciuta/);
  });

  it('rejects malformed envelopes', () => {
    for (const bad of [null, [], 'x', { format: 'other' }, { format: 'jello-material', schemaVersion: 'two' }]) {
      expect(parseGlassMaterial(bad).ok).toBe(false);
    }
    expect(parseGlassMaterialText('{ nope').ok).toBe(false);
    const base = JSON.parse(serializeMaterial(doc));
    expect(parseGlassMaterial({ ...base, id: 'has space' }).ok).toBe(false);
    expect(parseGlassMaterial({ ...base, source: { kind: 'texture', texture: { kind: 'video' } } }).ok).toBe(false);
  });

  it('withGlassParams replaces only the parameter sections', () => {
    const next = withGlassParams(doc, { ...custom, blur: 1 });
    expect(next.material.blur).toBe(1);
    expect(next.target).toBe(doc.target);
  });
});

describe('built-in materials', () => {
  it('mirror the presets one to one', () => {
    expect(BUILTIN_MATERIALS.map((b) => b.doc.id)).toEqual(PRESETS.map((p) => p.id));
    for (const b of BUILTIN_MATERIALS) {
      expect(glassParams(b.doc)).toEqual(PRESETS.find((p) => p.id === b.doc.id)!.params);
      expect(parseGlassMaterialText(serializeMaterial(b.doc)).ok).toBe(true);
    }
  });
});

describe('quality and backend support', () => {
  it('profiles carry explicit numbers and overrides win', () => {
    expect(resolveQuality({ profile: 'economy', dprCap: null, internalScale: null, adaptive: false }).maxFps).toBe(30);
    expect(resolveQuality({ profile: 'quality', dprCap: 1.25, internalScale: null, adaptive: false }).dprCap).toBe(1.25);
    // Balanced keeps the SVG map resolution the lab used before profiles existed.
    expect(resolveQuality({ profile: 'balanced', dprCap: null, internalScale: null, adaptive: false }).mapResolution).toBe(1);
  });

  it('declares CSS optics as ignored and WebGL2 blur as approximated', () => {
    expect(supportOf('css', 'refraction').level).toBe('ignored');
    expect(supportOf('svg', 'refraction').level).toBe('supported');
    expect(supportOf('webgl2', 'blur').level).toBe('approximated');
    expect(supportReport('svg').every((r) => r.level === 'supported')).toBe(true);
  });

  it('compares versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });
});
