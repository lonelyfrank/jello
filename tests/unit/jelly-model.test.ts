import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkValue, onStep } from '../../src/core/descriptors';
import {
  JELLY_GROUPS, JELLY_PARAMS, JELLY_SECTIONS, JELLY_STATE_PARAMS,
  checkJellyParams, createExperimentalJellyDocument, defaultJellyParams,
  jellyDescriptorsOf, jellyParams, jellySectionOf, parseExperimentalJelly,
  parseExperimentalJellyText, resolveExperimentalJelly, serializeExperimentalJelly,
  splitJellyParams, type JellyExperimentalResult,
} from '../../src/model/experimental/jelly';
import { JELLY_CANDIDATE_PRESETS } from '../../src/model/experimental/jelly-presets';
import * as publicModel from '../../src/model';
import { COMPONENTS, parseDefinition, starterDefinition } from '../../src/components';
import { createMaterialGroup, materialRuntime } from '../../src/runtime/materials';

const fresh = () => createExperimentalJellyDocument({ id: 'jelly-test', name: 'Jelly test' });
const errors = (r: JellyExperimentalResult): string => {
  expect(r.ok).toBe(false);
  expect(r).not.toHaveProperty('doc');
  return r.ok ? '' : r.errors.join(' | ');
};

describe('experimental Jelly descriptors and defaults', () => {
  it('covers each key once, each section once and only declared groups, with valid on-step defaults', () => {
    const p = defaultJellyParams();
    expect(new Set(JELLY_PARAMS.map((d) => d.key)).size).toBe(JELLY_PARAMS.length);
    expect(Object.keys(p).sort()).toEqual(JELLY_PARAMS.map((d) => d.key).sort());
    expect(JELLY_SECTIONS.flatMap(jellyDescriptorsOf).map((d) => d.key).sort()).toEqual(Object.keys(p).sort());
    for (const d of JELLY_PARAMS) {
      expect(JELLY_GROUPS.some((g) => g.id === d.group), d.key).toBe(true);
      expect(checkValue(d, p[d.key]), d.key).toBeNull();
      if (d.type === 'number') expect(onStep(d, d.default), d.key).toBe(true);
    }
    expect(checkJellyParams(p)).toEqual({ values: p, errors: [], warnings: [] });
    expect(jellyParams(splitJellyParams(p))).toEqual(p);
    expect(JELLY_STATE_PARAMS.map((d) => d.key)).toEqual(['tint', 'foreground', 'bodyOpacity', 'highlightStrength', 'shadowOpacity']);
  });

  it.each(JELLY_PARAMS)('$key rejects invalid types and values atomically', (d) => {
    const values: unknown[] = d.type === 'number'
      ? [NaN, Infinity, -Infinity, d.min - 1, d.max + 1, '1', null, true, {}, []]
      : d.type === 'enum' ? ['unknown', 1, null, true, {}, []] : ['red', '#fff', '#aabbccdd', 1, null, true];
    const doc = fresh();
    const before = serializeExperimentalJelly(doc);
    for (const value of values) {
      const section = jellySectionOf(d.key);
      expect(errors(parseExperimentalJelly({ ...doc, [section]: { ...doc[section], [d.key]: value } })), String(value)).toContain(`${section}.${d.key}`);
    }
    expect(serializeExperimentalJelly(doc)).toBe(before);
  });

  it.each(JELLY_PARAMS)('$key defaults when absent with a warning', (d) => {
    const doc = fresh();
    const section = jellySectionOf(d.key);
    const value: Record<string, unknown> = { ...doc[section] };
    delete value[d.key];
    const r = parseExperimentalJelly({ ...doc, [section]: value });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(jellyParams(r.doc)[d.key]).toBe(d.default);
    expect(r.warnings).toContain(`${section}.${d.key}: assente, uso il valore iniziale`);
  });

  it('imports off-step floats like the existing families, but requires integer uint32 seeds', () => {
    expect(checkJellyParams({ thickness: 0.123456 }, { partial: true }).errors).toEqual([]);
    for (const seed of [0, 1, 4294967295]) expect(checkJellyParams({ seed }, { partial: true }).errors).toEqual([]);
    for (const seed of [-1, 0.5, 4294967296, NaN, Infinity, '42']) {
      const doc = fresh();
      expect(errors(parseExperimentalJelly({ ...doc, bubbles: { ...doc.bubbles, seed } }))).toContain('bubbles.seed');
    }
  });

  it('checks ranges after missing defaults, accepts equal bounds, and keeps partial checks partial', () => {
    const doc = fresh();
    expect(errors(parseExperimentalJelly({ ...doc, bubbles: { ...doc.bubbles, radiusMin: 5, radiusMax: 2, depthMin: 0.9, depthMax: 0.1 } }))).toMatch(/radiusMin.*radiusMax.*depthMin.*depthMax/);
    const { radiusMax: _radius, ...bubbles } = doc.bubbles;
    expect(errors(parseExperimentalJelly({ ...doc, bubbles: { ...bubbles, radiusMin: 5 } }))).toContain('radiusMin');
    expect(checkJellyParams({ radiusMin: 2, radiusMax: 2, depthMin: 1, depthMax: 1 }, { partial: true }).errors).toEqual([]);
    expect(checkJellyParams({ radiusMin: 5 }, { partial: true })).toEqual({ values: { radiusMin: 5 }, warnings: [], errors: [] });
    expect(() => createExperimentalJellyDocument({ id: 'bad', name: 'Bad', params: { radiusMin: 5, radiusMax: 2 } })).toThrow(/radiusMin/);
  });
});

describe('experimental Jelly document policy', () => {
  it('round-trips every section, state and metadata without changing the seed', () => {
    const doc = createExperimentalJellyDocument({
      id: 'custom', name: 'Personale', params: { seed: 0, radiusMin: 2, radiusMax: 4, depthMin: 0, profile: 'static', backend: 'css', fallback: 'opaque', press: 'disabled' },
      states: { hover: { tint: '#ABCDEF', bodyOpacity: 0.9 }, disabled: { foreground: '#121212' } },
      meta: { basedOn: 'jelly-soft', createdAt: '2026-10-31', updatedAt: '2026-10-31', notes: 'Un esperimento' },
    });
    expect(doc.states.hover.tint).toBe('#abcdef');
    const text = serializeExperimentalJelly(doc);
    const r = parseExperimentalJellyText(text);
    expect(r).toEqual({ ok: true, doc, warnings: [], migratedFrom: null });
    if (r.ok) expect(serializeExperimentalJelly(r.doc)).toBe(text);
    expect(Object.keys(doc)).toEqual(['format', 'schemaVersion', 'id', 'name', 'family', 'familyVersion', 'runtime', ...JELLY_SECTIONS, 'states', 'meta']);
  });

  it('normalises input key order for stable serialization at every depth', () => {
    const reverse = (value: unknown): unknown => value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reverse(v)])) : value;
    const doc = createExperimentalJellyDocument({ id: 'order', name: 'Order', states: { hover: { tint: '#123456', bodyOpacity: 0.9, foreground: '#ffffff' } } });
    const r = parseExperimentalJelly(reverse(doc));
    expect(r.ok).toBe(true);
    if (r.ok) expect(serializeExperimentalJelly(r.doc)).toBe(serializeExperimentalJelly(doc));
  });

  it('ignores unknown keys with warnings, including misplaced and ephemeral fields', () => {
    const doc = fresh();
    const r = parseExperimentalJelly({ ...doc, diagnostic: 'svg', pointerId: 4,
      runtime: { ...doc.runtime, actualBackend: 'css' }, meta: { ...doc.meta, custom: 'ignored' },
      material: { ...doc.material, density: 9, invented: true },
      states: { ...doc.states, focus: {}, hover: { foreground: '#ABCDEF', seed: 99 } },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.join(' | ')).toMatch(/material.density: appartiene alla sezione bubbles/);
    for (const key of ['diagnostic', 'pointerId', 'runtime.actualBackend', 'meta.custom', 'material.invented', 'states.focus', 'states.hover.seed']) expect(r.warnings.join(), key).toContain(key);
    expect(r.doc.bubbles.density).toBe(doc.bubbles.density);
    expect(r.doc.states.hover).toEqual({ foreground: '#abcdef' });
    expect(r.doc).not.toHaveProperty('pointerId');
  });

  it('defaults optional quality, target, states and metadata; required sections must be objects', () => {
    const doc = fresh();
    const { quality: _q, target: _t, states: _s, meta: _m, ...required } = doc;
    const r = parseExperimentalJelly(required);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.doc).toEqual(doc);
    for (const section of JELLY_SECTIONS) for (const value of [null, [], false, 4]) expect(errors(parseExperimentalJelly({ ...doc, [section]: value }))).toContain(section);
    for (const section of ['material', 'geometry', 'bubbles', 'behavior'] as const) {
      const input: Record<string, unknown> = { ...doc };
      delete input[section];
      expect(errors(parseExperimentalJelly(input))).toContain(section);
    }
    expect(errors(parseExperimentalJelly({ ...doc, states: null }))).toContain('states');
    expect(errors(parseExperimentalJelly({ ...doc, states: { hover: [] } }))).toContain('states.hover');
  });

  it('rejects invalid JSON, envelopes, future versions, and other families without migration', () => {
    expect(errors(parseExperimentalJellyText('{'))).toContain('JSON non valido');
    for (const value of [null, [], false, 3, 'jelly']) expect(parseExperimentalJelly(value).ok).toBe(false);
    const doc = fresh();
    for (const patch of [{ id: 'bad id' }, { name: '' }, { name: 'x'.repeat(81) }, { format: 'jello-glass' }, { family: 'solid' }, { schemaVersion: 1 }, { familyVersion: 0 }, { familyVersion: 1.5 }, { runtime: { min: 'latest' } }, { runtime: { min: '99.0.0' } }, { meta: { notes: 'x'.repeat(4001) } }]) expect(parseExperimentalJelly({ ...doc, ...patch }).ok, JSON.stringify(patch).slice(0, 100)).toBe(false);
    for (const key of ['schemaVersion', 'familyVersion']) expect(errors(parseExperimentalJelly({ ...doc, [key]: 99 }))).toMatch(new RegExp(`${key}.*più recente.*supportata`));
    for (const def of publicModel.MATERIALS.list()) expect(parseExperimentalJelly(def.create('old', 'Old')).ok).toBe(false);
  });

  it('refuses serialization of invalid typed data instead of turning non-finite numbers into null', () => {
    const doc = fresh();
    doc.material.transmission = NaN;
    expect(() => serializeExperimentalJelly(doc)).toThrow(/material.transmission/);
  });

  it.each(JELLY_STATE_PARAMS)('$key is validated for every override state', (d) => {
    const doc = fresh();
    for (const state of ['hover', 'pressed', 'active', 'disabled']) expect(errors(parseExperimentalJelly({ ...doc, states: { ...doc.states, [state]: { [d.key]: null } } }))).toContain(`states.${state}.${d.key}`);
  });
});

describe('candidate presets and appearance resolution', () => {
  it.each(JELLY_CANDIDATE_PRESETS)('$doc.name is deterministic, valid, unverified and matches its generated JSON', ({ doc, description, visuallyVerified }) => {
    expect(visuallyVerified).toBe(false);
    expect(description.length).toBeGreaterThan(20);
    const text = serializeExperimentalJelly(doc);
    expect(parseExperimentalJellyText(text)).toEqual({ ok: true, doc, warnings: [], migratedFrom: null });
    expect(readFileSync(`docs/examples/jelly/${doc.id}.json`, 'utf8')).toBe(text + '\n');
    expect(publicModel.MATERIALS.preset(doc.id)).toBeUndefined();
  });

  it('composes active → hover → pressed → disabled, ignoring disabled interactions and preserving the document', () => {
    const doc = createExperimentalJellyDocument({ id: 'states', name: 'States', states: {
      active: { tint: '#111111', foreground: '#ffffff' }, hover: { tint: '#222222' },
      pressed: { tint: '#333333' }, disabled: { bodyOpacity: 0.4 },
    } });
    const before = serializeExperimentalJelly(doc);
    expect(resolveExperimentalJelly(doc, { active: true, hover: true, pressed: true }).tint).toBe('#333333');
    expect(resolveExperimentalJelly(doc, { active: true, hover: true, pressed: true, disabled: true })).toMatchObject({ tint: '#111111', foreground: '#ffffff', bodyOpacity: 0.4 });
    expect(resolveExperimentalJelly({ ...doc, behavior: { ...doc.behavior, press: 'disabled', hover: 'disabled' } }, { hover: true, pressed: true })).toEqual(doc.material);
    const result = resolveExperimentalJelly(doc);
    result.tint = '#000000';
    expect(serializeExperimentalJelly(doc)).toBe(before);
    expect(new Set(JELLY_CANDIDATE_PRESETS.map((p) => p.doc.bubbles.seed)).size).toBe(4);
  });
});

describe('production remains gated', () => {
  it('does not expose experimental API or register a renderer, family, or presets', () => {
    expect(publicModel.familyInfo('jelly')).toMatchObject({ status: 'planned', version: 0, editor: false });
    expect(publicModel.MATERIALS.list().map((d) => d.id)).toEqual(['glass', 'solid']);
    expect(materialRuntime('jelly')).toBeUndefined();
    expect(publicModel).not.toHaveProperty('parseExperimentalJelly');
    expect(() => new publicModel.MaterialRegistry().register({ ...publicModel.MATERIALS.get('solid')!, id: 'jelly' })).toThrow(/non è disponibile/);
    const r = publicModel.parseMaterial(fresh());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/Jelly.*non è ancora disponibile/);
    // Unknown runtime input is tested at the trust boundary, despite the TS overload rejecting it.
    expect(() => Reflect.apply(createMaterialGroup, null, [{ material: fresh() }])).toThrow(/Nessun runtime.*jelly/);
  });

  it('canonical component v1 refuses a Jelly binding for all three supported components', () => {
    for (const type of ['button', 'mobile-navbar', 'desktop-navbar'] as const) {
      const doc = starterDefinition(type);
      expect(doc.format).toBe('jello-component-definition');
      expect(doc.schemaVersion).toBe(1);
      const r = parseDefinition({ ...doc, material: { ...doc.material, family: 'jelly', document: fresh() } });
      expect(r.ok).toBe(false);
      expect(COMPONENTS.supports(type, 'jelly')).toBe(false);
    }
  });
});
