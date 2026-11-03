#!/usr/bin/env node
/**
 * M6.4.2 §15.3: compare two screenshot directories made by scripts/m642-screenshots.mjs (baseline vs candidate).
 *
 *   node scripts/m642-compare.mjs <baselineDir> <candidateDir> [out.json]
 *
 * For each shot: identical / changed (share of pixels whose largest channel delta exceeds NOISE, and the bounding box of
 * the change) / only in one side / size mismatch. Writes JSON and prints a table. It decides NOTHING: a changed shot
 * stays "unreviewed" until docs/m642/visual-review.md says why it changed and whether the change is approved. A
 * baseline is never overwritten from this script.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const [base, cand, outFile] = process.argv.slice(2);
if (!base || !cand) { console.error('usage: m642-compare.mjs <baselineDir> <candidateDir> [out.json]'); process.exit(2); }
const NOISE = 12; // per-channel delta of 255: sub-pixel text anti-aliasing measured at ≤ 7 (see tests/e2e/m642-control-effect.spec.ts)
const read = (d) => JSON.parse(readFileSync(`${d}/manifest.json`, 'utf8'));
const a = read(base), b = read(cand);
const A = new Map(a.shots.map((s) => [s.file, s])), B = new Map(b.shots.map((s) => [s.file, s]));
const rows = [];
for (const file of [...new Set([...A.keys(), ...B.keys()])].sort()) {
  if (!A.has(file)) { rows.push({ file, status: 'only-in-candidate', what: B.get(file).what }); continue; }
  if (!B.has(file)) { rows.push({ file, status: 'only-in-baseline', what: A.get(file).what }); continue; }
  const x = PNG.sync.read(readFileSync(`${base}/${file}`)), y = PNG.sync.read(readFileSync(`${cand}/${file}`));
  if (x.width !== y.width || x.height !== y.height) { rows.push({ file, status: 'size-differs', baseline: `${x.width}x${y.height}`, candidate: `${y.width}x${y.height}`, what: B.get(file).what }); continue; }
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let py = 0; py < x.height; py++) for (let px = 0; px < x.width; px++) {
    const i = (py * x.width + px) * 4;
    if (Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2])) > NOISE) { n++; x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
  }
  rows.push(n === 0 ? { file, status: 'identical', what: B.get(file).what } : { file, status: 'changed', changedPixels: n, changedShare: +(100 * n / (x.width * x.height)).toFixed(3), bbox: [x0, y0, x1, y1], what: B.get(file).what, review: 'unreviewed' });
}
const summary = Object.fromEntries(['identical', 'changed', 'only-in-baseline', 'only-in-candidate', 'size-differs'].map((s) => [s, rows.filter((r) => r.status === s).length]));
const result = { baseline: { dir: base, base: a.base, generated: a.generated }, candidate: { dir: cand, base: b.base, generated: b.generated }, noise: NOISE, summary, rows };
if (outFile) writeFileSync(outFile, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(summary));
for (const r of rows.filter((r) => r.status !== 'identical')) console.log(`${r.status.padEnd(18)} ${r.file}${r.changedShare !== undefined ? `  ${r.changedShare}% bbox ${r.bbox.join(',')}` : ''}`);
