// M6.4.2 exploratory probe: does every parameter change the Stage raster? (glass | solid)
// Run from the repository root against a served build (npm run build && npx vite preview --port 4173). Its findings were turned into
// permanent tests (tests/e2e/m642-*.spec.ts); kept here as the record of HOW each defect in docs/m642/audit-baseline.md was reproduced.
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import fs from 'node:fs';
const S = new URL('./', import.meta.url).pathname;
import { runnerImport } from 'vite';
const { module: gp } = await runnerImport(new URL('../../../src/core/params.ts', import.meta.url).pathname);
const { module: sp } = await runnerImport(new URL('../../../src/model/solid.ts', import.meta.url).pathname);
const pick = (list) => list.map((d) => ({ key: d.key, type: d.type, affects: d.affects, min: d.min, max: d.max, step: d.step, def: d.default, opts: d.options }));
const glass = pick(gp.PARAMS);
const solid = pick(sp.SOLID_PARAMS);
const b = await chromium.launch();
const family = process.argv[2] ?? 'glass';
const query = family === 'glass' ? 'preset=jello&scene=grid&animate=0' : 'material=solid-neutral&scene=grid&animate=0';
const params = family === 'glass' ? glass : solid;
const diff = (a, c) => { const A = PNG.sync.read(a), C = PNG.sync.read(c); if (A.width !== C.width || A.height !== C.height) return -1; let n = 0; for (let i = 0; i < A.data.length; i += 4) if (A.data[i] !== C.data[i] || A.data[i+1] !== C.data[i+1] || A.data[i+2] !== C.data[i+2]) n++; return n; };
const res = [];
for (const d of params) {
  const page = await (await b.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 })).newPage();
  await page.goto('http://127.0.0.1:4173/?' + query); await page.waitForSelector('html[data-ready=true]'); await page.waitForTimeout(600);
  await page.addStyleTag({ content: '.stage-label{visibility:hidden!important}' });
  await page.evaluate(() => document.querySelectorAll('#panel details, .inspector details').forEach(x => x.open = true));
  const stage = page.locator('#stageMain');
  const shot = async () => { await page.waitForTimeout(350); return stage.screenshot(); };
  const before = await shot();
  let how = '', row = { key: d.key, affects: d.affects };
  const ctl = page.locator(`[data-param="${d.key}"], #param-${d.key}`).first();
  const present = (await page.locator(`#param-${d.key}`).count()) > 0;
  row.control = present;
  if (!present) { row.note = 'no control in DOM'; res.push(row); await page.context().close(); continue; }
  row.disabled = await page.locator(`#param-${d.key}`).first().isDisabled().catch(() => null);
  try {
    if (d.type === 'number') {
      const target = d.def - d.min < d.max - d.def ? d.max : d.min;
      await page.locator(`#num-${d.key}`).fill(String(target), { timeout: 2000 }); how = `num=${target}`;
    } else if (d.type === 'enum') {
      const alt = d.opts.find(o => o !== d.def); await page.locator(`#param-${d.key}`).selectOption(alt, { timeout: 2000 }); how = `enum=${alt}`;
    } else if (d.type === 'color') {
      const alt = d.def.toLowerCase() === '#ff0000' ? '#0000ff' : '#ff0000';
      await page.evaluate(([k, v]) => window.__jello.setMaterialControl ? window.__jello.setMaterialControl({ key: k }, v) : null, [d.key, alt]); how = `color=${alt}`;
    }
  } catch (e) { row.error = String(e).slice(0, 90); }
  const after = await shot();
  row.how = how; row.pixelsChanged = diff(before, after);
  const st = await page.evaluate(() => window.__jello.status?.());
  row.backend = st?.group?.effective ?? st?.effective;
  res.push(row);
  await page.context().close();
}
console.log(family, JSON.stringify(res.map(r => `${r.key.padEnd(14)} ${String(r.affects).padEnd(8)} ${r.how ?? ''} px=${r.pixelsChanged ?? 'n/a'} dis=${r.disabled}${r.note ? ' ' + r.note : ''}${r.error ? ' ERR ' + r.error : ''} be=${r.backend}`), null, 1));
await b.close();
