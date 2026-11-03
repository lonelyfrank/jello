#!/usr/bin/env node
/**
 * M6.4.2 §13: resource and lifecycle measurements of the built Studio (vite preview on 4173).
 *
 *   npm run build && node scripts/m642-perf.mjs            → docs/m642/perf-results.json
 *
 * What is MEASURED, per scenario (3 s window unless stated):
 *   rafScheduled   requestAnimationFrame() calls made by the page (idle should be ~0)
 *   frames         callbacks actually run; interval p50/p95/p99 between them
 *   longTasks      PerformanceObserver 'longtask' entries (>50 ms main-thread tasks)
 *   scriptMs / layoutMs / styleMs   CDP Performance.getMetrics deltas (Chromium only)
 *   nodes / listeners / heapMB      CDP DOM counters and JS heap at the end (Chromium only)
 * Navigation cycles compare the counters before/after N rounds through every area: growth = a leak candidate.
 *
 * What it does NOT measure: GPU time, paint/composite cost (invisible to JS), phones. Headless desktop numbers are only
 * comparable with each other on this machine; they are not FPS promises.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, platform, release, totalmem } from 'node:os';
import { chromium, firefox } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const WINDOW = 3000;
const pct = (a, p) => (a.length ? [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : null);
const round = (v) => (v === null ? null : Math.round(v * 100) / 100);

const INIT = () => {
  const w = window;
  w.__perf = { raf: 0, frames: [], long: [], on: false };
  const raf = w.requestAnimationFrame.bind(w);
  w.requestAnimationFrame = (cb) => {
    if (w.__perf.on) w.__perf.raf++;
    return raf((t) => {
      if (w.__perf.on) w.__perf.frames.push(performance.now());
      cb(t);
    });
  };
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__perf.on && w.__perf.long.push(e.duration))).observe({ type: 'longtask', buffered: false });
  } catch { /* longtask not supported (Firefox) */ }
};

async function counters(page, cdp) {
  if (!cdp) return null;
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  const d = await cdp.send('Memory.getDOMCounters');
  return { script: m.ScriptDuration, layout: m.LayoutDuration, style: m.RecalcStyleDuration, heap: m.JSHeapUsedSize, nodes: d.nodes, listeners: d.jsEventListeners };
}

async function window_(page, cdp, label, act) {
  console.error(`[${new Date().toISOString().slice(11, 19)}] ${label}`);
  await page.evaluate(() => { window.__perf.raf = 0; window.__perf.frames = []; window.__perf.long = []; window.__perf.on = true; });
  const a = await counters(page, cdp);
  await act();
  await page.waitForTimeout(WINDOW);
  const r = await page.evaluate(() => { window.__perf.on = false; return { raf: window.__perf.raf, frames: window.__perf.frames, long: window.__perf.long }; });
  const b = await counters(page, cdp);
  const gaps = r.frames.slice(1).map((t, i) => t - r.frames[i]);
  return {
    scenario: label,
    rafScheduled: r.raf,
    frames: r.frames.length,
    interval: { p50: round(pct(gaps, 50)), p95: round(pct(gaps, 95)), p99: round(pct(gaps, 99)) },
    longTasks: r.long.length,
    longTaskMaxMs: r.long.length ? round(Math.max(...r.long)) : 0,
    ...(a && b ? { scriptMs: round((b.script - a.script) * 1000), layoutMs: round((b.layout - a.layout) * 1000), styleMs: round((b.style - a.style) * 1000), nodes: b.nodes, listeners: b.listeners, heapMB: round(b.heap / 1048576) } : {}),
  };
}

async function suite(name, engine) {
  const browser = await engine.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = name === 'chromium' ? await ctx.newCDPSession(page) : null;
  if (cdp) { await cdp.send('Performance.enable'); await cdp.send('Memory.enable').catch(() => undefined); }
  const out = [];
  const t0 = Date.now();
  await page.goto(BASE);
  await page.waitForSelector('html[data-ready=true]');
  out.push({ scenario: 'studio opened (first launch → ready)', ms: Date.now() - t0, ...(cdp ? { ...(await counters(page, cdp)), script: undefined, layout: undefined, style: undefined } : {}) });
  out.push(await window_(page, cdp, 'Home idle', async () => undefined));

  await page.locator('#startKit').click();
  await page.waitForSelector('#lab', { state: 'visible' });
  await page.waitForTimeout(800);
  out.push(await window_(page, cdp, 'Material Lab · Glass idle', async () => undefined));

  await page.goto(`${BASE}?material=solid-neutral&scene=grid&animate=0`);
  await page.waitForSelector('html[data-ready=true]');
  await page.waitForTimeout(600);
  out.push(await window_(page, cdp, 'Material Lab · Solid idle', async () => undefined));

  // Rapid edits: 60 changes of two parameters in a row, then the cost of the window that contains them.
  await page.goto(`${BASE}?preset=satin&scene=grid&animate=0`);
  await page.waitForSelector('html[data-ready=true]');
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  out.push(await window_(page, cdp, 'Glass · 60 rapid parameter edits', async () => {
    for (let i = 0; i < 30; i++) { await page.locator('#num-refraction').fill(String(i)); await page.locator('#num-saturation').fill(String(100 + i)); }
  }));

  // Jello lab.
  await page.goto(`${BASE}?studio=jelly&animate=0`);
  await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration', { timeout: 20000 });
  await page.waitForTimeout(800);
  out.push(await window_(page, cdp, 'Jello idle', async () => undefined));
  const box = await page.locator('#jl-primary').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  out.push(await window_(page, cdp, 'Jello · pointer held 3 s (hold)', async () => { await page.mouse.move(cx, cy); await page.mouse.down(); }));
  out.push(await window_(page, cdp, 'Jello · release → rebound → rest', async () => { await page.mouse.up(); }));
  out.push(await window_(page, cdp, 'Jello idle after rebound (RAF must have stopped)', async () => undefined));

  // Repeated navigation: counters before/after N rounds through every area.
  await page.goto(BASE);
  await page.waitForSelector('html[data-ready=true]');
  // The earlier scenarios may already have created the project (it persists in this context's IndexedDB).
  if (await page.locator('#startKit').count()) await page.locator('#startKit').click();
  await page.locator('#ws-material').click();
  await page.waitForSelector('#lab', { state: 'visible' });
  const areas = ['ws-home', 'ws-builder', 'ws-material', 'ws-library', 'ws-preview', 'ws-jelly', 'nav-assets'];
  const round1 = async () => { for (const id of areas) { await page.locator(`#${id}`).click(); await page.waitForTimeout(250); } };
  await round1(); // warm-up: lazy chunks, caches
  if (cdp) await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
  const before = await counters(page, cdp);
  const ROUNDS = 12;
  const gc = async () => { if (cdp) await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined); };
  const batches = [];
  for (let b = 1; b <= 3; b++) {
    for (let i = 0; i < ROUNDS; i++) await round1();
    await gc();
    batches.push(await counters(page, cdp));
  }
  out.push({
    scenario: `navigation · 3 batches × ${ROUNDS} rounds × ${areas.length} areas (forced GC after each batch)`,
    ...(before ? { nodes: [before.nodes, ...batches.map((c) => c.nodes)], listeners: [before.listeners, ...batches.map((c) => c.listeners)], heapMB: [before.heap, ...batches.map((c) => c.heap)].map((v) => round(v / 1048576)) } : { note: 'DOM counters need CDP (Chromium)' }),
  });
  await page.locator('#ws-home').click();
  await page.waitForTimeout(1500); // let the page-change transition finish; the window below is then a true rest
  out.push(await window_(page, cdp, 'Home at rest after navigation (no timers/RAF left behind)', async () => undefined));

  // Viewport changes and panel toggles.
  await page.locator('#ws-material').click();
  await page.waitForTimeout(500);
  out.push(await window_(page, cdp, 'Material Lab · 8 viewport changes', async () => {
    for (const [w, h] of [[390, 844], [1024, 768], [320, 640], [1440, 900], [768, 1024], [844, 390], [1280, 860], [390, 844]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(120); }
  }));
  await page.setViewportSize({ width: 1280, height: 860 });

  // Library with every preview mounted.
  await page.locator('#ws-library').click();
  await page.waitForSelector('#studioLibrary');
  await page.locator('.home-tabs .pill', { hasText: 'Jello' }).click();
  await page.waitForTimeout(1200);
  out.push(await window_(page, cdp, 'Library · Jello family, 4 live previews', async () => undefined));
  const live = await page.evaluate(() => ({ cards: document.querySelectorAll('.catalog-card').length, svgNodes: document.querySelectorAll('.catalog-card svg *').length }));
  out[out.length - 1].library = live;

  await browser.close();
  return { engine: name, version: browser.version?.() ?? null, results: out };
}

const env = { date: new Date().toISOString(), cpu: cpus()[0]?.model, cores: cpus().length, memGB: Math.round(totalmem() / 2 ** 30), os: `${platform()} ${release()}`, base: BASE, windowMs: WINDOW, headless: true };
const engines = [['chromium', chromium], ['firefox', firefox]];
const result = { env, runs: [] };
for (const [n, e] of engines) {
  try { result.runs.push(await suite(n, e)); } catch (err) { result.runs.push({ engine: n, error: String(err).split('\n')[0] }); }
}
mkdirSync(new URL('../docs/m642/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/m642/perf-results.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
for (const run of result.runs) {
  console.log(`\n== ${run.engine} ${run.version ?? ''} ${run.error ?? ''}`);
  for (const r of run.results ?? []) console.log(JSON.stringify(r));
}
