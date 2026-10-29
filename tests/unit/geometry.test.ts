import { describe, expect, it } from 'vitest';
import {
  computeLensMap,
  decode,
  displacementAt,
  encode,
  geometryKey,
  normalRoundedRect,
  profileValue,
  sampleLensMap,
  sdRoundedRect,
  type LensGeometry,
} from '../../src/core/geometry';

const capsule: LensGeometry = { width: 280, height: 104, radius: 52, band: 26, profile: 'circle', dome: 0 };

describe('signed distance', () => {
  it('is negative inside, zero on the outline, positive outside', () => {
    expect(sdRoundedRect(0, 0, 140, 52, 52)).toBeCloseTo(-52);
    expect(sdRoundedRect(0, -52, 140, 52, 52)).toBeCloseTo(0);
    expect(sdRoundedRect(140, 0, 140, 52, 52)).toBeCloseTo(0);
    expect(sdRoundedRect(0, -60, 140, 52, 52)).toBeCloseTo(8);
  });

  it('follows the rounded corner', () => {
    // Corner centre at (88, 0) for a capsule; a point at 45° on the arc.
    const c = 88;
    const a = Math.PI / 4;
    expect(sdRoundedRect(c + 52 * Math.cos(a), -52 * Math.sin(a), 140, 52, 52)).toBeCloseTo(0, 6);
  });
});

describe('normal field', () => {
  it('points outward on straight edges and radially in corners', () => {
    expect(normalRoundedRect(0, -50, 140, 52, 52)).toEqual([0, -1]);
    expect(normalRoundedRect(0, 50, 140, 52, 52)).toEqual([0, 1]);
    const [nx, ny] = normalRoundedRect(130, -20, 140, 52, 52);
    expect(nx).toBeGreaterThan(0);
    expect(ny).toBeLessThan(0);
    expect(Math.hypot(nx, ny)).toBeCloseTo(1);
  });
});

describe('profiles', () => {
  it('are 1 on the outline and 0 at the inner end of the band', () => {
    for (const p of ['circle', 'smooth', 'linear'] as const) {
      expect(profileValue(p, 1)).toBeCloseTo(1);
      expect(profileValue(p, 0)).toBeCloseTo(0);
    }
    // bump peaks at mid-band and vanishes on both ends.
    expect(profileValue('bump', 0.5)).toBeCloseTo(1);
    expect(profileValue('bump', 1)).toBeCloseTo(0);
  });

  it('circle stays flat near the inner end (smooth transition to the neutral centre)', () => {
    expect(profileValue('circle', 0.1)).toBeLessThan(0.01);
    expect(profileValue('circle', 0.9)).toBeGreaterThan(0.5);
  });
});

describe('displacement', () => {
  it('is zero in the centre and outside the band (dome = 0)', () => {
    expect(displacementAt(capsule, 0, 0)).toMatchObject({ dx: 0, dy: 0, coverage: 1 });
    // 30px deep on the top edge: deeper than the 26px band.
    const d = displacementAt(capsule, 0, -52 + 30);
    expect(d.dx).toBe(0);
    expect(d.dy).toBe(0);
  });

  it('is strongest at the outline and points outward', () => {
    const top = displacementAt(capsule, 0, -51.5);
    expect(top.dy).toBeLessThan(-0.8);
    const bottom = displacementAt(capsule, 0, 51.5);
    expect(bottom.dy).toBeGreaterThan(0.8);
    const right = displacementAt(capsule, 139.5, 0);
    expect(right.dx).toBeGreaterThan(0.8);
    const mid = displacementAt(capsule, 0, -52 + 13);
    expect(Math.abs(mid.dy)).toBeLessThan(Math.abs(top.dy));
  });

  it('is zero outside the shape and anti-aliased on the outline', () => {
    expect(displacementAt(capsule, 0, -60).coverage).toBe(0);
    expect(displacementAt(capsule, 0, -52).coverage).toBeCloseTo(0.5);
  });

  it('dome adds centre magnification only when requested', () => {
    const g = { ...capsule, dome: 0.5 };
    const d = displacementAt(g, 40, -10);
    expect(d.dx).toBeLessThan(0);
    expect(d.dy).toBeGreaterThan(0);
    expect(displacementAt(g, 0, 0).dx).toBeCloseTo(0);
  });

  it('is symmetric in both axes', () => {
    const a = displacementAt(capsule, 120, -40);
    const b = displacementAt(capsule, -120, 40);
    expect(b.dx).toBeCloseTo(-a.dx);
    expect(b.dy).toBeCloseTo(-a.dy);
  });

  it('has no crease on corner diagonals when band > radius', () => {
    const g: LensGeometry = { width: 200, height: 120, radius: 8, band: 30, profile: 'linear', dome: 0 };
    // Walk along the bisector of the top-left corner; direction must vary smoothly.
    let prev: number | null = null;
    for (let t = 2; t < 28; t += 1) {
      const d = displacementAt(g, -100 + t, -60 + t);
      const angle = Math.atan2(d.dy, d.dx);
      if (prev !== null) expect(Math.abs(angle - prev)).toBeLessThan(0.2);
      prev = angle;
    }
  });
});

describe('lens map', () => {
  it('matches the analytic field (quadrant mirroring is exact)', () => {
    const map = computeLensMap(capsule);
    expect(map.width).toBe(280);
    expect(map.height).toBe(104);
    for (const [x, y] of [
      [-139, 0],
      [139, 0],
      [0, -51],
      [0, 51],
      [-120, -40],
      [120, 40],
      [60, -45],
    ] as const) {
      const col = Math.floor(x + 140);
      const row = Math.floor(y + 52);
      const cx = col + 0.5 - 140;
      const cy = row + 0.5 - 52;
      const expected = displacementAt(capsule, cx, cy);
      const got = sampleLensMap(map, capsule, x, y);
      expect(got.dx).toBeCloseTo(expected.dx, 1);
      expect(got.dy).toBeCloseTo(expected.dy, 1);
    }
  });

  it('is opaque and neutral where there is no displacement', () => {
    const map = computeLensMap(capsule);
    const centre = ((52 * 280 + 140) * 4) as number;
    expect([...map.data.slice(centre, centre + 4)]).toEqual([128, 128, 255, 255]);
    // Outside the rounded corner: neutral colour, zero coverage, still opaque.
    expect([...map.data.slice(0, 4)]).toEqual([128, 128, 0, 255]);
  });

  it('handles odd sizes and fractional resolution', () => {
    const g = { ...capsule, width: 101, height: 41, radius: 20.5, band: 10 };
    const map = computeLensMap(g, 1.5);
    expect(map.width).toBe(152);
    expect(map.height).toBe(62);
    expect(map.data.length).toBe(152 * 62 * 4);
  });

  it('round-trips the 8-bit encoding', () => {
    for (const v of [-1, -0.5, 0, 0.25, 1]) expect(decode(encode(v))).toBeCloseTo(v, 2);
    expect(encode(0)).toBe(128);
  });

  it('cache key ignores position and depends only on geometry', () => {
    expect(geometryKey(capsule)).toBe(geometryKey({ ...capsule }));
    expect(geometryKey(capsule)).not.toBe(geometryKey({ ...capsule, band: 27 }));
    expect(geometryKey(capsule)).not.toBe(geometryKey({ ...capsule, width: 281 }));
    // Radius beyond the half side clamps to the same shape.
    expect(geometryKey({ ...capsule, radius: 999 })).toBe(geometryKey(capsule));
  });

  it('is deterministic', () => {
    const a = computeLensMap(capsule);
    const b = computeLensMap(capsule);
    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });
});

describe('reference cases for other renderers (docs/android/geometry-cases.json)', () => {
  it('match the current implementation', async () => {
    const { readFileSync } = await import('node:fs');
    const doc = JSON.parse(readFileSync(new URL('../../docs/android/geometry-cases.json', import.meta.url), 'utf8')) as {
      tolerance: number;
      profiles: Record<string, number[]>;
      cases: { geometry: LensGeometry; samples: { x: number; y: number; dx: number; dy: number; coverage: number }[] }[];
    };
    for (const [p, values] of Object.entries(doc.profiles)) {
      values.forEach((v, i) => expect(profileValue(p as LensGeometry['profile'], i / 4)).toBeCloseTo(v, 4));
    }
    for (const c of doc.cases) {
      for (const s of c.samples) {
        const d = displacementAt(c.geometry, s.x, s.y);
        expect(Math.abs(d.dx - s.dx)).toBeLessThan(doc.tolerance);
        expect(Math.abs(d.dy - s.dy)).toBeLessThan(doc.tolerance);
        expect(Math.abs(d.coverage - s.coverage)).toBeLessThan(doc.tolerance);
      }
    }
  });
});
