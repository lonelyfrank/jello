#!/usr/bin/env node
/**
 * Repeatable frame-time comparison: 1 vs 4 surfaces, static vs animated
 * background, idle vs dragging. Runs the built lab (vite preview) in headless
 * Chromium and Firefox through Playwright.
 *
 * Headless desktop numbers are only comparable with each other on the same
 * machine: they are not phone measurements and not a promise of FPS.
 *
 *   npm run build && npm run test:perf            # both engines
 *   node scripts/perf.mjs chromium                # one engine
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, firefox } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173/';
const DURATION = 3000;
const engines = (process.argv[2] ? [process.argv[2]] : ['chromium', 'firefox']).map((n) => [n, { chromium, firefox }[n]]);

async function reachable() {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await reachable())) {
  server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await reachable()); i++) await new Promise((r) => setTimeout(r, 200));
}

const scenarios = [];
for (const surfaces of [1, 4]) {
  for (const animate of [false, true]) {
    for (const interaction of ['idle', 'drag']) scenarios.push({ surfaces, animate, interaction });
  }
}

const results = [];
for (const [name, type] of engines) {
  const browser = await type.launch();
  for (const s of scenarios) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
    const q = `scene=blocks&components=${s.surfaces === 4 ? 1 : 0}&animate=${s.animate ? 1 : 0}`;
    await page.goto(`${BASE}?${q}`);
    await page.waitForSelector('html[data-ready=true]');
    await page.waitForTimeout(800);
    const cdp = name === 'chromium' ? await page.context().newCDPSession(page) : null;
    if (cdp) await cdp.send('Performance.enable');
    const metric = async () => {
      if (!cdp) return null;
      const { metrics } = await cdp.send('Performance.getMetrics');
      return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
    };
    const before = await metric();
    const statsBefore = await page.evaluate(() => window.__jello.stats());
    const framesBefore = await page.evaluate(() => window.__jello.capsule.frames);
    const sampling = page.evaluate(
      (ms) =>
        new Promise((resolve) => {
          const frames = [];
          let last = 0;
          const start = performance.now();
          const step = (now) => {
            if (last) frames.push(now - last);
            last = now;
            if (now - start < ms) requestAnimationFrame(step);
            else resolve(frames);
          };
          requestAnimationFrame(step);
        }),
      DURATION,
    );
    if (s.interaction === 'drag') {
      const box = await page.locator('#capsuleMain').boundingBox();
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      const t0 = Date.now();
      let i = 0;
      while (Date.now() - t0 < DURATION - 100) {
        const a = (i++ / 30) * Math.PI * 2;
        await page.mouse.move(cx + Math.cos(a) * 120, cy + Math.sin(a) * 60);
      }
      await page.mouse.up();
    }
    const frames = await sampling;
    const after = await metric();
    const statsAfter = await page.evaluate(() => window.__jello.stats());
    const framesAfter = await page.evaluate(() => window.__jello.capsule.frames);
    const sorted = [...frames].sort((a, b) => a - b);
    const q50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
    const q95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0;
    const delta = (k) => (before && after ? Number(((after[k] - before[k]) * 1000).toFixed(1)) : null);
    results.push({
      engine: name,
      version: browser.version(),
      ...s,
      frames: frames.length,
      medianMs: Number(q50.toFixed(2)),
      p95Ms: Number(q95.toFixed(2)),
      over33ms: frames.filter((f) => f > 33.4).length,
      mapRegenerations: statsAfter.mapRegenerations - statsBefore.mapRegenerations,
      capsuleMotionFrames: framesAfter - framesBefore,
      taskMs: delta('TaskDuration'),
      layoutMs: delta('LayoutDuration'),
      styleMs: delta('RecalcStyleDuration'),
    });
    await page.close();
  }
  await browser.close();
}
server?.kill();

const date = new Date().toISOString().slice(0, 10);
const out = {
  date,
  environment: `${process.platform} ${process.arch}, headless, viewport 1280×860 DPR 1, scena "blocks", ${DURATION} ms per scenario`,
  note: 'Misure headless desktop su questa macchina: confrontabili solo tra loro. Non sono misure su telefono.',
  results,
};
mkdirSync('docs/perf', { recursive: true });
writeFileSync(`docs/perf/${date}.json`, `${JSON.stringify(out, null, 2)}\n`);
console.table(
  results.map((r) => ({
    engine: r.engine,
    surf: r.surfaces,
    bg: r.animate ? 'anim' : 'fermo',
    input: r.interaction,
    frames: r.frames,
    'med ms': r.medianMs,
    'p95 ms': r.p95Ms,
    '>33': r.over33ms,
    maps: r.mapRegenerations,
    motion: r.capsuleMotionFrames,
    task: r.taskMs,
    style: r.styleMs,
    layout: r.layoutMs,
  })),
);
console.log(`docs/perf/${date}.json`);
