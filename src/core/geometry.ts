/**
 * Lens geometry: a pure, deterministic description of how the glass bends
 * the content behind it. No DOM, no randomness, no access to the background.
 *
 * Coordinates are CSS pixels relative to the lens centre; y grows downwards.
 * A displacement vector v tells the renderer to sample the source at
 *   P + refraction · v
 * where `refraction` (px) is applied by the renderer, not baked into the map.
 * Components of v are normalized to [-1, 1].
 *
 * The same functions are meant to be ported 1:1 to AGSL (see docs/android.md);
 * tests/unit/geometry.test.ts holds the reference cases.
 */

import type { Profile } from './params';

export interface LensGeometry {
  width: number;
  height: number;
  /** Corner radius, clamped to half the shorter side. */
  radius: number;
  /** Width of the curved perimeter band, px. */
  band: number;
  profile: Profile;
  /** Centre magnification, 0 = neutral centre. */
  dome: number;
}

export interface Displacement {
  dx: number;
  dy: number;
  /** Shape coverage in [0, 1], anti-aliased over one map pixel. */
  coverage: number;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export function clampRadius(width: number, height: number, radius: number): number {
  return clamp(radius, 0, Math.min(width, height) / 2);
}

/** Signed distance to a rounded rectangle centred at the origin (negative inside). */
export function sdRoundedRect(px: number, py: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px) - hw + r;
  const qy = Math.abs(py) - hh + r;
  const ox = qx > 0 ? qx : 0;
  const oy = qy > 0 ? qy : 0;
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

/**
 * Outward unit normal of the rounded rectangle at the nearest boundary.
 * `r` should be at least the band width (see `normalRadius`) so the field is
 * continuous across the band; it is only discontinuous on the medial axis.
 */
export function normalRoundedRect(px: number, py: number, hw: number, hh: number, r: number): [number, number] {
  const qx = Math.abs(px) - hw + r;
  const qy = Math.abs(py) - hh + r;
  const sx = px < 0 ? -1 : 1;
  const sy = py < 0 ? -1 : 1;
  if (qx > 0 && qy > 0) {
    const len = Math.hypot(qx, qy);
    return [(qx / len) * sx, (qy / len) * sy];
  }
  if (qx > 0) return [sx, 0];
  if (qy > 0) return [0, sy];
  // Inner rectangle (deeper than r): pick the closer side.
  return qx > qy ? [sx, 0] : [0, sy];
}

/**
 * Radius used for the normal field. Using the real corner radius would create
 * a crease along the corner diagonal whenever band > radius; a rounder field
 * keeps the deviation smooth while the outline keeps the real radius.
 */
export function normalRadius(g: LensGeometry): number {
  const half = Math.min(g.width, g.height) / 2;
  return clamp(Math.max(g.radius, g.band * 1.25), 0, half);
}

/** Profile value for t ∈ [0, 1]: 1 on the outline, 0 at the inner end of the band. */
export function profileValue(profile: Profile, t: number): number {
  const x = clamp(t, 0, 1);
  switch (profile) {
    case 'circle':
      return 1 - Math.sqrt(1 - x * x);
    case 'smooth':
      return x * x * (3 - 2 * x);
    case 'linear':
      return x;
    case 'bump': {
      const s = Math.sin(Math.PI * x);
      return s * s;
    }
  }
}

/** Normalized displacement at a point. Pure; used by the map and by tests. */
export function displacementAt(g: LensGeometry, px: number, py: number, pixel = 1): Displacement {
  const hw = g.width / 2;
  const hh = g.height / 2;
  const r = clampRadius(g.width, g.height, g.radius);
  const sd = sdRoundedRect(px, py, hw, hh, r);
  const coverage = clamp(0.5 - sd / pixel, 0, 1);
  if (coverage === 0) return { dx: 0, dy: 0, coverage: 0 };
  const depth = -sd;
  const band = Math.max(1e-3, g.band);
  let dx = 0;
  let dy = 0;
  if (depth < band) {
    const f = profileValue(g.profile, 1 - Math.max(0, depth) / band);
    const [nx, ny] = normalRoundedRect(px, py, hw, hh, normalRadius(g));
    dx = nx * f;
    dy = ny * f;
  }
  if (g.dome > 0) {
    // Sampling toward the centre magnifies it. Fades to zero on the outline
    // so the dome never fights the rim deviation at the very edge.
    const fade = clamp(depth / band, 0, 1);
    dx -= g.dome * (px / hw) * fade;
    dy -= g.dome * (py / hh) * fade;
  }
  return { dx: clamp(dx, -1, 1), dy: clamp(dy, -1, 1), coverage };
}

export interface LensMap {
  width: number;
  height: number;
  /** RGBA: R = x, G = y (128 = neutral), B = coverage, A = 255. */
  data: Uint8ClampedArray;
}

export const NEUTRAL = 128;

export const encode = (v: number) => Math.round(NEUTRAL + 127 * clamp(v, -1, 1));
export const decode = (c: number) => (c - NEUTRAL) / 127;

/**
 * Rasterizes the displacement field. The map is opaque everywhere: alpha is
 * never used to carry data, because displacement maps are read
 * un-premultiplied and transparent pixels would lose their colour.
 * The shape lives in the blue channel instead.
 *
 * The field is symmetric in both axes, so only one quadrant is evaluated and
 * mirrored (x negated across the vertical axis, y across the horizontal one).
 */
export function computeLensMap(g: LensGeometry, resolution = 1): LensMap {
  const width = Math.max(1, Math.ceil(g.width * resolution));
  const height = Math.max(1, Math.ceil(g.height * resolution));
  const data = new Uint8ClampedArray(width * height * 4);
  const sx = g.width / width;
  const sy = g.height / height;
  const pixel = Math.max(sx, sy);
  const halfCols = Math.ceil(width / 2);
  const halfRows = Math.ceil(height / 2);
  for (let row = 0; row < halfRows; row++) {
    const py = (row + 0.5) * sy - g.height / 2;
    const mirrorRow = height - 1 - row;
    for (let col = 0; col < halfCols; col++) {
      const px = (col + 0.5) * sx - g.width / 2;
      const mirrorCol = width - 1 - col;
      const d = displacementAt(g, px, py, pixel);
      const b = Math.round(d.coverage * 255);
      // Evaluated in the top-left quadrant; mirrored copies flip the sign.
      const xLeft = encode(d.dx);
      const xRight = encode(-d.dx);
      const yTop = encode(d.dy);
      const yBottom = encode(-d.dy);
      write(data, (row * width + col) * 4, xLeft, yTop, b);
      write(data, (row * width + mirrorCol) * 4, xRight, yTop, b);
      write(data, (mirrorRow * width + col) * 4, xLeft, yBottom, b);
      write(data, (mirrorRow * width + mirrorCol) * 4, xRight, yBottom, b);
    }
  }
  return { width, height, data };
}

function write(data: Uint8ClampedArray, i: number, r: number, g: number, b: number) {
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = 255;
}

/** Reads back the map at a lens-centred CSS position (nearest pixel). */
export function sampleLensMap(map: LensMap, g: LensGeometry, px: number, py: number): Displacement {
  const col = clamp(Math.floor(((px + g.width / 2) / g.width) * map.width), 0, map.width - 1);
  const row = clamp(Math.floor(((py + g.height / 2) / g.height) * map.height), 0, map.height - 1);
  const i = (row * map.width + col) * 4;
  return {
    dx: decode(map.data[i] ?? NEUTRAL),
    dy: decode(map.data[i + 1] ?? NEUTRAL),
    coverage: (map.data[i + 2] ?? 0) / 255,
  };
}

/** Cache key: only what changes the map. Position and scale never appear here. */
export function geometryKey(g: LensGeometry, resolution = 1): string {
  const r = clampRadius(g.width, g.height, g.radius);
  const q = (v: number) => Math.round(v * 100) / 100;
  return [q(g.width), q(g.height), q(r), q(g.band), g.profile, q(g.dome), q(resolution)].join('|');
}
