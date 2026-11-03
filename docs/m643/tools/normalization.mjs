#!/usr/bin/env node
/**
 * §11 normalized-tint distinctiveness: pairwise mean |Δ| (0-255, mean of RGB) over the Button area between the four presets,
 * from the committed sheets in screenshots/normalized-tint (same tint, label colour, size, background, state, scale).
 *   node docs/m643/tools/normalization.mjs [outJson]
 * A design aid: a small number means the two treatments are hard to tell apart in that state, not that anything is wrong.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { PAD, PRESETS, SIZES, STATES } from './lib.mjs';
const dir = new URL('../screenshots/normalized-tint/', import.meta.url).pathname;
const rows = [];
for (const variant of ['N', 'NB3']) for (const size of Object.keys(SIZES)) for (const bg of ['light', 'dark', 'gradient']) {
  const img = PNG.sync.read(readFileSync(`${dir}${variant}_${size}_${bg}_dpr1.png`));
  const [w, h] = SIZES[size], cw = w + 2 * PAD, ch = h + 2 * PAD;
  for (const state of ['idle', 'hold']) {
    const col = STATES.indexOf(state);
    const cell = (row) => { const out = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = ((row * ch + PAD + y) * img.width + col * cw + PAD + x) * 4; out.push(img.data[i], img.data[i + 1], img.data[i + 2]); } return out; };
    const cells = PRESETS.map((_, r) => cell(r));
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      let d = 0; for (let i = 0; i < cells[a].length; i++) d += Math.abs(cells[a][i] - cells[b][i]);
      rows.push({ variant, size, bg, state, pair: `${PRESETS[a].slice(6)}/${PRESETS[b].slice(6)}`, meanDelta: +(d / cells[a].length).toFixed(2) });
    }
  }
}
const summary = {};
for (const variant of ['N', 'NB3']) for (const pair of new Set(rows.map((r) => r.pair))) {
  const sel = rows.filter((r) => r.variant === variant && r.pair === pair && r.state === 'idle');
  summary[`${variant} ${pair}`] = { idleMean: +(sel.reduce((s, r) => s + r.meanDelta, 0) / sel.length).toFixed(2), idleMin: Math.min(...sel.map((r) => r.meanDelta)) };
}
console.table(summary);
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({ summary, rows }, null, 1)}\n`);
