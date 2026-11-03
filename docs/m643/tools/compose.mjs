#!/usr/bin/env node
/**
 * Stacks, for one preset, the same row (all states) of several variants' sheets: A on top, then B1, (B2), B3.
 * Output: screenshots/comparison/compare_<preset>_<size>_<bg>.png ; rows top→bottom = variants in the order given.
 *   node docs/m643/tools/compose.mjs [variants=A,B1,B3]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { PAD, PRESETS, SIZES } from './lib.mjs';
const S = new URL('../screenshots/', import.meta.url).pathname;
const variants = (process.argv[2] ?? 'A,B1,B3').split(',');
const dirOf = (v) => (v === 'A' ? 'baseline' : 'candidates');
mkdirSync(`${S}comparison`, { recursive: true });
let n = 0;
for (const [size, [w, h]] of Object.entries(SIZES)) for (const bg of ['light', 'dark']) {
  const sheets = variants.map((v) => { const p = `${S}${dirOf(v)}/${v}_${size}_${bg}_dpr1.png`; return existsSync(p) ? PNG.sync.read(readFileSync(p)) : null; });
  if (sheets.some((s) => !s)) continue;
  const rowH = h + 2 * PAD;
  PRESETS.forEach((preset, row) => {
    const width = sheets[0].width, out = new PNG({ width, height: rowH * sheets.length });
    sheets.forEach((s, i) => PNG.bitblt(s, out, 0, row * rowH, width, rowH, 0, i * rowH));
    writeFileSync(`${S}comparison/compare_${preset.slice(6)}_${size}_${bg}_${variants.join('-')}.png`, PNG.sync.write(out));
    n++;
  });
}
console.log(`${n} comparison images`);
