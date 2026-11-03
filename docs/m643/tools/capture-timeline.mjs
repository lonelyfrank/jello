#!/usr/bin/env node
/**
 * Release timeline from the real renderer: pressed at 0 ms, released at 600 ms, one frame per column.
 *   node docs/m643/tools/capture-timeline.mjs <outDir> --variants A,B3 [--size 160x44] [--bg light] [--dpr 2] [--presets ...]
 * Rows = presets. Same clock, same contact, same optics when comparing motion; same motion when comparing optics.
 */
import { mkdirSync } from 'node:fs';
import { PRESETS, ENGINES, openPage, sheet } from './lib.mjs';
const args = process.argv.slice(2), out = args[0];
const opt = (n, f) => { const i = args.indexOf(`--${n}`); return i < 0 ? f : args[i + 1]; };
const TIMES = [0, 70, 140, 300, 600, 650, 700, 780, 880, 1000, 1200, 1600];
mkdirSync(out, { recursive: true });
const browser = await ENGINES.chromium.launch();
const { ctx, page } = await openPage(browser, Number(opt('dpr', 1)));
for (const variant of opt('variants', 'A').split(',')) {
  const stage = await sheet(page, { variant, size: opt('size', '160x44'), bg: opt('bg', 'light'), states: TIMES.map((t) => `t${t}`), presets: opt('presets', PRESETS.join(',')).split(',') });
  await stage.screenshot({ path: `${out}/${variant}_timeline_${opt('size', '160x44')}_${opt('bg', 'light')}.png`, animations: 'disabled' });
}
await ctx.close(); await browser.close();
