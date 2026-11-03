#!/usr/bin/env node
/**
 * M6.4.3 raster matrix from the REAL runtime (tests/fixtures/jelly-m643, injected clock, no alternate renderer).
 *   node docs/m643/tools/capture-matrix.mjs <outDir> --variants A,N --dpr 1,2 [--sizes ...] [--bgs ...] [--engine chromium]
 * One PNG per (variant, size, background, dpr): rows = presets; columns = states. Run tools/manifest.mjs afterwards to record file hashes.
 * release, rebound, rest, disabled. A manifest.json lists every file with a pixel hash. Requires the dev server on 4178.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { BGS, ENGINES, SIZES, STATES, PRESETS, openPage, sha, sheet } from './lib.mjs';

const args = process.argv.slice(2);
const out = args[0];
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i < 0 ? fallback : args[i + 1]; };
const variants = opt('variants', 'A').split(','), dprs = opt('dpr', '1').split(',').map(Number);
const sizes = opt('sizes', Object.keys(SIZES).join(',')).split(','), bgs = opt('bgs', BGS.join(',')).split(',');
const engine = opt('engine', 'chromium');
const states = opt('states', STATES.join(',')).split(','), presets = opt('presets', PRESETS.join(',')).split(',');
mkdirSync(out, { recursive: true });
const browser = await ENGINES[engine].launch();
const manifest = { engine, version: browser.version(), states, presets, files: [], errors: [] };
for (const dpr of dprs) {
  const { ctx, page, errors } = await openPage(browser, dpr);
  for (const variant of variants) for (const size of sizes) for (const bg of bgs) {
    const stage = await sheet(page, { variant, size, bg, states, presets });
    const name = `${variant}_${size}_${bg}_dpr${dpr}.png`;
    const buf = await stage.screenshot({ path: `${out}/${name}`, animations: 'disabled' });
    manifest.files.push({ file: name, variant, size, bg, dpr, pixels: sha(buf) });
  }
  manifest.errors.push(...errors);
  await ctx.close();
}
await browser.close();
console.log(`${manifest.files.length} sheets, ${manifest.errors.length} page errors`);
