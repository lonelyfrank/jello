#!/usr/bin/env node
/**
 * Real screenshots of the experimental Jelly area of the Studio (M6.4), from the production build.
 *
 *   npx vite preview --host 127.0.0.1 --port 4180 &
 *   node scripts/jelly-studio-evidence.mjs [--base http://127.0.0.1:4180/] [--out docs/screenshots/jelly-m64]
 *
 * Chromium and Firefox. Each capture also records the renderer's own readings (backend, motion, solver x/v) at the
 * moment of the shot in evidence.json, so "pressed" and "rebound" are checked against the solver and not assumed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium, firefox, devices } from '@playwright/test';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const base = opt('base', 'http://127.0.0.1:4180/');
const out = resolve(opt('out', 'docs/screenshots/jelly-m64'));
mkdirSync(out, { recursive: true });
const evidence = [];

async function open(page, { media } = {}) {
  if (media) await page.emulateMedia(media);
  await page.goto(`${base}?studio=jelly&animate=0&theme=dark`);
  await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration', { timeout: 30000 });
  await page.waitForFunction(() => !!window.__jelloJelly?.bridge()?.status);
  await page.waitForTimeout(500);
}
const read = (page) => page.evaluate(() => { const b = window.__jelloJelly.bridge(); const m = b?.motion; const s = b?.status; return m ? { backend: s.backend, motion: s.motion, opaque: s.opaque, forced: s.forcedColors, reduced: s.motionReduced, bubbles: s.bubbles, x: +m.x.toFixed(5), v: +m.v.toFixed(4), target: +m.target.toFixed(4), pressed: m.pressed } : null; });
const drawer = async (page, open) => { const t = page.locator('#panelToggle'); if (await t.isVisible() && ((await t.getAttribute('aria-expanded')) === 'true') !== open) await t.click(); };
async function shot(page, name, target) {
  const file = `${name}.png`;
  const before = await read(page);
  await (target ? page.locator(target).screenshot({ path: `${out}/${file}` }) : page.screenshot({ path: `${out}/${file}` }));
  evidence.push({ file, readings: { before, after: await read(page) } });
}
const press = async (page, ms) => { const b = await page.locator('#jl-primary').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(ms); };
const settle = (page) => page.waitForFunction(() => { const m = window.__jelloJelly.bridge()?.motion; return !m || (!m.scheduler.pending && Math.abs(m.x) < 1e-3); }, null, { timeout: 8000 });
const section = (page, id) => page.evaluate((s) => { document.querySelectorAll('#jl-inspector details').forEach((d) => { d.open = d.dataset.section === `jelly-${s}`; }); document.querySelector(`[data-section=jelly-${s}]`).scrollIntoView(); }, id);

for (const [type, name] of [[chromium, 'chromium'], [firefox, 'firefox']]) {
  const browser = await type.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await open(page);
  await shot(page, `${name}-lab-desktop`);
  await page.locator('#jl-level-advanced').click();
  for (const [id, label] of [['appearance', 'appearance'], ['bubbles', 'bubbles'], ['motion', 'motion']]) { await section(page, id); await page.waitForTimeout(150); await shot(page, `${name}-inspector-${label}`, '#jl-panel'); }
  await page.locator('#jl-level-base').click();

  // Button states, enlarged so deformation is readable: Candy (maxDeformation 0.09), large, 200%
  await page.locator('#jl-preset-jelly-candy').click();
  await page.selectOption('#jl-size', 'lg'); await page.selectOption('#jl-scale', '2');
  await page.waitForTimeout(300);
  await shot(page, `${name}-button-idle`, '#jl-stage');
  await press(page, 500); await shot(page, `${name}-button-pressed`, '#jl-stage');
  await page.mouse.up(); await page.waitForTimeout(90);
  await shot(page, `${name}-button-rebound`, '#jl-stage');
  await settle(page);
  await page.selectOption('#jl-scale', '1'); await page.selectOption('#jl-size', 'md');

  // Four candidates side by side, each at its own stored values
  await page.locator('#jl-compare').click(); await page.waitForTimeout(500);
  await shot(page, `${name}-compare`, '#jl-stage');
  await page.selectOption('#jl-background', 'gradient'); await page.waitForTimeout(300);
  await shot(page, `${name}-compare-gradient`, '#jl-stage');
  await page.selectOption('#jl-background', 'dark'); await page.waitForTimeout(300);
  await shot(page, `${name}-compare-dark`, '#jl-stage');
  await page.locator('#jl-compare').click(); await page.selectOption('#jl-background', 'light');

  // CSS fallback (saved backend preference) and simulated SVG loss
  await page.locator('#jl-level-advanced').click();
  await page.selectOption('#param-jelly-backend', 'css'); await page.waitForTimeout(300);
  await page.selectOption('#jl-scale', '2');
  await shot(page, `${name}-css-fallback`, '#jl-stage');
  await page.selectOption('#param-jelly-backend', 'auto');
  await page.locator('#jl-env-opaque').check(); await page.waitForTimeout(300);
  await shot(page, `${name}-opaque-fallback`, '#jl-stage');
  await page.locator('#jl-env-opaque').uncheck();
  await ctx.close();

  // System preferences
  for (const [label, media] of [['reduced-motion', { reducedMotion: 'reduce' }], ['forced-colors', { forcedColors: 'active' }]]) {
    const c = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
    const p = await c.newPage();
    await open(p, { media });
    await p.selectOption('#jl-scale', '2');
    await shot(p, `${name}-${label}`, '#jl-stage');
    await shot(p, `${name}-${label}-lab`);
    await c.close();
  }
  await browser.close();
}

// Phone emulation (Pixel 7 viewport and touch, on desktop Chromium: not a real device)
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  await open(page);
  await shot(page, 'mobile-emulated-lab');
  await page.locator('#panelToggle').click(); await page.waitForTimeout(400);
  await shot(page, 'mobile-emulated-drawer');
  await ctx.close(); await browser.close();
}

writeFileSync(`${out}/evidence.json`, JSON.stringify({ generatedAt: new Date().toISOString(), base, captures: evidence }, null, 2) + '\n');
console.log(`${evidence.length} captures → ${out}`);
