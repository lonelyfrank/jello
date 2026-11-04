#!/usr/bin/env node
/**
 * M6.4.3.A reproducible screenshots of the Visual Review (the real workspace, the real renderer).
 *   node docs/m643a/tools/capture-review.mjs <outDir> [--dpr 1,2]        (dev server on 4178: npm run dev -- --host 127.0.0.1 --port 4178)
 * Matrix (rebuilt by this script, so the repository keeps only a small subset):
 *   presets (4) × variants (A, B3) × backgrounds (light, dark) × sizes (80×32, 160×44) × states (idle, pressed)   at DPR 1
 *   the same for 160×44 on light at DPR 2
 *   release timelines: each preset, light, 160×44, variants A·B1·B2·B3 at 0, 70, 140, 300, 600, 700, 880, 1200 ms (press 0, release 600)
 * Files are named from the condition and listed with the condition and a SHA-256 in manifest.json. `pressed` is the workspace's forced
 * pressed state captured after the motion has settled; timeline frames come from the manual clock (deterministic).
 * Chromium only, headless; pixel output is engine-, font- and platform-dependent and is a record, not a cross-platform reference.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ENGINES } from '../../m643/tools/lib.mjs';

const out = process.argv[2];
if (!out) { console.error('usage: capture-review.mjs <outDir> [--dpr 1,2]'); process.exit(2); }
const dprs = (process.argv.includes('--dpr') ? process.argv[process.argv.indexOf('--dpr') + 1] : '1,2').split(',').map(Number);
const BASE = (process.env.BASE_STUDIO ?? 'http://127.0.0.1:4178/') + '?studio=jelly&animate=0';
const PRESETS = ['jelly-soft', 'jelly-clear', 'jelly-candy', 'jelly-dense'];
const TIMES = [0, 70, 140, 300, 600, 700, 880, 1200];
mkdirSync(out, { recursive: true });

const browser = await ENGINES.chromium.launch();
const manifest = { tool: 'docs/m643a/tools/capture-review.mjs', engine: 'chromium', chromium: browser.version(), base: BASE, files: [], errors: [] };
const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function session(dpr) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, deviceScaleFactor: dpr, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => manifest.errors.push(e.message));
  await page.goto(BASE);
  await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
  await page.locator('#jl-open-review').click();
  await page.waitForSelector('#jelly-review .rv-cell .jelly-decoration');
  // The focus ring of the variant under discussion is workspace chrome, not material: keep it out of the pictures.
  await page.addStyleTag({ content: '.rv-cell[data-focus] .rv-tile{border-color:transparent!important}.rv-x,.rv-peak{visibility:hidden}' });
  await page.locator('#rv-right').evaluate((el) => { el.hidden = true; }).catch(() => {});
  return { ctx, page };
}
const save = async (locator, name, condition) => {
  const buf = await locator.screenshot({ animations: 'disabled' });
  writeFileSync(`${out}/${name}`, buf);
  manifest.files.push({ file: name, sha256: sha(buf), bytes: buf.length, ...condition });
};
const dprOf = (page) => page.evaluate(() => window.devicePixelRatio);

for (const dpr of dprs) {
  const { ctx, page } = await session(dpr);
  const realDpr = await dprOf(page);
  const sizes = dpr === 1 ? ['xs', 'md'] : ['md'];
  const bgs = dpr === 1 ? ['light', 'dark'] : ['light'];
  await page.getByRole('group', { name: 'Modalità di confronto' }).getByRole('button', { name: 'Affiancato', exact: true }).click();
  for (const preset of PRESETS) {
    await page.locator(`#rv-preset-${preset}`).click();
    await page.locator('#rv-variant-B3').click();
    for (const size of sizes) for (const bg of bgs) for (const state of ['live', 'pressed']) {
      await page.selectOption('#rv-viewport', size); await page.selectOption('#rv-background', bg); await page.selectOption('#rv-state', state);
      await page.waitForTimeout(state === 'pressed' ? 2200 : 700); // forced pressed: let the oscillator settle at its target
      for (const variant of ['A', 'B3']) {
        const tile = page.getByTestId(`rv-cell-${preset}:${variant}`).locator('.rv-tile');
        await save(tile, `${preset.slice(6)}_${variant}_${bg}_${size}_${state === 'live' ? 'idle' : 'pressed'}_dpr${dpr}.png`, { kind: 'state', preset, variant, background: bg, size, state: state === 'live' ? 'idle' : 'pressed', requestedDpr: dpr, devicePixelRatio: realDpr });
      }
    }
    await page.selectOption('#rv-state', 'live');
  }
  if (dpr === 1) {
    // Release timelines on the manual clock.
    await page.getByRole('group', { name: 'Modalità di confronto' }).getByRole('button', { name: 'Movimento', exact: true }).click();
    await page.selectOption('#rv-viewport', 'md'); await page.selectOption('#rv-background', 'light');
    for (const preset of PRESETS) {
      await page.locator(`#rv-preset-${preset}`).click();
      await page.waitForTimeout(400);
      for (const t of TIMES) {
        await page.locator('#rv-scrubber').fill(String(t));
        await page.waitForFunction((t) => document.querySelector('#rv-time')?.textContent === `t = ${t} ms`, t);
        await page.waitForTimeout(80);
        await save(page.locator('#rv-stage .rv-grid'), `timeline_${preset.slice(6)}_light_md_t${String(t).padStart(4, '0')}_dpr1.png`, { kind: 'timeline', preset, variants: ['A', 'B1', 'B2', 'B3'], background: 'light', size: 'md', timeMs: t, pressMs: 0, releaseMs: 600, requestedDpr: 1, devicePixelRatio: realDpr });
      }
    }
  }
  await ctx.close();
}
await browser.close();
manifest.count = manifest.files.length;
writeFileSync(`${out}/manifest.json`, `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`${manifest.count} files, ${manifest.errors.length} errors → ${out}/manifest.json`);
