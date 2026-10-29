#!/usr/bin/env node
/**
 * Writes reference values of the lens geometry (docs/android/geometry-cases.json).
 * A future Kotlin/AGSL renderer must reproduce them within the stated tolerance.
 * Requires Node ≥ 22.6 (type stripping): node --experimental-strip-types scripts/geometry-cases.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
const { displacementAt, profileValue, sdRoundedRect, geometryKey } = await import('../src/core/geometry.ts');

const geometries = {
  capsule: { width: 280, height: 104, radius: 52, band: 26, profile: 'circle', dome: 0 },
  rounded: { width: 200, height: 120, radius: 8, band: 30, profile: 'linear', dome: 0 },
  btNavbar: { width: 360, height: 58, radius: 29, band: 12, profile: 'bump', dome: 0 },
  dome: { width: 280, height: 104, radius: 52, band: 26, profile: 'smooth', dome: 0.5 },
};
const points = [[0, 0], [0, -51.5], [0, 51.5], [139.5, 0], [-139.5, 0], [120, -40], [-120, 40], [60, -45], [0, -39], [40, -10], [-95, -55], [10, 25]];
const r = (v) => Math.round(v * 1e6) / 1e6;
const cases = Object.entries(geometries).map(([name, g]) => ({
  name,
  geometry: g,
  key: geometryKey(g),
  samples: points.map(([x, y]) => {
    const d = displacementAt(g, x, y);
    return { x, y, sd: r(sdRoundedRect(x, y, g.width / 2, g.height / 2, Math.min(g.radius, g.width / 2, g.height / 2))), dx: r(d.dx), dy: r(d.dy), coverage: r(d.coverage) };
  }),
}));
const profiles = Object.fromEntries(['circle', 'smooth', 'linear', 'bump'].map((p) => [p, [0, 0.25, 0.5, 0.75, 1].map((t) => r(profileValue(p, t)))]));
mkdirSync('docs/android', { recursive: true });
writeFileSync('docs/android/geometry-cases.json', JSON.stringify({ tolerance: 1e-4, units: 'CSS px / dp, origin at lens centre, y down', profiles, cases }, null, 2) + '\n');
console.log('docs/android/geometry-cases.json', cases.length, 'geometries');
