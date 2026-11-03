import { describe, expect, it } from 'vitest';
import { checkJellyParams, jellyParams, parseExperimentalJelly, serializeExperimentalJelly } from '../../src/model/experimental/jelly';
import { JELLY_CANDIDATE_PRESETS } from '../../src/model/experimental/jelly-presets';
import { evolveJellyMotion, initJellyMotion, jellyMotionSettled, pressJellyMotion } from '../../src/model/experimental/jelly-motion';
import { bubbleCandidates, jellyGeometry, jellyOptics, projectBubble, surfacePoint } from '../../src/model/experimental/jelly-visual';
import { PRESET_IDS, VARIANTS } from '../fixtures/jelly-m643/variants';

const docs = Object.keys(VARIANTS).flatMap((name) => PRESET_IDS.map((id) => ({ name, id, ...VARIANTS[name]!(id) })));

describe('M6.4.3 built-ins are untouched (no silent change, §12.2)', () => {
  // Frozen copy of the M6.4.2 values that define identity, optics and behaviour of the four stored presets.
  const FROZEN = {
    'jelly-soft': { tint: '#b8a2e8', seed: 10631, density: 8, opacity: 0.8, responseMs: 360, dampingRatio: 0.65, maxDeformation: 0.06, releaseImpulse: 0.15, thickness: 0.35, edgeFalloff: 1.5, roughness: 0.55 },
    'jelly-clear': { tint: '#d2e9ee', seed: 20631, density: 5, opacity: 0.8, responseMs: 360, dampingRatio: 0.65, maxDeformation: 0.06, releaseImpulse: 0.15, thickness: 0.35, edgeFalloff: 1.5, roughness: 0.3 },
    'jelly-candy': { tint: '#d64b93', seed: 30631, density: 10, opacity: 0.8, responseMs: 360, dampingRatio: 0.4, maxDeformation: 0.09, releaseImpulse: 0.15, thickness: 0.55, edgeFalloff: 2, roughness: 0.55 },
    'jelly-dense': { tint: '#a6c9b2', seed: 40631, density: 7, opacity: 0.8, responseMs: 220, dampingRatio: 1.05, maxDeformation: 0.035, releaseImpulse: 0.05, thickness: 0.35, edgeFalloff: 1.5, roughness: 0.55 },
  } as const;
  it.each(PRESET_IDS)('%s keeps its stored values, name and unverified status', (id) => {
    const p = JELLY_CANDIDATE_PRESETS.find((c) => c.doc.id === id)!;
    expect(p.visuallyVerified).toBe(false);
    expect(p.doc.name).toBe(`Jelly ${id.slice(6, 7).toUpperCase()}${id.slice(7)}`);
    const values = jellyParams(p.doc);
    for (const [k, v] of Object.entries(FROZEN[id])) expect(values[k as keyof typeof values]).toBe(v);
  });
  it('baseline variant A is the built-in document', () => {
    for (const id of PRESET_IDS) expect(VARIANTS.A!(id).doc).toEqual(JELLY_CANDIDATE_PRESETS.find((c) => c.doc.id === id)!.doc);
  });
});

describe('M6.4.3 diagnostic variants stay inside the existing schema', () => {
  it.each(docs.map((d) => [`${d.name}/${d.id}`, d] as const))('%s is a valid v2 document without warnings', (_n, d) => {
    const r = parseExperimentalJelly(d.doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
    expect(r.doc.family).toBe('jelly');
    expect(r.doc.id).toBe(d.id);
    expect(checkJellyParams(jellyParams(d.doc)).errors).toEqual([]);
    expect(parseExperimentalJelly(JSON.parse(serializeExperimentalJelly(d.doc)))).toMatchObject({ ok: true });
  });
  it('never changes the bubble seed, identifier or geometry defaults, whatever the variant', () => {
    for (const d of docs) {
      const a = VARIANTS.A!(d.id as typeof PRESET_IDS[number]).doc;
      expect(d.doc.bubbles.seed).toBe(a.bubbles.seed);
      expect(d.doc.geometry).toEqual(a.geometry);
      expect(d.doc.target).toEqual(a.target);
    }
  });
  it('motion-only variants (B2) leave every optical value equal to the baseline', () => {
    for (const id of PRESET_IDS) {
      const a = VARIANTS.A!(id).doc, b = VARIANTS.B2!(id).doc;
      expect(b.material).toEqual(a.material);
      expect(b.bubbles).toEqual(a.bubbles);
      expect(VARIANTS.B2!(id).options).toBeUndefined();
    }
  });
});

describe('M6.4.3 optics are finite and bounded for every variant', () => {
  it.each([[32], [44], [96]])('short side %i', (short) => {
    for (const d of docs) for (const opaque of [false, true]) {
      const o = jellyOptics(d.doc.material, short, opaque);
      for (const [k, v] of Object.entries(o)) if (typeof v === 'number') expect(Number.isFinite(v), `${d.name}/${d.id} ${k}`).toBe(true);
      for (const a of [o.centerAlpha, o.edgeAlpha, o.compositingAlpha, o.transmission]) { expect(a).toBeGreaterThanOrEqual(0); expect(a).toBeLessThanOrEqual(1); }
      expect(o.rimWidth).toBeGreaterThan(0);
      expect(o.rimWidth).toBeLessThanOrEqual(short / 4);
      for (const c of [o.tint, o.deepTint, o.lightTint, o.foreground]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('M6.4.3 inclusion treatment m643', () => {
  const d = VARIANTS.A!('jelly-soft').doc;
  const g = jellyGeometry(160, 44, d.geometry);
  const cands = bubbleCandidates(d.bubbles.seed, 24);
  it('is the default-free addition: omitting the treatment is exactly m642', () => {
    for (const c of cands) expect(projectBubble(c, d.bubbles, g, d.material)).toEqual(projectBubble(c, d.bubbles, g, d.material, 'm642'));
  });
  it('keeps identity, position, radius and depth of every inclusion; only the opacity differs', () => {
    for (const c of cands) {
      const a = projectBubble(c, d.bubbles, g, d.material, 'm642'), b = projectBubble(c, d.bubbles, g, d.material, 'm643');
      expect([b.index, b.x, b.y, b.radius, b.depth]).toEqual([a.index, a.x, a.y, a.radius, a.depth]);
    }
  });
  it('is deterministic, finite and never brighter than the configured opacity', () => {
    for (const doc of docs) for (const c of cands) {
      const m = doc.doc;
      const b1 = projectBubble(c, m.bubbles, g, m.material, 'm643'), b2 = projectBubble(c, m.bubbles, g, m.material, 'm643');
      expect(b1).toEqual(b2);
      expect(Number.isFinite(b1.opacity)).toBe(true);
      expect(b1.opacity).toBeGreaterThanOrEqual(0);
      expect(b1.opacity).toBeLessThanOrEqual(m.bubbles.opacity);
    }
  });
  it('protects the label area continuously: no step in opacity across the old band edges', () => {
    // Same candidate moved across x = 0.18 (the m642 band edge): m642 drops by 62 % in one step, m643 changes smoothly.
    const base = { index: 0, y: 0.5, size: 0.5, depth: 0.5 };
    const at = (x: number, t: 'm642' | 'm643') => projectBubble({ ...base, x }, d.bubbles, g, d.material, t).opacity;
    const jump = (t: 'm642' | 'm643') => Math.abs(at(0.1801, t) - at(0.1799, t)) / at(0.1799, t);
    expect(jump('m642')).toBeGreaterThan(0.5);
    expect(jump('m643')).toBeLessThan(0.01);
    // and the centre is still the most protected point
    expect(at(0.5, 'm643')).toBeLessThan(at(0.9, 'm643') * 0.5);
  });
  it('moves with the surface: the same map as the outline under every pose', () => {
    for (const pose of [-0.15, -0.0155, 0, 0.0417, 0.0733, 0.15]) {
      const gp = jellyGeometry(160, 44, d.geometry, undefined, { displacement: pose, contact: { x: 0.9, y: 0.2 } });
      for (const c of cands) {
        const b = projectBubble(c, d.bubbles, gp, d.material, 'm643'), p = surfacePoint(gp, c.x * 160, c.y * 44);
        expect([b.x, b.y]).toEqual([p.x, p.y]);
        expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
      }
      if (pose === 0) for (const c of cands) expect(projectBubble(c, d.bubbles, gp, d.material, 'm643')).toMatchObject({ x: c.x * 160, y: c.y * 44 });
    }
  });
});

describe('M6.4.3 motion candidates (B2) behave like the baseline family', () => {
  const run = (id: typeof PRESET_IDS[number], variant: string) => {
    const b = VARIANTS[variant]!(id).doc.behavior;
    let s = pressJellyMotion(initJellyMotion(b, 0), true, 0);
    let peak = 0;
    for (let t = 1; t <= 600; t++) { s = evolveJellyMotion(s, t); peak = Math.max(peak, Math.abs(s.x)); }
    s = pressJellyMotion(s, false, 600);
    let swing = 0, rest: number | null = null;
    for (let t = 601; t <= 3600; t++) {
      s = evolveJellyMotion(s, t);
      expect(Number.isFinite(s.x) && Number.isFinite(s.v)).toBe(true);
      if (s.x < 0) swing = Math.max(swing, -s.x);
      if (rest === null && jellyMotionSettled(s)) rest = t - 600;
    }
    return { b, peak, swing, rest };
  };
  it.each(PRESET_IDS)('%s: same input, same result, bounded, settles', (id) => {
    for (const v of ['A', 'B2']) {
      const r1 = run(id, v), r2 = run(id, v);
      expect(r1).toEqual(r2);
      expect(r1.peak).toBeLessThanOrEqual(r1.b.maxDeformation);
      expect(r1.rest).not.toBeNull();
    }
  });
  it('keeps the family ordering: Candy bounces most, Dense never, Dense is quickest to rest', () => {
    for (const v of ['A', 'B2']) {
      const [soft, clear, candy, dense] = PRESET_IDS.map((id) => run(id, v));
      expect(candy!.swing).toBeGreaterThan(soft!.swing);
      expect(candy!.swing).toBeGreaterThan(clear!.swing);
      expect(dense!.swing).toBe(0);
      expect(dense!.rest!).toBeLessThan(candy!.rest!);
    }
  });
  it('makes Soft and Clear mechanically distinct (they are identical in the baseline)', () => {
    const a = [run('jelly-soft', 'A'), run('jelly-clear', 'A')], b = [run('jelly-soft', 'B2'), run('jelly-clear', 'B2')];
    expect(a[0]!.rest).toBe(a[1]!.rest);
    expect(b[0]!.rest).not.toBe(b[1]!.rest);
  });
  it('keeps Candy exactly as shipped (§6.2)', () => {
    expect(VARIANTS.B2!('jelly-candy').doc.behavior).toEqual(VARIANTS.A!('jelly-candy').doc.behavior);
  });
});
