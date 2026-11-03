#!/usr/bin/env node
/**
 * Reproducible measurements of the experimental Jelly area INSIDE the Studio (M6.4).
 *
 *   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
 *   node scripts/jelly-studio-perf.mjs [--base http://127.0.0.1:4173/] [--out docs/screenshots/jelly-m64/performance.json]
 *
 * Production build, headless Chromium and Firefox, viewport 1400x900, DPR 1. One run per scenario: these are
 * observations of this machine, not budgets or guarantees. What each number is:
 *   rafFrames   renderer coordinator ticks during the scenario (surface.motion.scheduler.frames delta)
 *   svgNodes    SVG elements inside the preview stage before / after (constant = no node churn)
 *   cdp*        Chromium only: Performance.getMetrics deltas, seconds of script / layout / style recalculation / total task time
 *   heapMB      Chromium only: JSHeapUsedSize after the scenario (no forced GC: indicative)
 *   intervalP95 p95 of requestAnimationFrame intervals from a sampling loop that also runs in the idle baseline
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium, firefox } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:4173/');
const out = resolve(opt('out', 'docs/screenshots/jelly-m64/performance.json'));

const sampler = `(() => { const t = []; let last = performance.now(), on = true; const f = (n) => { if (on) { t.push(n - last); last = n; requestAnimationFrame(f); } }; requestAnimationFrame(f); window.__samples = { stop() { on = false; return t.slice(1); } }; })()`;
const p95 = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(s.length * 0.95))].toFixed(2); };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.floor(s.length / 2)].toFixed(2); };

async function run(browserType, name) {
  const browser = await browserType.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const cdp = name === 'chromium' ? await page.context().newCDPSession(page) : null;
  if (cdp) await cdp.send('Performance.enable');
  const metrics = async () => cdp ? Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value])) : null;
  await page.goto(`${base}?studio=jelly&animate=0`);
  await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration', { timeout: 30000 });
  await page.waitForTimeout(500);
  const frames = () => page.evaluate(() => window.__jelloJelly.bridge()?.motion?.scheduler.frames ?? null);
  const nodes = () => page.evaluate(() => document.querySelectorAll('#jl-stage svg *').length);
  const surfaces = () => page.evaluate(() => document.querySelectorAll('#jl-stage .jelly-decoration').length);
  const results = [];

  async function scenario(label, body, { hold = false } = {}) {
    await page.evaluate(sampler);
    const [m0, f0, n0, s0, t0] = [await metrics(), await frames(), await nodes(), await surfaces(), Date.now()];
    await body();
    const [m1, f1, n1, t1] = [await metrics(), await frames(), await nodes(), Date.now()];
    const samples = await page.evaluate(() => window.__samples.stop());
    const r = {
      scenario: label, surfaces: s0, ms: t1 - t0, rafFrames: f0 === null || f1 === null ? null : f1 - f0, svgNodes: [n0, n1],
      intervalMedian: median(samples), intervalP95: p95(samples), samples: samples.length,
      ...(m0 ? {
        cdpScriptS: +(m1.ScriptDuration - m0.ScriptDuration).toFixed(4), cdpLayoutS: +(m1.LayoutDuration - m0.LayoutDuration).toFixed(4),
        cdpStyleS: +(m1.RecalcStyleDuration - m0.RecalcStyleDuration).toFixed(4), cdpTaskS: +(m1.TaskDuration - m0.TaskDuration).toFixed(4),
        heapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(2),
      } : {}),
    };
    results.push(r);
    return r;
  }
  const box = async () => (await page.locator('#jl-primary').boundingBox());
  const pressOnce = async (holdMs) => { const b = await box(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(holdMs); await page.mouse.up(); };
  const settle = () => page.waitForFunction(() => { const m = window.__jelloJelly.bridge()?.motion; return !m || (!m.scheduler.pending && Math.abs(m.x) < 1e-3); }, null, { timeout: 8000 });

  await scenario('idle 1 surface, 1.5 s', () => page.waitForTimeout(1500));
  await scenario('one press 450 ms + release to rest', async () => { await pressOnce(450); await settle(); });
  await scenario('20 repeated presses (60 ms) to rest', async () => { for (let i = 0; i < 20; i++) await pressOnce(60); await settle(); });
  await page.locator('#jl-level-advanced').click();
  await scenario('60 rapid parameter changes (slider keys)', async () => {
    const slider = page.locator('#param-jelly-density');
    await slider.focus();
    for (let i = 0; i < 60; i++) await page.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight');
  });
  await scenario('20 resize steps (button size + zoom)', async () => {
    for (let i = 0; i < 10; i++) { await page.locator('#jl-size').selectOption(i % 2 ? 'sm' : 'wide'); await page.locator('#jl-scale').selectOption(i % 2 ? '1' : '2'); }
    await page.locator('#jl-size').selectOption('md'); await page.locator('#jl-scale').selectOption('1');
  });
  await page.locator('#jl-level-base').click();
  await page.locator('#jl-compare').click();
  await page.waitForTimeout(400);
  // compare view has no primary bridge: frames come back null; DOM node count and CDP still apply
  await scenario('compare: 4 surfaces idle 1.5 s', () => page.waitForTimeout(1500));
  await scenario('compare: press each of the 4 surfaces', async () => {
    for (const id of ['soft', 'candy', 'clear', 'dense']) {
      const b = await page.locator(`[data-testid=compare-jelly-${id}]`).boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(250); await page.mouse.up(); await page.waitForTimeout(500);
    }
  });
  await page.locator('#jl-compare').click();
  await page.waitForSelector('#jl-primary .jelly-decoration');
  await scenario('10 workspace switches (Jelly ↔ Materiali)', async () => {
    for (let i = 0; i < 10; i++) { await page.locator('#ws-material').click(); await page.waitForTimeout(80); await page.locator('#ws-jelly').click(); await page.waitForTimeout(120); }
  });
  await page.locator('#ws-material').click();
  await page.waitForTimeout(300);
  const hiddenFrames0 = await frames();
  await scenario('preview hidden (other workspace), 1.5 s', () => page.waitForTimeout(1500));
  const hiddenFrames1 = await frames();
  await page.locator('#ws-jelly').click();
  await page.waitForTimeout(300);
  const extra = { hiddenPreviewRafDelta: hiddenFrames1 === null || hiddenFrames0 === null ? null : hiddenFrames1 - hiddenFrames0 };
  await browser.close();
  return { browser: name, version: browser.version(), extra, results };
}

const report = { generatedAt: new Date().toISOString(), base, note: 'Production build, headless, one run per scenario. Not budgets. Chromium-only fields come from CDP.', runs: [] };
for (const [type, name] of [[chromium, 'chromium'], [firefox, 'firefox']]) {
  try { report.runs.push(await run(type, name)); } catch (e) { report.runs.push({ browser: name, error: String(e.message ?? e) }); }
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
for (const r of report.runs) {
  console.log(`\n${r.browser} ${r.version ?? ''} ${r.error ?? ''}`);
  for (const s of r.results ?? []) console.log(`  ${s.scenario.padEnd(46)} surf ${s.surfaces} · raf ${String(s.rafFrames).padStart(4)} · nodes ${s.svgNodes.join('→')} · p95 ${s.intervalP95}${s.cdpTaskS !== undefined ? ` · task ${s.cdpTaskS}s script ${s.cdpScriptS}s layout ${s.cdpLayoutS}s heap ${s.heapMB}MB` : ''}`);
  if (r.extra) console.log(`  hidden preview RAF delta: ${r.extra.hiddenPreviewRafDelta}`);
}
console.log(`\n→ ${out}`);
