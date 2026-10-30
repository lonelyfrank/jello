#!/usr/bin/env node
/**
 * Repeatable frame-time comparison. Runs the built lab (vite preview) in
 * headless Chromium and Firefox through Playwright.
 *
 * - suite "capsule" (default): 1 vs 4 surfaces, static vs animated background,
 *   idle vs dragging → docs/perf/<date>.json
 * - suite "navbar": navbar on the app scene, background still / scrolling /
 *   animated, idle vs repeated presses → docs/perf/<date>-navbar.json
 * - suite "scene": WebGL2 controlled scene, profiles Economy / Balanced /
 *   Quality, pattern still / animated, idle vs dragging the lens
 *   → docs/perf/<date>-scene.json (frame interval, CPU per frame, GPU time
 *   when EXT_disjoint_timer_query_webgl2 exists, frames rendered)
 *
 * Every file records the environment (CPU, RAM, OS, browser, WebGL renderer
 * string). For CSS/SVG "no JS loop at rest" is measured (motion frames);
 * the compositing cost of the browser is not visible from JavaScript.
 *
 * Headless desktop numbers are only comparable with each other on the same
 * machine: they are not phone measurements and not a promise of FPS.
 *
 *   npm run build && npm run test:perf            # capsule suite, both engines
 *   node scripts/perf.mjs chromium                # one engine
 *   node scripts/perf.mjs --suite navbar          # navbar suite
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, release, totalmem } from 'node:os';
import { chromium, firefox } from '@playwright/test';

const BASE = 'http://127.0.0.1:4173/';
const DURATION = 3000;
const args = process.argv.slice(2);
const suiteAt = args.indexOf('--suite');
const suite = suiteAt >= 0 ? args.splice(suiteAt, 2)[1] : 'capsule';
if (!['capsule', 'navbar', 'scene'].includes(suite)) throw new Error(`suite sconosciuta: ${suite}`);
const engines = (args[0] ? [args[0]] : ['chromium', 'firefox']).map((n) => [n, { chromium, firefox }[n]]);

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
if (suite === 'capsule') {
  for (const surfaces of [1, 4]) {
    for (const animate of [false, true]) {
      for (const interaction of ['idle', 'drag']) scenarios.push({ surfaces, animate, interaction });
    }
  }
} else if (suite === 'scene') {
  for (const quality of ['economy', 'balanced', 'quality']) {
    for (const animate of [false, true]) {
      for (const interaction of ['idle', 'drag']) scenarios.push({ surfaces: 1, quality, animate, interaction });
    }
  }
} else {
  for (const background of ['still', 'scroll', 'animated']) {
    for (const interaction of ['idle', 'press']) scenarios.push({ surfaces: 1, background, interaction });
  }
}
const queryOf = (s) =>
  suite === 'capsule'
    ? `scene=blocks&components=${s.surfaces === 4 ? 1 : 0}&animate=${s.animate ? 1 : 0}`
    : suite === 'scene'
      ? `mode=scene&quality=${s.quality}&animate=${s.animate ? 1 : 0}`
      : `object=navbar&scene=app&animate=${s.background === 'animated' ? 1 : 0}`;
const framesOf =
  suite === 'capsule'
    ? () => window.__jello.capsule.frames
    : suite === 'scene'
      ? () => window.__jello.scene.status?.counters.frames ?? 0
      : () => window.__jello.navbar.frames;
const environment = {
  cpu: cpus()[0]?.model ?? 'sconosciuta',
  cores: cpus().length,
  ramGB: Math.round(totalmem() / 2 ** 30),
  os: `${process.platform} ${release()} ${process.arch}`,
  headless: true,
  viewport: '1280×860',
  dpr: 1,
  durationMs: DURATION,
  browsers: {},
};

const results = [];
for (const [name, type] of engines) {
  const browser = await type.launch();
  for (const s of scenarios) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
    await page.goto(`${BASE}?${queryOf(s)}`);
    await page.waitForSelector('html[data-ready=true]');
    await page.waitForTimeout(800);
    if (!environment.browsers[name]) {
      environment.browsers[name] = await page.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        const info = gl?.getExtension('WEBGL_debug_renderer_info');
        return {
          userAgent: navigator.userAgent,
          webgl2: !!gl,
          renderer: gl ? String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : null,
        };
      });
      environment.browsers[name].version = browser.version();
    }
    if (suite === 'scene' && !(await page.evaluate(() => window.__jello.scene.status?.effective === 'webgl2'))) {
      results.push({ engine: name, version: browser.version(), ...s, skipped: 'WebGL2 non disponibile' });
      await page.close();
      continue;
    }
    const cdp = name === 'chromium' ? await page.context().newCDPSession(page) : null;
    if (cdp) await cdp.send('Performance.enable');
    const metric = async () => {
      if (!cdp) return null;
      const { metrics } = await cdp.send('Performance.getMetrics');
      return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
    };
    const before = await metric();
    const statsBefore = await page.evaluate(() => window.__jello.stats());
    const framesBefore = await page.evaluate(framesOf);
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
    // Content scrolling under the bar: one rAF loop in the page, up and down.
    const scrolling =
      s.background === 'scroll'
        ? page.evaluate((ms) => {
            const el = document.querySelector('#stageMain .scroller');
            const max = el.scrollHeight - el.clientHeight;
            const start = performance.now();
            return new Promise((resolve) => {
              const step = (now) => {
                const t = (now - start) / 1500;
                el.scrollTop = max * (0.5 - 0.5 * Math.cos(t * Math.PI));
                if (now - start < ms) requestAnimationFrame(step);
                else resolve();
              };
              requestAnimationFrame(step);
            });
          }, DURATION)
        : Promise.resolve();
    if (s.interaction === 'press') {
      const items = await page.locator('#stageMain .nav-item').all();
      const t0 = Date.now();
      let i = 0;
      while (Date.now() - t0 < DURATION - 300) {
        const b = await items[i++ % items.length].boundingBox();
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(120);
        await page.mouse.up();
        await page.waitForTimeout(120);
      }
    }
    if (s.interaction === 'drag') {
      const box =
        suite === 'scene'
          ? await page.evaluate(() => {
              const r = document.querySelector('#sceneCanvas').getBoundingClientRect();
              const l = window.__jello.scene.status.lens;
              return { x: r.left + l.x, y: r.top + l.y, width: l.width, height: l.height };
            })
          : await page.locator('#capsuleMain').boundingBox();
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
    await scrolling;
    const after = await metric();
    const statsAfter = await page.evaluate(() => window.__jello.stats());
    const framesAfter = await page.evaluate(framesOf);
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
      [suite === 'capsule' ? 'capsuleMotionFrames' : suite === 'scene' ? 'sceneFrames' : 'navbarMotionFrames']: framesAfter - framesBefore,
      ...(suite === 'scene' ? await page.evaluate(() => {
        const m = window.__jello.scene.status.metrics;
        const c = window.__jello.scene.status.canvas;
        return { sceneCpuMs: m.cpu, sceneGpuMs: m.gpu, gpuNote: m.gpuNote, pixels: `${c.pixelWidth}×${c.pixelHeight}`, programBuilds: window.__jello.scene.status.counters.programBuilds };
      }) : {}),
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
  suite,
  runtime: /RUNTIME_VERSION = '([^']+)'/.exec(readFileSync(new URL('../src/model/version.ts', import.meta.url), 'utf8'))[1],
  environment,
  conditions: `scena "${suite === 'capsule' ? 'blocks' : suite === 'scene' ? 'pattern WebGL2' : 'app'}", ${DURATION} ms per scenario`,
  note:
    'Misure headless desktop su questa macchina: confrontabili solo tra loro. Non sono misure su telefono. ' +
    'Per CSS/SVG «nessun loop JS» non significa costo zero: il compositing del browser non è misurabile da JS. ' +
    'Temperatura, consumo e memoria GPU non sono disponibili e non vengono stimati.',
  results,
};
const file = `docs/perf/${date}${suite === 'capsule' ? '' : `-${suite}`}.json`;
mkdirSync('docs/perf', { recursive: true });
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.table(
  results.map((r) => ({
    engine: r.engine,
    surf: r.surfaces,
    q: r.quality ?? '',
    bg: r.background ?? (r.animate ? 'anim' : 'fermo'),
    input: r.interaction,
    frames: r.frames,
    'med ms': r.medianMs,
    'p95 ms': r.p95Ms,
    '>33': r.over33ms,
    maps: r.mapRegenerations,
    motion: r.capsuleMotionFrames ?? r.navbarMotionFrames ?? r.sceneFrames,
    cpu: r.sceneCpuMs?.median ?? '',
    task: r.taskMs,
    style: r.styleMs,
    layout: r.layoutMs,
  })),
);
console.log(file);
