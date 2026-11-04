#!/usr/bin/env node
/**
 * M6.4.3.A §11 — what the Visual Review workspace itself costs, apart from the renderer (renderer-only costs: docs/m643/tools/perf.mjs).
 *   node docs/m643a/tools/review-perf.mjs [outJson]       (dev server on 4178: npm run dev -- --host 127.0.0.1 --port 4178)
 * Real Studio, real RAF, Chromium headless, development build (not minified), one laptop CPU. Honest limits: no GPU/paint measurement,
 * no phone, 5 repetitions with the median reported next to min/max.
 *   - switch costs: main-thread CPU time of one UI action over two frames (React commit + bridge updates + style/layout/paint; UI + renderer together)
 *   - four surfaces, press-hold-release through the workspace's synchronised input: script/layout/task time and scheduler frames, A vs B3
 *   - leaks: DOM nodes, JS event listeners and heap after GC, before opening, with the Review open, after 300 A/B switches, and after leaving it
 *   - idle: requestAnimationFrame calls in one second of rest
 */
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { ENGINES } from '../../m643/tools/lib.mjs';

const BASE = (process.env.BASE_STUDIO ?? 'http://127.0.0.1:4178/') + '?studio=jelly&animate=0';
const REPS = 5;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
const p95 = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; };
const r = (n, d = 3) => +n.toFixed(d);
const stats = (a) => ({ median: r(med(a)), p95: r(p95(a)), min: r(Math.min(...a)), max: r(Math.max(...a)) });

const browser = await ENGINES.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
const counters = async () => {
  await cdp.send('HeapProfiler.collectGarbage'); await cdp.send('HeapProfiler.collectGarbage');
  const c = await cdp.send('Memory.getDOMCounters'); const h = await cdp.send('Runtime.getHeapUsage');
  return { nodes: c.nodes, listeners: c.jsEventListeners, heapMB: r(h.usedSize / 1048576, 2) };
};
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));

await page.goto(BASE);
await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
const lifecycle = { labOnly: await counters() };
await page.locator('#jl-open-review').click();
await page.waitForSelector('#jelly-review .rv-cell .jelly-decoration');
lifecycle.reviewOpen = await counters();

// ---- switch costs (UI + renderer), measured synchronously around the DOM action
const timed = (selector, action) => page.evaluate(({ selector, action }) => {
  const el = document.querySelector(selector);
  const t0 = performance.now();
  if (action.kind === 'click') el.click();
  else { el.value = action.value; el.dispatchEvent(new Event('change', { bubbles: true })); }
  return performance.now() - t0;
}, { selector, action });
const settle = () => page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
// The action is dispatched and two frames are awaited; the main-thread CPU time (TaskDuration delta) of that window is the cost of the action,
// including React's commit, the bridge updates and the style/layout/paint work they cause. `sync` is only the part inside the dispatch.
const action = async (selector, a) => {
  await cdp.send('Performance.getMetrics'); const m0 = await metrics();
  const sync = await timed(selector, a); await settle();
  const m1 = await metrics();
  return { sync, task: (m1.TaskDuration - m0.TaskDuration) * 1000 };
};
const switches = { variant: [], preset: [], viewport: [], mode: [] };
for (let i = 0; i < 60; i++) {
  switches.variant.push(await action(`#rv-variant-${['B1', 'B2', 'B3', 'A'][i % 4]}`, { kind: 'click' }));
  if (i % 3 === 0) { switches.preset.push(await action(`#rv-preset-${['jelly-clear', 'jelly-candy', 'jelly-dense', 'jelly-soft'][(i / 3) % 4]}`, { kind: 'click' })); }
  if (i % 3 === 1) { switches.viewport.push(await action('#rv-viewport', { kind: 'value', value: ['xs', 'lg', 'md'][(i - 1) / 3 % 3] })); }
}
for (let i = 0; i < 12; i++) { switches.mode.push(await action('#jelly-review .rv-toolbar > .seg:first-child .seg-b:nth-child(' + (1 + (i % 2)) + ')', { kind: 'click' })); }
await page.locator('#jelly-review .rv-toolbar > .seg:first-child .seg-b').first().click();
await page.locator('#rv-viewport').selectOption('md');
await page.locator('#rv-variant-B3').click();

// ---- 300 A/B switches: nodes, listeners, heap
const before = await counters();
for (let i = 0; i < 300; i++) { await page.evaluate((v) => document.querySelector(`#rv-variant-${v}`).click(), ['A', 'B3'][i % 2]); if (i % 20 === 0) await settle(); }
await settle();
lifecycle.afterAB300 = await counters();
lifecycle.beforeAB300 = before;

// ---- four surfaces: presets axis, variant A vs B3, press-hold-release mirrored by the hub
const four = { A: [], B3: [] };
await page.getByRole('group', { name: 'Modalità di confronto' }).getByRole('button', { name: 'Quattro varianti' }).click();
await page.getByRole('button', { name: /^Preset \(/ }).click();
for (let rep = 0; rep < REPS; rep++) for (const variant of ['A', 'B3']) {
  await page.locator(`#rv-variant-${variant}`).click(); await settle();
  await page.waitForTimeout(400);
  const btn = page.locator('.rv-cell [data-testid^="rv-btn-"]').first();
  const box = await btn.boundingBox();
  const m0 = await metrics();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up(); await page.waitForTimeout(1200);
  const m1 = await metrics();
  four[variant].push({ scriptMs: (m1.ScriptDuration - m0.ScriptDuration) * 1000, layoutMs: (m1.LayoutDuration - m0.LayoutDuration) * 1000, taskMs: (m1.TaskDuration - m0.TaskDuration) * 1000, recalcMs: (m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000 });
}
const agg = (rows) => Object.fromEntries(['scriptMs', 'layoutMs', 'taskMs', 'recalcMs'].map((k) => [k, stats(rows.map((x) => x[k]))]));

// ---- idle: RAF calls in one second of rest
await page.evaluate(() => { window.__raf = 0; const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { window.__raf++; return o(cb); }; });
await page.waitForTimeout(1000);
const idleRaf = await page.evaluate(() => window.__raf);

// ---- leaving the Review: everything it created must go
await page.locator('#rv-back').click();
await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
await page.waitForTimeout(300);
lifecycle.afterLeave = await counters();
const surfacesLeft = await page.evaluate(() => document.querySelectorAll('#jelly-review').length);
await ctx.close(); await browser.close();

const out = {
  date: new Date().toISOString().slice(0, 10), build: 'Vite development server (not minified)', cpu: cpus()[0].model, reps: REPS,
  scope: 'UI + renderer together (switches) and the Review workspace in the real Studio; renderer-only figures are in docs/m643/perf-results.json and this run of docs/m643/tools/perf.mjs',
  switchMs: Object.fromEntries(Object.entries(switches).map(([k, v]) => [k, { n: v.length, syncInDispatch: stats(v.map((x) => x.sync)), mainThreadTaskWindow: stats(v.map((x) => x.task)) }])),
  fourSurfacesPressHoldRelease: { A: agg(four.A), B3: agg(four.B3) },
  lifecycle, idleRafPerSecond: idleRaf, reviewElementsAfterLeave: surfacesLeft, errors,
};
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify(out, null, 1)}\n`);
console.log(JSON.stringify(out, null, 1));
