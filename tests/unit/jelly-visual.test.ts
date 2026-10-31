import { describe, expect, it } from 'vitest';
import { defaultJellyParams, splitJellyParams } from '../../src/model/experimental/jelly';
import { JELLY_CANDIDATE_PRESETS } from '../../src/model/experimental/jelly-presets';
import { bubbleCandidates, bubbleCount, jellyGeometry, jellyOptics, mulberry32, opticalQuality, projectBubble } from '../../src/model/experimental/jelly-visual';

const sections = () => splitJellyParams(defaultJellyParams());

describe('Jelly deterministic inclusions (Node, no DOM)', () => {
  it.each([
    [0, [1144304738, 1416247, 958946056, 627933444, 2007157716]],
    [1, [2693262067, 11749833, 2265367787, 4213581821, 4159151403]],
    [4294967295, [3850105811, 813802916, 3073704848, 4054706436, 3630262831]],
  ] as const)('matches uint32 Mulberry32 vectors for seed %i', (seed, expected) => {
    const random = mulberry32(seed);
    expect(expected.map(() => random()*4294967296)).toEqual(expected);
  });
  it('uses area in CSS pixels, floor, true disabled cost and the specified quality caps', () => {
    const { bubbles } = sections();
    expect(bubbleCount(bubbles, 240, 64, 'medium')).toBe(3);
    expect(bubbleCount(bubbles, 96, 48, 'medium')).toBe(0);
    for (const [quality, cap] of [['high', 24], ['medium', 12], ['low', 4]] as const) {
      expect(bubbleCount({ ...bubbles, density: 20 }, 400, 200, quality)).toBe(cap);
    }
    for (const b of [{ ...bubbles, density: 0 }, { ...bubbles, enabled: 'disabled' as const }]) expect(bubbleCount(b, 400, 200, 'high')).toBe(0);
    for (const size of [0, -1, Infinity, NaN]) expect(bubbleCount(bubbles, size, 64, 'high')).toBe(0);
    expect(opticalQuality('static')).toBe('medium');
    expect(opticalQuality('auto')).toBe('medium');
  });
  it('retains stable identities and prefix across quality/resize, with bounded radii and depth', () => {
    const { bubbles, geometry, material } = sections();
    const candidates = bubbleCandidates(0, 24);
    expect(bubbleCandidates(0, 4)).toEqual(candidates.slice(0, 4));
    expect(bubbleCandidates(0, 12)).toEqual(candidates.slice(0, 12));
    const before = structuredClone(candidates);
    for (const c of candidates) {
      expect(c.index).toBeGreaterThanOrEqual(0);
      for (const n of [c.x, c.y, c.size, c.depth]) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(1); }
      const small = projectBubble(c, bubbles, jellyGeometry(100, 50, geometry), material);
      const big = projectBubble(c, bubbles, jellyGeometry(200, 100, geometry), material);
      expect(big.x).toBe(small.x*2);
      expect(big.y).toBe(small.y*2);
      expect(big.radius).toBe(small.radius);
      expect(big.radius).toBeGreaterThanOrEqual(bubbles.radiusMin*0.65);
      expect(big.radius).toBeLessThanOrEqual(bubbles.radiusMax);
      expect(big.depth).toBeGreaterThanOrEqual(bubbles.depthMin);
      expect(big.depth).toBeLessThanOrEqual(bubbles.depthMax);
    }
    expect(candidates).toEqual(before);
  });
  it('depth reduces apparent radius and contrast without affecting identity or position', () => {
    const { bubbles, geometry, material } = sections();
    const c = bubbleCandidates(7, 1)[0]!;
    const g = jellyGeometry(240, 64, geometry);
    const front = projectBubble(c, { ...bubbles, depthMin: 0, depthMax: 0 }, g, material);
    const back = projectBubble(c, { ...bubbles, depthMin: 1, depthMax: 1 }, g, material);
    expect(back.radius).toBeCloseTo(front.radius*0.65);
    expect(back.opacity).toBeLessThan(front.opacity);
    expect([back.index, back.x, back.y]).toEqual([front.index, front.x, front.y]);
  });
});

describe('Jelly geometry and optical profile', () => {
  it('clamps rounded/capsule and gives explicit host geometry precedence without mutation', () => {
    const { geometry } = sections();
    const before = { ...geometry };
    expect(jellyGeometry(96, 48, { ...geometry, radius: 120 }).radius).toBe(24);
    expect(jellyGeometry(180, 56, { ...geometry, shape: 'capsule' }).radius).toBe(28);
    expect(jellyGeometry(180, 56, { ...geometry, shape: 'capsule' }, 4).radius).toBe(4);
    expect(jellyGeometry(0, 0, geometry).path).not.toMatch(/NaN|Infinity/);
    expect(jellyGeometry(1000, 20, geometry).radius).toBe(10);
    expect(jellyGeometry(240, 64, geometry, undefined, 1).pose).toBe(0.05);
    expect(geometry).toEqual(before);
  });
  it('implements RFC alpha/transmission distinctly and gives opaque a known contrast pair', () => {
    const { material: m } = sections();
    const o = jellyOptics(m, 64);
    expect(o.centerAlpha).toBeCloseTo(1-m.transmission*Math.exp(-m.absorption*m.thickness)*(1-m.scattering));
    expect(o.compositingAlpha).toBe(m.bodyOpacity);
    expect(jellyOptics({ ...m, bodyOpacity: 0 }, 64).compositingAlpha).toBe(0);
    expect(jellyOptics({ ...m, transmission: 0 }, 64).centerAlpha).toBe(1);
    expect(jellyOptics(m, 64, true)).toMatchObject({ centerAlpha: 1, edgeAlpha: 1, transmission: 0, compositingAlpha: 1, foreground: '#211735', tint: '#b8a2e8' });
  });
  it('has finite monotonic optical effects and bounded extremes without mutation', () => {
    const { material: m } = sections();
    const before = { ...m };
    for (const thickness of [0, 1]) for (const absorption of [0, 4]) for (const scattering of [0, 1]) for (const edgeFalloff of [0.5, 4]) {
      const o = jellyOptics({ ...m, thickness, absorption, scattering, edgeFalloff }, 0);
      for (const value of Object.values(o)) if (typeof value === 'number') expect(Number.isFinite(value)).toBe(true);
      expect(o.centerAlpha).toBeGreaterThanOrEqual(0);
      expect(o.edgeAlpha).toBeLessThanOrEqual(1);
    }
    const base = jellyOptics(m, 64);
    for (const patch of [{ absorption: 4 }, { thickness: 1 }, { scattering: 1 }, { transmission: 0 }]) expect(jellyOptics({ ...m, ...patch }, 64).centerAlpha).toBeGreaterThan(base.centerAlpha);
    expect(jellyOptics({ ...m, roughness: 1 }, 64).highlightSpread).toBeGreaterThan(base.highlightSpread);
    expect(jellyOptics({ ...m, roughness: 1 }, 64).highlight).toBeLessThan(base.highlight);
    expect(jellyOptics({ ...m, edgeFalloff: 4 }, 64).edgeStop).not.toBe(base.edgeStop);
    expect(jellyOptics({ ...m, elevation: 0 }, 64).shadowOpacity).toBe(0);
    expect(m).toEqual(before);
  });
  it.each(JELLY_CANDIDATE_PRESETS)('$doc.name provides static state feedback in the material itself', ({ doc }) => {
    for (const state of Object.values(doc.states)) expect(Object.keys(state).length).toBeGreaterThan(0);
    expect(doc.states.pressed.tint).not.toBe(doc.material.tint);
    expect(doc.states.active.tint).not.toBe(doc.material.tint);
    expect(doc.states.disabled.foreground).not.toBe(doc.material.foreground);
  });
});
