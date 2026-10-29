import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PARAMS,
  changedKeys,
  defaultParams,
  effectiveRadius,
  parseParams,
  serializeParams,
  stagesOf,
  validateParams,
} from '../../src/core/params';
import { PRESETS } from '../../src/core/presets';

describe('parameter table', () => {
  it('defaults are inside their ranges', () => {
    for (const d of PARAMS) {
      if (d.type === 'number') {
        expect(d.default, d.key).toBeGreaterThanOrEqual(d.min);
        expect(d.default, d.key).toBeLessThanOrEqual(d.max);
      }
      if (d.type === 'enum') expect(d.options).toContain(d.default);
    }
  });

  it('chromatic aberration is off in the initial material', () => {
    expect(defaultParams().chroma).toBe(0);
  });

  it('centre is neutral by default', () => {
    expect(defaultParams().dome).toBe(0);
  });

  it('every preset is valid', () => {
    for (const p of PRESETS) {
      const r = parseParams(serializeParams(p.params));
      expect(r.ok, p.id).toBe(true);
    }
  });

  it('every parameter is documented in docs/material-model.md', () => {
    const doc = readFileSync(new URL('../../docs/material-model.md', import.meta.url), 'utf8');
    for (const d of PARAMS) expect(doc, d.key).toContain(`\`${d.key}\``);
  });

  it('only geometry parameters regenerate the map', () => {
    const map = PARAMS.filter((d) => d.affects === 'map').map((d) => d.key);
    expect(map.sort()).toEqual(['band', 'dome', 'height', 'profile', 'radius', 'shape', 'width']);
    const a = defaultParams();
    expect([...stagesOf(changedKeys(a, { ...a, refraction: 30, blur: 4 }))]).toEqual(['filter']);
  });

  it('capsule radius is half the shorter side', () => {
    expect(effectiveRadius({ shape: 'capsule', width: 280, height: 104, radius: 10 })).toBe(52);
    expect(effectiveRadius({ shape: 'rounded', width: 280, height: 104, radius: 10 })).toBe(10);
    expect(effectiveRadius({ shape: 'rounded', width: 280, height: 104, radius: 90 })).toBe(52);
  });
});

describe('serialization', () => {
  it('round-trips every preset exactly', () => {
    for (const p of PRESETS) {
      const r = parseParams(serializeParams(p.params));
      if (!r.ok) throw new Error(r.errors.join('\n'));
      expect(r.params).toEqual(p.params);
      expect(r.warnings).toEqual([]);
    }
  });

  it('rejects malformed JSON', () => {
    const r = parseParams('{ "format": ');
    expect(r.ok).toBe(false);
  });

  it('rejects wrong format, version and shapes', () => {
    expect(validateParams(null).ok).toBe(false);
    expect(validateParams([]).ok).toBe(false);
    expect(validateParams({ format: 'other', version: 1, params: {} }).ok).toBe(false);
    expect(validateParams({ format: 'jello-glass', version: 2, params: {} }).ok).toBe(false);
    expect(validateParams({ format: 'jello-glass', version: 1, params: 3 }).ok).toBe(false);
  });

  it('rejects out-of-range, wrong-type and invalid enum values, listing all of them', () => {
    const r = validateParams({
      format: 'jello-glass',
      version: 1,
      params: { blur: -1, refraction: '20', profile: 'spiral', tint: 'red', width: Number.NaN },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toHaveLength(5);
      expect(r.errors.join(' ')).toMatch(/blur/);
      expect(r.errors.join(' ')).toMatch(/profile/);
    }
  });

  it('fills missing keys with defaults and ignores unknown ones, with warnings', () => {
    const r = validateParams({ format: 'jello-glass', version: 1, params: { blur: 5, glitter: true } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.params.blur).toBe(5);
      expect(r.params.refraction).toBe(defaultParams().refraction);
      expect(r.warnings.some((w) => w.startsWith('glitter'))).toBe(true);
      expect(r.warnings.some((w) => w.startsWith('refraction'))).toBe(true);
    }
  });

  it('normalizes colours to lowercase', () => {
    const r = validateParams({ format: 'jello-glass', version: 1, params: { ...defaultParams(), tint: '#AABBCC' } });
    expect(r.ok && r.params.tint).toBe('#aabbcc');
  });
});
