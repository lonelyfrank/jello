#!/usr/bin/env node
/**
 * M6.4.3 performance, baseline (A, treatment m642) vs candidate (B3, treatment m643), identical scenarios, real RAF.
 *   node docs/m643/tools/perf.mjs [outJson]      (dev server on 4178; Chromium headless; development build, not minified)
 * Honest limits: dev server, headless (vsync-limited frame intervals), single laptop CPU, no GPU/paint measurement, no phone.
 * Each scenario alternates A/B and repeats REPS times; medians are reported with the min/max.
 */
import { writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { ENGINES, BASE } from './lib.mjs';
const REPS = 5;
const browser = await ENGINES.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE);
await page.waitForFunction(() => !!window.m643);
await page.evaluate(() => window.m643.destroyAll());
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
const counters = async () => { await cdp.send('HeapProfiler.collectGarbage'); const c = await cdp.send('Memory.getDOMCounters'); const h = await cdp.send('Runtime.getHeapUsage'); return { nodes: c.nodes, listeners: c.jsEventListeners, heapMB: +(h.usedSize / 1048576).toFixed(2) }; };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)]; };
const stats = (a) => ({ median: +med(a).toFixed(3), min: +Math.min(...a).toFixed(3), max: +Math.max(...a).toFixed(3) });

// --- shared page-side helpers
await page.evaluate(() => {
  window.__perf = {
    async setup(variant, count, id = 'jelly-candy') {
      const { createJellyCoordinator } = await import('/src/runtime/experimental/jelly-scheduler.ts');
      const { attachExperimentalJelly } = await import('/src/runtime/experimental/jelly.ts');
      const v = window.m643.variants.VARIANTS[variant](id);
      const coordinator = createJellyCoordinator();
      const scene = document.createElement('section');
      scene.style.cssText = 'display:grid;grid-template-columns:repeat(6,200px);gap:16px;padding:30px;position:absolute;left:0;top:0;background:#fff';
      document.body.append(scene);
      const hosts = [], surfaces = [];
      for (let i = 0; i < count; i++) {
        const host = document.createElement('button');
        host.style.cssText = 'width:160px;height:44px;border:0;background:transparent;font:600 14px system-ui';
        host.innerHTML = '<span>Jelly</span>';
        scene.append(host); hosts.push(host);
        surfaces.push(attachExperimentalJelly(host, v.doc, v.options ?? {}, coordinator));
      }
      return { coordinator, scene, hosts, surfaces, attachExperimentalJelly, v };
    },
  };
});

async function motion(variant, count) {
  const before = await cdp.send('Performance.getMetrics');
  const r = await page.evaluate(async ({ variant, count }) => {
    const ctxp = await window.__perf.setup(variant, count);
    const { coordinator, surfaces, scene } = ctxp;
    await new Promise((r) => setTimeout(r, 120));
    const nodesBefore = document.querySelectorAll('.jelly-decoration *').length;
    const f0 = coordinator.status.frames; await new Promise((r) => setTimeout(r, 300));
    const idleFrames = coordinator.status.frames - f0;
    const durations = [];
    for (const s of surfaces) { const frame = s.frame.bind(s); s.frame = (t) => { const a = performance.now(); try { return frame(t); } finally { durations.push(performance.now() - a); } }; }
    let longTasks = 0; const po = new PerformanceObserver((l) => { longTasks += l.getEntries().length; }); try { po.observe({ type: 'longtask' }); } catch {}
    const start = performance.now(), fr0 = coordinator.status.frames;
    surfaces.forEach((s) => s.setPressed(true));
    await new Promise((r) => setTimeout(r, 450));
    const nodesDuring = document.querySelectorAll('.jelly-decoration *').length;
    surfaces.forEach((s) => s.setPressed(false));
    while (coordinator.status.active && performance.now() - start < 5000) await new Promise((r) => setTimeout(r, 20));
    const frames = coordinator.status.frames - fr0, elapsed = performance.now() - start;
    const fr1 = coordinator.status.frames; await new Promise((r) => setTimeout(r, 300));
    const idleAfter = coordinator.status.frames - fr1;
    po.disconnect();
    const nodesAfter = document.querySelectorAll('.jelly-decoration *').length;
    const sorted = [...durations].sort((a, b) => a - b);
    surfaces.forEach((s) => s.destroy()); coordinator.destroy(); scene.remove();
    return { idleFrames, idleAfter, frames, elapsed, updates: durations.length, perUpdateMedianMs: sorted[Math.floor(sorted.length / 2)] ?? 0, perUpdateP95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0, perFrameTotalMs: durations.reduce((a, b) => a + b, 0) / Math.max(1, frames), nodesBefore, nodesDuring, nodesAfter, longTasks };
  }, { variant, count });
  const after = await cdp.send('Performance.getMetrics');
  const m = (name, set) => set.metrics.find((x) => x.name === name).value;
  r.scriptMs = +((m('ScriptDuration', after) - m('ScriptDuration', before)) * 1000).toFixed(1);
  r.layoutMs = +((m('LayoutDuration', after) - m('LayoutDuration', before)) * 1000).toFixed(1);
  r.styleMs = +((m('RecalcStyleDuration', after) - m('RecalcStyleDuration', before)) * 1000).toFixed(1);
  return r;
}
async function churn(variant, kind) {
  return page.evaluate(async ({ variant, kind }) => {
    const { surfaces, coordinator, scene, hosts, v } = await window.__perf.setup(variant, 12, 'jelly-soft');
    await new Promise((r) => setTimeout(r, 100));
    const count = () => document.querySelectorAll('.jelly-decoration *').length;
    const n0 = count(); const t0 = performance.now(); let nMax = n0;
    const docs = ['jelly-soft', 'jelly-clear', 'jelly-candy', 'jelly-dense'].map((id) => window.m643.variants.VARIANTS[variant](id));
    for (let i = 0; i < 200; i++) {
      surfaces.forEach((s, k) => {
        if (kind === 'preset') { const d = docs[(i + k) % 4]; s.update(d.doc, d.options ?? {}); }
        else if (kind === 'quality') { const d = structuredClone(v.doc); d.quality.profile = ['low', 'medium', 'high'][(i + k) % 3]; d.bubbles.density = 12; s.update(d, v.options ?? {}); }
        else if (kind === 'resize') { hosts[k].style.width = `${100 + ((i * 7 + k * 13) % 120)}px`; s.resize(); }
      });
      nMax = Math.max(nMax, count());
    }
    const ms = performance.now() - t0, n1 = count();
    surfaces.forEach((s) => s.destroy()); coordinator.destroy(); scene.remove();
    return { updates: 200 * 12, msTotal: +ms.toFixed(1), usPerUpdate: +(ms * 1000 / 2400).toFixed(1), nodesStart: n0, nodesMax: nMax, nodesEnd: n1 };
  }, { variant, kind });
}
async function lifecycle(variant) {
  await page.evaluate(() => window.m643.destroyAll());
  const start = await counters(); const series = [];
  for (let batch = 0; batch < 5; batch++) {
    await page.evaluate(async (variant) => {
      for (let i = 0; i < 60; i++) {
        const { surfaces, coordinator, scene } = await window.__perf.setup(variant, 4);
        surfaces[0].setPressed(true); await new Promise((r) => setTimeout(r, 4)); surfaces[0].setPressed(false);
        surfaces.forEach((s) => s.destroy()); coordinator.destroy(); scene.remove();
      }
    }, variant);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    series.push(await counters());
  }
  return { start, series, afterEachBatchOfSixtyMountUnmount: series.map((s) => s.nodes) };
}
// Listener attribution inside the isolated renderer: every add/removeEventListener, by phase (attach, one full motion, destroy).
async function listeners(variant) {
  return page.evaluate(async (variant) => {
    const phases = { attach: { added: {}, removed: {} }, motion: { added: {}, removed: {} }, destroy: { added: {}, removed: {} } };
    let phase = null;
    const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
    const tag = (t) => (t instanceof Element ? t.tagName.toLowerCase() : t === document ? 'document' : t === window ? 'window' : t?.constructor?.name ?? 'other');
    const note = (kind, t, type) => { if (phase) { const k = `${tag(t)}:${type}`; phases[phase][kind][k] = (phases[phase][kind][k] ?? 0) + 1; } };
    EventTarget.prototype.addEventListener = function (type, ...a) { note('added', this, type); return add.call(this, type, ...a); };
    EventTarget.prototype.removeEventListener = function (type, ...a) { note('removed', this, type); return rem.call(this, type, ...a); };
    phase = 'attach';
    const { surfaces, coordinator, scene } = await window.__perf.setup(variant, 1);
    phase = 'motion';
    surfaces[0].setPressed(true); await new Promise((r) => setTimeout(r, 450)); surfaces[0].setPressed(false);
    while (coordinator.status.active) await new Promise((r) => setTimeout(r, 20));
    phase = 'destroy';
    surfaces[0].destroy(); coordinator.destroy(); scene.remove();
    phase = null;
    EventTarget.prototype.addEventListener = add; EventTarget.prototype.removeEventListener = rem;
    return phases;
  }, variant);
}

const only = (process.env.ONLY ?? '').split(',').filter(Boolean), want = (k) => !only.length || only.includes(k);
const out = { date: new Date().toISOString().slice(0, 10), build: 'Vite development server (not minified)', platform: platform(), kernel: release(), cpu: cpus()[0]?.model, chromium: browser.version(), reps: REPS, scenarios: {} };
const pair = { A: 'A', B3: 'B3' };
for (const count of want('motion') ? [1, 12, 24] : []) {
  const runs = { A: [], B3: [] };
  for (let r = 0; r < REPS; r++) for (const v of ['A', 'B3']) runs[v].push(await motion(pair[v], count));
  const pick = (v, k) => stats(runs[v].map((x) => x[k]));
  out.scenarios[`motion_${count}_surfaces`] = Object.fromEntries(['A', 'B3'].map((v) => [v, {
    perFrameTotalMs: pick(v, 'perFrameTotalMs'), perUpdateP95Ms: pick(v, 'perUpdateP95Ms'), scriptMs: pick(v, 'scriptMs'), layoutMs: pick(v, 'layoutMs'), styleMs: pick(v, 'styleMs'), frames: pick(v, 'frames'),
    idleFramesBefore: runs[v].map((x) => x.idleFrames), idleFramesAfter: runs[v].map((x) => x.idleAfter), longTasks: runs[v].map((x) => x.longTasks),
    nodes: { before: runs[v][0].nodesBefore, during: runs[v][0].nodesDuring, after: runs[v][0].nodesAfter },
  }]));
}
for (const kind of want('churn') ? ['preset', 'quality', 'resize'] : []) {
  const runs = { A: [], B3: [] };
  for (let r = 0; r < 3; r++) for (const v of ['A', 'B3']) runs[v].push(await churn(v, kind));
  out.scenarios[`churn_${kind}_12_surfaces_2400_updates`] = Object.fromEntries(['A', 'B3'].map((v) => [v, { usPerUpdate: stats(runs[v].map((x) => x.usPerUpdate)), nodesStart: runs[v][0].nodesStart, nodesMax: Math.max(...runs[v].map((x) => x.nodesMax)), nodesEnd: runs[v][0].nodesEnd }]));
}
if (want('lifecycle')) out.scenarios.lifecycle_mount_unmount = { runs: [1, 2, 3].map(() => null) && await (async () => { const o = []; for (let i = 0; i < 3; i++) o.push({ A: await lifecycle('A'), B3: await lifecycle('B3') }); return o; })() };
if (want('listeners')) out.scenarios.listener_attribution_one_motion = { A: await listeners('A'), B3: await listeners('B3') };
out.errors = errors;
await browser.close();
const json = JSON.stringify(out, null, 2);
if (process.argv[2]) writeFileSync(process.argv[2], `${json}\n`);
console.log(json);
