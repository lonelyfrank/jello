import { describe, expect, it } from 'vitest';
import { PARAM_INDEX, parseNumberInput, type NumberDescriptor } from '../../src/core/params';
import { PRESETS } from '../../src/core/presets';
import { isBuiltinId } from '../../src/model';
import { legacyPreset } from '../../src/migration';
import { saturationMatrix } from '../../src/core/renderer/source-filter';
import { applicability } from '../../src/lab/applicability';
import { optionsFromQuery } from '../../src/lab/state';

const num = (k: string) => PARAM_INDEX[k as keyof typeof PARAM_INDEX] as NumberDescriptor;

describe('numeric input validation', () => {
  const refraction = num('refraction'); // -40 … 80, step 0.5
  const pressScale = num('pressScale'); // 1 … 1.15, step 0.005

  it('accepts values in range and on the step, with dot or comma', () => {
    expect(parseNumberInput(refraction, '22.5')).toEqual({ ok: true, value: 22.5 });
    expect(parseNumberInput(refraction, ' -12,5 ')).toEqual({ ok: true, value: -12.5 });
    expect(parseNumberInput(pressScale, '1.025')).toEqual({ ok: true, value: 1.025 });
    expect(parseNumberInput(num('tintOpacity'), '0.3')).toEqual({ ok: true, value: 0.3 });
  });

  it('rejects empty, non-numeric, non-finite, out-of-range and off-step values', () => {
    const cases: [NumberDescriptor, string, RegExp][] = [
      [refraction, '', /vuoto/],
      [refraction, '   ', /vuoto/],
      [refraction, 'abc', /numero/],
      [refraction, '12px', /numero/],
      [refraction, 'Infinity', /numero/],
      [refraction, '1e999', /finito/],
      [refraction, 'NaN', /numero/],
      [refraction, '80.5', /intervallo/],
      [refraction, '-41', /intervallo/],
      [refraction, '22.3', /passo/],
      [pressScale, '1.0251', /passo/],
    ];
    for (const [d, text, error] of cases) {
      const r = parseNumberInput(d, text);
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.error, text).toMatch(error);
    }
  });

  it('snaps float noise to the step value', () => {
    const r = parseNumberInput(num('damping'), String(0.1 + 0.2));
    expect(r).toEqual({ ok: true, value: 0.3 });
  });
});

describe('parameter applicability', () => {
  const base = { path: 'refraction' as const, motionReduced: false, params: { shape: 'capsule' as const } };

  it('capsule size controls are disabled for the navbar', () => {
    const a = applicability({ ...base, object: 'navbar' });
    for (const k of ['width', 'height', 'shape', 'radius', 'stretch'] as const) expect(a.get(k)?.disabled, k).toBe(true);
    expect(a.get('refraction')).toBeUndefined();
    expect(a.get('blur')).toBeUndefined();
  });

  it('capsule: radius only applies to the rounded shape', () => {
    expect(applicability({ ...base, object: 'capsule' }).get('radius')?.disabled).toBe(true);
    expect(applicability({ ...base, object: 'capsule', params: { shape: 'rounded' } }).get('radius')).toBeUndefined();
    expect(applicability({ ...base, object: 'capsule' }).get('width')).toBeUndefined();
  });

  it('path and reduced motion mark values as inactive, still editable', () => {
    const satin = applicability({ ...base, object: 'capsule', path: 'satin' });
    expect(satin.get('refraction')).toMatchObject({ disabled: false });
    expect(satin.get('blur')).toBeUndefined();
    const opaque = applicability({ ...base, object: 'capsule', path: 'opaque' });
    expect(opaque.get('blur')).toMatchObject({ disabled: false });
    const reduced = applicability({ ...base, object: 'capsule', motionReduced: true });
    expect(reduced.get('pressScale')).toMatchObject({ disabled: false });
  });
});

describe('lab URL state', () => {
  const q = (s: string) => optionsFromQuery(new URLSearchParams(s), false);

  it('defaults stay those of the first milestone', () => {
    const r = q('');
    expect(r.preset).toBe('jello');
    expect(r.options).toMatchObject({ object: 'capsule', scene: 'grid', nav: 'home', path: 'auto', compare: false });
  });

  it('object=navbar starts on the app scene with the navbar preset unless overridden', () => {
    expect(q('object=navbar')).toMatchObject({ preset: 'navbar', options: { object: 'navbar', scene: 'app' } });
    expect(q('object=navbar&scene=grid&preset=optics')).toMatchObject({ preset: 'optics', options: { scene: 'grid' } });
    expect(q('object=navbar&nav=explore').options.nav).toBe('explore');
    // Tabs of the earlier demo navbar are no longer valid: first tab.
    expect(q('object=navbar&nav=matrix').options.nav).toBe('home');
  });

  it('unknown values fall back instead of breaking', () => {
    expect(q('object=sphere&scene=moon&nav=x&path=laser').options).toMatchObject({
      object: 'capsule',
      scene: 'grid',
      nav: 'home',
      path: 'auto',
    });
  });

  it('the preview frame defaults to desktop and accepts the phone column', () => {
    expect(q('').options.device).toBe('desktop');
    expect(q('device=phone').options.device).toBe('phone');
    expect(q('device=watch').options.device).toBe('desktop');
  });

  it('animation follows the system preference unless asked explicitly', () => {
    expect(optionsFromQuery(new URLSearchParams(''), true).options.animate).toBe(false);
    expect(optionsFromQuery(new URLSearchParams('animate=1'), true).options.animate).toBe(true);
  });
});

describe('presets', () => {
  it('the official presets are Jello’s own: no approximation of other projects', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['jello', 'optics', 'satin', 'deep', 'navbar']);
    expect(PRESETS.every((p) => !p.approximation)).toBe(true);
    const text = JSON.stringify(PRESETS);
    expect(text).not.toMatch(/cable|\bbt\b|score board|darts/i);
  });

  it('removed presets resolve through the compatibility table, with their original parameters', () => {
    for (const id of ['cable', 'bt']) {
      expect(PRESETS.some((p) => p.id === id)).toBe(false);
      expect(isBuiltinId(id)).toBe(false);
      const legacy = legacyPreset(id)!;
      expect(isBuiltinId(legacy.replacement)).toBe(true);
      expect(legacy.name).not.toMatch(/cable|\bbt\b/i);
    }
    expect(legacyPreset('bt')!.params).toMatchObject({ band: 12, refraction: 5, profile: 'bump', blur: 10, saturation: 150, tintOpacity: 0.14 });
    expect(legacyPreset('cable')!.params).toMatchObject({ shape: 'rounded', radius: 28, refraction: 0, blur: 30, saturation: 185, tintOpacity: 0.43 });
    expect(legacyPreset('jello')).toBeUndefined();
    // URLs naming them fall back instead of breaking.
    expect(optionsFromQuery(new URLSearchParams('preset=bt'), false).preset).toBe('jello');
  });
});

describe('saturation matrix', () => {
  it('is the identity at 100% without normalization', () => {
    expect(saturationMatrix(1, false)).toBe('1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0');
  });

  it('keeps grey neutral at any saturation and sets alpha to 1 when normalizing', () => {
    const rows = saturationMatrix(1.6, true)
      .split('  ')
      .map((r) => r.split(' ').map(Number));
    for (const row of rows.slice(0, 3)) expect(row[0]! + row[1]! + row[2]!).toBeCloseTo(1, 3);
    expect(rows[3]).toEqual([0, 0, 0, 0, 1]);
  });
});
