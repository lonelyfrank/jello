#!/usr/bin/env node
/**
 * Default-treatment regression: re-renders baseline A with the CURRENT runtime and compares decoded pixels with the committed
 * baseline sheets (captured on origin/main 0582f65 before any runtime change). Any differing pixel is reported, not accepted.
 *   node docs/m643/tools/regression-check.mjs [outJson]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { BGS, ENGINES, SIZES, openPage, sheet } from './lib.mjs';
const base = new URL('../screenshots/baseline/', import.meta.url).pathname;
const browser = await ENGINES.chromium.launch();
const rows = [];
for (const dpr of [1, 2]) {
  const { ctx, page } = await openPage(browser, dpr);
  for (const size of Object.keys(SIZES)) for (const bg of BGS) {
    const file = `${base}A_${size}_${bg}_dpr${dpr}.png`;
    if (!existsSync(file)) continue;
    const now = PNG.sync.read(await (await sheet(page, { variant: 'A', size, bg })).screenshot({ animations: 'disabled' }));
    const was = PNG.sync.read(readFileSync(file));
    let diff = 0, max = 0;
    if (now.width !== was.width || now.height !== was.height) diff = -1;
    else for (let i = 0; i < now.data.length; i += 4) { const d = Math.max(Math.abs(now.data[i] - was.data[i]), Math.abs(now.data[i + 1] - was.data[i + 1]), Math.abs(now.data[i + 2] - was.data[i + 2])); if (d) { diff++; max = Math.max(max, d); } }
    rows.push({ file: `A_${size}_${bg}_dpr${dpr}.png`, differingPixels: diff, maxChannelDelta: max });
  }
  await ctx.close();
}
await browser.close();
const total = rows.reduce((s, r) => s + Math.max(0, r.differingPixels), 0);
console.log(`${rows.length} sheets compared, differing pixels: ${total}`);
if (total) console.table(rows.filter((r) => r.differingPixels));
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({ baselineCommit: '0582f65e6fc6f1a27778f7e33faf21e154749346', sheets: rows.length, differingPixels: total, rows }, null, 1)}\n`);
