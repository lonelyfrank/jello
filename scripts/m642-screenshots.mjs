#!/usr/bin/env node
/**
 * M6.4.2 §15: reproducible screenshot matrix of the built Studio (vite preview, default http://127.0.0.1:4173/).
 *
 *   npm run build && node scripts/m642-screenshots.mjs [outDir]
 *
 * Writes <outDir>/*.png (default docs/m642/screenshots) and <outDir>/manifest.json with the file, what it shows, the
 * viewport and a sha256 of the pixels. Chromium, isolated profile, light/dark where stated, animations stopped at a
 * deterministic state (`animate=0`, reduced motion where the shot is a still).
 *
 * The matrix is a RECORD for review, not a baseline that updates itself: `scripts/m642-compare.mjs` compares two
 * directories and reports every difference; nothing here is accepted automatically (docs/m642/visual-review.md).
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://127.0.0.1:4173/';
const OUT = process.argv[2] ?? new URL('../docs/m642/screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const manifest = [];
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

async function shot(target, name, what, vp, opts = {}) {
  const buf = await target.screenshot({ path: `${OUT}/${name}.png`, animations: 'disabled', ...opts });
  manifest.push({ file: `${name}.png`, what, viewport: vp, pixels: hash(buf) });
}
const ready = (page) => page.waitForSelector('html[data-ready=true]');
const settle = (page, ms = 450) => page.evaluate(() => document.fonts.ready).then(() => page.waitForTimeout(ms));
const open = async (browser, vp, extra = {}) => {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, deviceScaleFactor: 1, ...extra });
  const page = await ctx.newPage();
  return { ctx, page };
};
const drawer = async (page) => {
  const t = page.locator('#panelToggle');
  if ((await t.isVisible()) && (await t.getAttribute('aria-expanded')) !== 'true') await t.click();
};

const browser = await chromium.launch();

// ---------------------------------------------------------------- Studio (desktop 1280×860 and mobile 390×844)
for (const [tag, vp] of [['desktop', [1280, 860]], ['mobile', [390, 844]]]) {
  const { ctx, page } = await open(browser, vp, { reducedMotion: 'reduce' });
  await page.goto(BASE);
  await ready(page);
  await settle(page);
  await shot(page, `studio-${tag}-01-home-first-launch`, 'Home at first launch: locked areas explain themselves', vp.join('x'));
  await page.locator('#startKit').click();
  await page.waitForSelector('#lab', { state: 'visible' });
  await settle(page, 900);
  await shot(page, `studio-${tag}-02-material-lab`, 'Material Lab right after the kit project (Glass Default)', vp.join('x'));
  await page.locator('#ws-home').click();
  await settle(page);
  await shot(page, `studio-${tag}-03-home-project`, 'Home with a project', vp.join('x'));
  await page.locator('#ws-library').click();
  await page.waitForSelector('#studioLibrary');
  await settle(page, 900);
  await shot(page, `studio-${tag}-04-library-all`, 'Library · all stable items', vp.join('x'));
  await page.locator('.home-tabs .pill', { hasText: 'Jello' }).click();
  await settle(page, 1200);
  await shot(page, `studio-${tag}-05-library-jello`, 'Library · Jello family (experimental, live previews)', vp.join('x'));
  await page.locator('#ws-builder').click();
  for (const [id, label] of [['button', 'button'], ['mobile-navbar', 'mobile-navbar'], ['desktop-navbar', 'desktop-navbar']]) {
    await page.evaluate((i) => window.__jello.builder.open(i), id);
    await settle(page, 900);
    await shot(page, `studio-${tag}-06-builder-${label}`, `Component Builder · ${label}`, vp.join('x'));
  }
  await page.evaluate(() => window.__jello.builder.open('button'));
  await page.locator('#ws-preview').click();
  await settle(page, 900);
  await shot(page, `studio-${tag}-07-preview-test`, 'Preview & Test', vp.join('x'));
  await page.locator('#ws-export').click();
  await settle(page, 700);
  await shot(page, `studio-${tag}-08-export`, 'Export flow', vp.join('x'));
  await page.keyboard.press('Escape'); // the export flow is a modal dialog
  await page.locator('#exportDialog[open]').waitFor({ state: 'detached', timeout: 3000 }).catch(() => undefined);
  await page.locator('#ws-jelly').click();
  await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration', { timeout: 20000 });
  await settle(page, 900);
  await shot(page, `studio-${tag}-09-jello-lab`, 'Jello β lab (experimental)', vp.join('x'));
  await ctx.close();
}
{
  const { ctx, page } = await open(browser, [1280, 860], { reducedMotion: 'reduce' });
  await page.goto(BASE);
  await ready(page);
  await page.locator('#startKit').click();
  await page.waitForSelector('#lab', { state: 'visible' });
  await page.locator('#ws-builder').click();
  await page.evaluate(() => window.__jello.builder.open('button'));
  for (const tab of ['base', 'advanced']) {
    const btn = page.locator(`.studio-inspector-tabs button`).filter({ hasText: tab === 'base' ? /Base|Tutto|Proprietà/ : /Avanzat/ }).first();
    if (await btn.count()) { await btn.click(); await settle(page, 400); await shot(page, `studio-desktop-10-inspector-${tab}`, `Builder inspector · ${tab}`, '1280x860'); }
  }
  await page.locator('#nav-assets').click();
  await settle(page);
  await shot(page, 'studio-desktop-11-assets', 'Asset del progetto', '1280x860');
  await page.locator('#studioSettings').click();
  await settle(page);
  await shot(page, 'studio-desktop-12-settings', 'Impostazioni', '1280x860');
  await ctx.close();
}

// ---------------------------------------------------------------- Glass and Solid presets on the test backgrounds (§5.3)
// Glass: uniform, gradient, large text, photograph, dark, light. Solid: dark and light (it reads nothing behind it).
// Before M6.4.2 the dark, light, gradient, checker and contrast scenes all drew a blank white page in the DOM Stage
// (a base `.scene` rule overrode their backgrounds), so a baseline built from main shows exactly that difference.
{
  const { ctx, page } = await open(browser, [1280, 860], { reducedMotion: 'reduce' });
  const GLASS_SCENES = [['solid', 'uniform'], ['gradient', 'gradient'], ['text', 'text'], ['photo', 'photo'], ['jello-light', 'light'], ['jello-dark', 'dark']];
  const SOLID_SCENES = [['jello-light', 'light'], ['jello-dark', 'dark']];
  for (const [family, ids, scenes] of [['glass', ['jello', 'satin', 'deep', 'navbar'], GLASS_SCENES], ['solid', ['solid-neutral', 'solid-dark', 'solid-accent', 'solid-outline'], SOLID_SCENES]]) {
    for (const id of ids) {
      for (const [scene, label] of scenes) {
        await page.goto(`${BASE}?${family === 'glass' ? 'preset' : 'material'}=${id}&scene=${scene}&animate=0`);
        await ready(page);
        await page.addStyleTag({ content: '.stage-label{visibility:hidden!important}' });
        await settle(page, scene === 'photo' ? 1200 : 700);
        await shot(page.locator('#stageMain'), `material-${family}-${id}-${label}`, `${family} preset ${id} on the ${scene} test background (Stage raster)`, 'stage');
      }
    }
  }
  await ctx.close();
}

// ---------------------------------------------------------------- Component states: Glass vs Solid Button (hover, pressed, disabled)
{
  const { ctx, page } = await open(browser, [1280, 860], { reducedMotion: 'reduce' });
  await page.goto(BASE);
  await ready(page);
  await page.locator('#startKit').click();
  await page.waitForSelector('#lab', { state: 'visible' });
  await page.locator('#ws-builder').click();
  for (const family of ['glass', 'solid']) {
    await page.evaluate(() => window.__jello.builder.open('button'));
    await page.evaluate((f) => window.__jello.builder.setFamily(f), family);
    await page.evaluate(() => window.__jello.builder.select('root'));
    await settle(page, 700);
    await shot(page.locator('#stageMain'), `component-button-${family}-default`, `Button (${family}) default`, 'stage');
    for (const state of ['Hover', 'Pressed', 'Disabled']) {
      const b = page.locator('.canvas-states button', { hasText: state });
      if (await b.count()) { await b.click(); await settle(page, 500); await shot(page.locator('#stageMain'), `component-button-${family}-${state.toLowerCase()}`, `Button (${family}) state ${state}`, 'stage'); }
    }
  }
  await ctx.close();
}

// ---------------------------------------------------------------- Jello: presets, states, environments, motion sequence
const jello = async (extra = {}, vp = [1280, 860]) => {
  const { ctx, page } = await open(browser, vp, extra);
  await page.goto(`${BASE}?studio=jelly&animate=0`);
  await ready(page);
  await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration', { timeout: 20000 });
  await page.waitForFunction(() => !!window.__jelloJelly?.bridge()?.status);
  await drawer(page);
  return { ctx, page };
};
{
  const { ctx, page } = await jello({ reducedMotion: 'reduce' });
  await page.locator('#jl-compare').click();
  await settle(page, 800);
  for (const bg of ['light', 'dark', 'gradient']) {
    await page.locator('#jl-background').selectOption(bg);
    for (const state of ['live', 'hover', 'pressed', 'disabled']) {
      await page.locator('#jl-state').selectOption(state);
      await settle(page, 500);
      await shot(page.locator('.jl-compare'), `jello-compare-${bg}-${state}`, `Jello · four candidate presets side by side · ${bg} background · state ${state}`, 'compare');
    }
  }
  await page.locator('#jl-state').selectOption('live');
  await page.locator('#jl-background').selectOption('light');
  // Simulated environments (static profile, CSS fallback, opaque).
  for (const [flag, label] of [['reducedMotion', 'reduced-motion'], ['svgUnavailable', 'css-fallback'], ['opaque', 'opaque'], ['reducedTransparency', 'reduced-transparency']]) {
    const sw = page.locator(`#jl-env-${flag}`);
    if (await sw.count()) { await sw.check(); await settle(page, 600); await shot(page.locator('.jl-compare'), `jello-env-${label}`, `Jello · four presets · simulated environment ${label}`, 'compare'); await sw.uncheck(); }
  }
  await ctx.close();
}
{
  const { ctx, page } = await jello({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.locator('#jl-compare').click();
  await settle(page, 800);
  await shot(page.locator('.jl-compare'), 'jello-env-forced-colors', 'Jello · four presets · forced-colors: active (emulated)', 'compare');
  await ctx.close();
}
{
  // Motion sequence per preset: idle → press → hold → release → rebound → rest. Sampled at fixed delays from the pointer events.
  const { ctx, page } = await jello({});
  for (const id of ['jelly-soft', 'jelly-clear', 'jelly-candy', 'jelly-dense']) {
    await page.locator(`#jl-preset-${id}`).click();
    await settle(page, 600);
    const target = page.locator('#jl-primary');
    const box = await target.boundingBox();
    const clip = { x: box.x - 24, y: box.y - 24, width: box.width + 48, height: box.height + 48 };
    const snap = async (phase) => shot(page, `jello-motion-${id}-${phase}`, `${id} · ${phase}`, 'clip', { clip });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await snap('1-idle');
    await page.mouse.down();
    await page.waitForTimeout(110);
    await snap('2-press');
    await page.waitForTimeout(650);
    await snap('3-hold');
    await page.mouse.up();
    await page.waitForTimeout(90);
    await snap('4-release');
    await page.waitForTimeout(180);
    await snap('5-rebound');
    await page.waitForTimeout(1400);
    await snap('6-rest');
  }
  await ctx.close();
}

await browser.close();
writeFileSync(`${OUT}/manifest.json`, `${JSON.stringify({ generated: new Date().toISOString(), base: BASE, engine: 'chromium', count: manifest.length, shots: manifest }, null, 2)}\n`);
console.log(`${manifest.length} screenshots → ${OUT}`);
