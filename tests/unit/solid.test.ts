/**
 * Solid: parameters, sections, the five states, elevation, document
 * serialization and validation, presets. Pure: no DOM (the surface itself is
 * exercised in the browser, tests/e2e/solid.spec.ts).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NO_FLAGS,
  SOLID_EASING,
  SOLID_INDEX,
  SOLID_PARAMS,
  SOLID_PRESETS,
  SOLID_SECTIONS,
  SOLID_SECTION_KEYS,
  SOLID_STATE_PARAMS,
  checkSolidParams,
  createSolidDocument,
  defaultSolidParams,
  defaultSolidStates,
  diffSolid,
  elevationShadow,
  hexToRgb,
  joinSolidSections,
  parseMaterialText,
  resolveSolid,
  serializeMaterial,
  solidParams,
  solidSectionOf,
  solidStagesFor,
  solidState,
  splitSolidParams,
  validateSolidDocument,
  withSolidParams,
  type SolidDocument,
} from '../../src/model';

const doc = (): SolidDocument => createSolidDocument({ id: 's-1', name: 'Solid prova' });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const solidOf = (input: unknown) => {
  const r = validateSolidDocument(input);
  if (!r.ok || r.doc.family !== 'solid') throw new Error(r.ok ? 'not solid' : r.errors.join());
  return { doc: r.doc, warnings: r.warnings };
};
const errorsOf = (input: unknown) => {
  const r = validateSolidDocument(input);
  return r.ok ? [] : r.errors;
};

describe('Solid parameters', () => {
  it('every parameter has a valid default, a known group and a stage that never touches layout', () => {
    expect(SOLID_PARAMS.map((d) => d.key)).toEqual(Object.keys(defaultSolidParams()));
    for (const d of SOLID_PARAMS) {
      expect(['surface', 'border', 'elevation', 'shape', 'motion']).toContain(d.group);
      expect(['surface', 'motion']).toContain(d.affects);
      expect(checkSolidParams({ [d.key]: d.default }).errors, d.key).toEqual([]);
    }
  });

  it('sections partition the parameters and split → join is lossless', () => {
    const all = SOLID_SECTIONS.flatMap((s) => SOLID_SECTION_KEYS[s]);
    expect([...all].sort()).toEqual(SOLID_PARAMS.map((d) => d.key).sort());
    expect(new Set(all).size).toBe(all.length);
    expect(solidSectionOf('radius')).toBe('geometry');
    expect(solidSectionOf('duration')).toBe('behavior');
    expect(solidSectionOf('shadowOpacity')).toBe('material');
    const p = { ...defaultSolidParams(), fill: '#123456', radius: 40, easing: 'linear' as const };
    expect(joinSolidSections(splitSolidParams(p))).toEqual(p);
    expect(solidParams(withSolidParams(doc(), p))).toEqual(p);
  });

  it('validates ranges, enums and colors, and says which key is wrong', () => {
    const r = checkSolidParams({ borderWidth: 9, shape: 'blob', fill: '#fff', radius: 'x', elevation: 2 });
    expect(r.errors).toEqual([
      'params.fill: atteso un colore #rrggbb',
      'params.borderWidth: 9 fuori intervallo [0, 8]',
      'params.shape: atteso uno tra capsule, rounded',
      'params.radius: atteso un numero',
    ]);
    expect(r.values).toEqual({ elevation: 2 });
    expect(checkSolidParams({ nope: 1 }).warnings).toEqual(['params.nope: parametro sconosciuto, ignorato']);
  });

  it('needs no SVG filter, displacement map or canvas: neither the model nor the renderer reaches the Glass engine', () => {
    for (const file of ['src/model/solid.ts', 'src/runtime/solid-group.ts', 'src/runtime/solid.css']) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/feDisplacementMap|feImage|feGaussianBlur|backdrop-filter|createElementNS|WebGL|getContext|core\/(context|surface|geometry|renderer)/);
    }
  });
});

describe('Solid states', () => {
  it('default is the material itself: no override applied', () => {
    const d = doc();
    const s = resolveSolid(d);
    expect(s).toMatchObject({ state: 'default', fill: d.material.fill, foreground: d.material.foreground, borderColor: d.material.borderColor, elevation: d.material.elevation, scale: 1, opacity: 1 });
    expect(resolveSolid(d, NO_FLAGS)).toEqual(s);
  });

  it('hover, pressed, active and disabled each apply their own overrides', () => {
    const d = doc();
    expect(resolveSolid(d, { ...NO_FLAGS, hover: true })).toMatchObject({ state: 'hover', fill: '#e7eaee', elevation: 2, scale: 1 });
    expect(resolveSolid(d, { ...NO_FLAGS, pressed: true })).toMatchObject({ state: 'pressed', fill: '#dce0e5', elevation: 0, scale: 0.98 });
    expect(resolveSolid(d, { ...NO_FLAGS, active: true })).toMatchObject({ state: 'active', fill: '#111827', foreground: '#ffffff', borderColor: '#111827' });
    expect(resolveSolid(d, { ...NO_FLAGS, disabled: true })).toMatchObject({ state: 'disabled', opacity: 0.45, elevation: 0 });
  });

  it('a state overrides only the keys it declares; the rest follows the material and the lower states', () => {
    const d = createSolidDocument({ id: 'a', name: 'A', states: { hover: { elevation: 4 }, active: { fill: '#000000', foreground: '#ffffff' } } });
    const hover = resolveSolid(d, { ...NO_FLAGS, hover: true });
    expect(hover.fill).toBe(d.material.fill);
    expect(hover.elevation).toBe(4);
    // Hovering the active item keeps what active declared and applies only what hover declares.
    const both = resolveSolid(d, { ...NO_FLAGS, active: true, hover: true });
    expect(both).toMatchObject({ fill: '#000000', foreground: '#ffffff', elevation: 4, state: 'hover' });
  });

  it('precedence of the dominant state: disabled > pressed > hover > active > default', () => {
    const f = (o: Partial<typeof NO_FLAGS>) => solidState({ ...NO_FLAGS, ...o });
    expect(f({})).toBe('default');
    expect(f({ active: true })).toBe('active');
    expect(f({ active: true, hover: true })).toBe('hover');
    expect(f({ active: true, hover: true, pressed: true })).toBe('pressed');
    expect(f({ active: true, hover: true, pressed: true, disabled: true })).toBe('disabled');
  });

  it('a disabled element ignores hover and pressed but keeps the active look', () => {
    const d = doc();
    const s = resolveSolid(d, { hover: true, pressed: true, active: true, disabled: true });
    expect(s.state).toBe('disabled');
    expect(s.fill).toBe(d.states.active.fill);
    expect(s.scale).toBe(1);
    expect(s.opacity).toBe(0.45);
  });

  it('state overrides are validated with the same ranges as the material', () => {
    const keys = SOLID_STATE_PARAMS.map((d) => d.key);
    expect(keys).toEqual(['fill', 'foreground', 'borderColor', 'elevation', 'scale', 'opacity']);
    for (const k of ['fill', 'foreground', 'borderColor', 'elevation'] as const) {
      const shared = SOLID_STATE_PARAMS.find((d) => d.key === k)!;
      expect(shared).toMatchObject({ type: SOLID_INDEX[k].type, label: SOLID_INDEX[k].label });
    }
    const base = clone(doc());
    expect(errorsOf({ ...base, states: { ...base.states, hover: { scale: 2 } } })).toEqual(['states.hover.scale: 2 fuori intervallo [0.9, 1.1]']);
    expect(errorsOf({ ...base, states: { ...base.states, pressed: { opacity: 0.05, fill: 'blue' } } })).toEqual([
      'states.pressed.fill: atteso un colore #rrggbb',
      'states.pressed.opacity: 0.05 fuori intervallo [0.2, 1]',
    ]);
  });

  it('defaults keep readable contrast between text and fill in every state', () => {
    const lum = (hex: string) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    for (const p of SOLID_PRESETS) {
      for (const flags of [NO_FLAGS, { ...NO_FLAGS, hover: true }, { ...NO_FLAGS, pressed: true }, { ...NO_FLAGS, active: true }]) {
        const s = resolveSolid(p.doc, flags);
        expect(ratio(s.fill, s.foreground), `${p.doc.id} ${solidState(flags)}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('Solid elevation, shape and transitions', () => {
  it('elevation maps to layered shadows that grow with the level; level 0 or no opacity is none', () => {
    expect(elevationShadow(0, '#000000', 0.5)).toBe('none');
    expect(elevationShadow(3, '#000000', 0)).toBe('none');
    const offsets = [1, 2, 3, 4, 5].map((l) => Number(/^0 (\d+)px/.exec(elevationShadow(l, '#101828', 0.2))![1]));
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    expect(new Set(offsets).size).toBe(5);
    expect(elevationShadow(2, '#101828', 0.2).split('), 0 ')).toHaveLength(2);
    expect(elevationShadow(1, '#ff0000', 0.2)).toContain('color-mix(in srgb, #ff0000 ');
  });

  it('without color-mix the same shadow is written as rgba(), level for level, never as none', () => {
    expect(hexToRgb('#101828')).toEqual([16, 24, 40]);
    expect(hexToRgb('nope')).toEqual([0, 0, 0]);
    for (const level of [1, 2, 3, 4, 5]) {
      const mixed = elevationShadow(level, '#101828', 0.2);
      const plain = elevationShadow(level, '#101828', 0.2, false);
      expect(mixed).toContain('color-mix(');
      expect(plain).not.toContain('color-mix');
      expect(plain).toMatch(/rgba\(16, 24, 40, 0\.\d+\)/);
      // Same geometry (offset and blur of both layers), only the color notation differs.
      const geometry = (v: string) => v.match(/0 \d+px \d+px/g);
      expect(geometry(plain)).toEqual(geometry(mixed));
      // Same opacity: 'x%' of color-mix equals the alpha of rgba.
      const pct = [...mixed.matchAll(/#101828 ([\d.]+)%/g)].map((m) => Number(m[1]) / 100);
      const alpha = [...plain.matchAll(/, ([\d.]+)\)/g)].map((m) => Number(m[1]));
      pct.forEach((p, i) => expect(alpha[i]).toBeCloseTo(p, 3));
    }
    expect(elevationShadow(0, '#000000', 0.5, false)).toBe('none');
    const doc = createSolidDocument({ id: 'a', name: 'A' });
    expect(resolveSolid(doc, NO_FLAGS, { colorMix: false }).shadow).not.toContain('color-mix');
    expect(resolveSolid(doc).shadow).toContain('color-mix');
  });

  it('shape: capsule is half the short side, rounded uses the radius', () => {
    expect(resolveSolid(createSolidDocument({ id: 'a', name: 'A', params: { shape: 'capsule' } })).radius).toBe('capsule');
    expect(resolveSolid(createSolidDocument({ id: 'a', name: 'A', params: { shape: 'rounded', radius: 20 } })).radius).toBe(20);
  });

  it('transitions are short by default, capped at 600 ms, and expose a timing function', () => {
    const d = doc();
    expect(d.behavior.duration).toBeLessThanOrEqual(200);
    expect(SOLID_INDEX.duration).toMatchObject({ min: 0, max: 600 });
    expect(resolveSolid(d).easing).toBe(SOLID_EASING.standard);
    expect(resolveSolid(createSolidDocument({ id: 'a', name: 'A', params: { easing: 'linear', duration: 0 } }))).toMatchObject({ easing: 'linear', duration: 0 });
  });

  it('finish soft adds a sheen over the fill without making the fill a gradient (so it can transition)', () => {
    expect(resolveSolid(doc()).sheen).toBe('none');
    const soft = resolveSolid(createSolidDocument({ id: 'a', name: 'A', params: { finish: 'soft' } }));
    expect(soft.sheen).toMatch(/^linear-gradient/);
    expect(soft.fill).toBe('#f1f3f5');
  });

  it('diff reports the changed paths and the stages they touch', () => {
    const a = doc();
    expect(diffSolid(a, a)).toEqual([]);
    // A state passed to createSolidDocument replaces the whole state: hover loses its initial fill.
    const b = createSolidDocument({ id: 's-1', name: 'Solid prova', params: { fill: '#000000', duration: 200 }, states: { hover: { elevation: 5 } } });
    expect(diffSolid(a, b).sort()).toEqual(['behavior.duration', 'material.fill', 'states.hover.elevation', 'states.hover.fill']);
    expect([...solidStagesFor(['behavior.duration'])]).toEqual(['motion']);
    expect([...solidStagesFor(['material.fill', 'states.hover.fill'])]).toEqual(['surface']);
  });
});

describe('Solid document', () => {
  it('serializes with a stable key order and round-trips without loss', () => {
    for (const p of SOLID_PRESETS) {
      const text = serializeMaterial(p.doc);
      expect(Object.keys(JSON.parse(text))).toEqual(['format', 'schemaVersion', 'id', 'name', 'family', 'familyVersion', 'runtime', 'material', 'geometry', 'behavior', 'states', 'meta']);
      const r = parseMaterialText(text);
      expect(r.ok && r.doc).toEqual(p.doc);
      expect(r.ok && r.warnings).toEqual([]);
      expect(r.ok && serializeMaterial(r.doc)).toBe(text);
    }
  });

  it('carries no Glass-only section', () => {
    const keys = Object.keys(JSON.parse(serializeMaterial(doc())));
    for (const k of ['quality', 'source', 'target']) expect(keys).not.toContain(k);
  });

  it('fills missing values with defaults, ignores unknown ones, and reports both', () => {
    const base = clone(doc()) as unknown as Record<string, Record<string, unknown>>;
    delete base.material!.borderWidth;
    base.material!.glow = 1;
    const r = solidOf({ ...base, extra: true });
    expect(r.doc.material.borderWidth).toBe(1);
    expect(r.warnings).toEqual(['material.borderWidth: assente, uso il valore iniziale', 'material.glow: parametro sconosciuto, ignorato', 'extra: campo sconosciuto, ignorato']);
  });

  it('absent states take the initial states; a present states object lists only the overrides it has', () => {
    const base = clone(doc()) as unknown as Record<string, unknown>;
    delete base.states;
    const r1 = solidOf(base);
    expect(r1.doc.states).toEqual(defaultSolidStates());
    expect(r1.warnings).toEqual(['states: assente, uso gli stati iniziali']);
    const r2 = solidOf({ ...base, states: { hover: { fill: '#112233' }, default: { fill: '#000000' }, glowing: {} } });
    expect(r2.doc.states).toEqual({ hover: { fill: '#112233' }, pressed: {}, active: {}, disabled: {} });
    expect(r2.warnings).toEqual(['states.default: lo stato iniziale è il materiale, ignorato', 'states.glowing: stato sconosciuto, ignorato']);
  });

  it('is atomic: every error is reported and nothing is half-applied', () => {
    const base = clone(doc()) as unknown as Record<string, Record<string, unknown>>;
    base.material!.elevation = 7;
    base.geometry!.radius = -1;
    base.behavior!.easing = 'bounce';
    const errors = errorsOf(base);
    expect(errors).toEqual([
      'material.elevation: 7 fuori intervallo [0, 5]',
      'geometry.radius: -1 fuori intervallo [0, 120]',
      'behavior.easing: atteso uno tra standard, emphasized, linear',
    ]);
  });

  it('refuses a newer runtime, an invalid id and a wrong family literal with a reason', () => {
    const base = clone(doc());
    expect(errorsOf({ ...base, runtime: { min: '9.0.0' } })[0]).toMatch(/richiede il runtime 9\.0\.0/);
    expect(errorsOf({ ...base, id: 'no spaces' })[0]).toMatch(/^id:/);
    expect(errorsOf({ ...base, family: 'glass' })[0]).toMatch(/^family:/);
    expect(errorsOf({ ...base, runtime: { min: 'x' } })).toEqual(['runtime.min: attesa una versione x.y.z']);
    const r = parseMaterialText(JSON.stringify({ ...base, schemaVersion: 3 }));
    expect(!r.ok && r.errors[0]).toMatch(/più recente/);
  });

  it('keys in the wrong section are named, not silently moved', () => {
    const base = clone(doc()) as unknown as Record<string, Record<string, unknown>>;
    base.geometry!.fill = '#000000';
    const r = validateSolidDocument(base);
    expect(r.ok && r.warnings).toEqual(['geometry.fill: appartiene alla sezione material, ignorato qui']);
  });
});

describe('Solid documentation', () => {
  it('docs/material-core.md documents every parameter and every state key', () => {
    const doc = readFileSync('docs/material-core.md', 'utf8');
    for (const d of SOLID_PARAMS) expect(doc, d.key).toContain(`\`${d.key}\``);
    for (const d of SOLID_STATE_PARAMS) expect(doc, d.key).toContain(`\`${d.key}\``);
    for (const p of SOLID_PRESETS) expect(doc, p.doc.id).toContain(`\`${p.doc.id}\``);
  });
});

describe('Solid presets', () => {
  it('are generic, original, valid documents with distinct ids that do not collide with Glass presets', () => {
    expect(SOLID_PRESETS.map((p) => p.doc.id)).toEqual(['solid-neutral', 'solid-dark', 'solid-accent', 'solid-outline']);
    for (const p of SOLID_PRESETS) {
      expect(p.approximation).toBe(false);
      expect(validateSolidDocument(JSON.parse(serializeMaterial(p.doc))).ok, p.doc.id).toBe(true);
      expect(`${p.doc.name} ${p.note}`).not.toMatch(/cable|\bbt\b|darts/i);
    }
    expect(SOLID_PRESETS[0]!.doc.material).toEqual(createSolidDocument({ id: 'x', name: 'x' }).material);
  });
});
