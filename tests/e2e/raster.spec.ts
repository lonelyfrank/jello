/**
 * Raster checks of the refraction path. Every assertion compares pixels of
 * the same stage rendered with refraction and with the satin path (blur 0,
 * tint 0, light 0, shadow 0: the satin capture equals the bare source).
 * When the whole file passes, a verification record is written for the
 * engine/version under test (verification/<project>.json).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { RUNTIME_VERSION } from '../../src/model/version';
import {
  OPTICS,
  captureStage,
  diffBox,
  expectInside,
  lab,
  meanDiff,
  openLab,
  regionDiff,
  setPath,
  settle,
  type Capture,
} from './helpers';

test.describe.configure({ mode: 'serial' });

const BAND = 26;
const passed: string[] = [];
const metrics: Record<string, number> = {};

async function pair(page: import('@playwright/test').Page, target = '.capsule'): Promise<[Capture, Capture]> {
  await setPath(page, 'refraction');
  const on = await captureStage(page, '#stageMain', target);
  await setPath(page, 'satin');
  const off = await captureStage(page, '#stageMain', target);
  await setPath(page, 'refraction');
  return [on, off];
}

/** Standard deviation of luminance along x in a 3 px strip of the capture (CSS px). */
function stripContrast(cap: Capture, y: number, x0: number, x1: number): number {
  const { png, dpr } = cap;
  const values: number[] = [];
  for (let x = Math.round(x0 * dpr); x < Math.round(x1 * dpr); x++) {
    let sum = 0;
    for (let row = Math.round(y * dpr); row < Math.round((y + 3) * dpr); row++) {
      const i = (row * png.width + x) * 4;
      sum += (png.data[i]! + png.data[i + 1]! + png.data[i + 2]!) / 3;
    }
    values.push(sum);
  }
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length) / Math.round(3 * dpr);
}

test.beforeEach(async ({ page }) => {
  await openLab(page, `${OPTICS}&components=0`);
});

test('refraction is visible on the grid with blur and tint at zero', async ({ page }) => {
  const s = await lab<{ effective: string }>(page, `return h.status()`);
  expect(s.effective).toBe('refraction');
  const [on, off] = await pair(page);
  const rim = regionDiff(on, off, 'rim', BAND);
  metrics.rimMeanDifference = rim;
  expect(rim).toBeGreaterThan(8);
  passed.push('refraction visible on grid (blur 0, tint 0)');
});

test('turning refraction off changes the raster; refraction 0 is a pass-through', async ({ page }) => {
  const [on, off] = await pair(page);
  expect(meanDiff(on, off)).toBeGreaterThan(0.05);
  await lab(page, `h.setParams({ refraction: 0 })`);
  await settle(page);
  const zero = await captureStage(page);
  const passthrough = meanDiff(zero, off);
  metrics.passThroughMeanDifference = passthrough;
  expect(passthrough).toBeLessThan(0.05);
  passed.push('refraction on/off differ; refraction 0 equals the source');
});

test('centre stays neutral and every edge bends', async ({ page }) => {
  const [on, off] = await pair(page);
  const centre = regionDiff(on, off, 'centre', BAND);
  metrics.centreMeanDifference = centre;
  expect(centre).toBeLessThan(0.5);
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    const d = regionDiff(on, off, side, BAND);
    metrics[`${side}MeanDifference`] = d;
    expect(d, side).toBeGreaterThan(3);
  }
  expect(regionDiff(on, off, 'outside', BAND)).toBeLessThan(0.05);
  passed.push('neutral centre, all four edges displaced, nothing outside the lens');
});

test('dome is the only way to bend the centre', async ({ page }) => {
  await lab(page, `h.setParams({ dome: 0.6 })`);
  const [on, off] = await pair(page);
  expect(regionDiff(on, off, 'centre', BAND)).toBeGreaterThan(1);
  passed.push('explicit dome parameter bends the centre');
});

test('distortion stays aligned with the lens after moving, inner scroll and resize', async ({ page }) => {
  // Coordinate scene: a continuous gradient, so every displaced pixel changes
  // colour and the measured box does not depend on where grid lines fall.
  await lab(page, `h.setOption('scene', 'coords'); h.setParams({ refraction: 40 })`);
  const check = async (label: string) => {
    const [on, off] = await pair(page);
    const box = diffBox(on, off, 3);
    expect(box, label).not.toBeNull();
    const where = `${label}: box ${JSON.stringify(box)} lens ${JSON.stringify(on.capsule)} stage ${JSON.stringify(on.stage)}`;
    expectInside(box!, on.capsule);
    // The distortion reaches every side of the lens, so it cannot be offset.
    // A side closer to the source edge than the refraction samples outside the
    // source, where the original content shows through: such sides are skipped.
    const c = on.capsule;
    const reach = 40 + 6;
    const sides = [
      [c.x > reach, box!.x - c.x],
      [on.stage.width - (c.x + c.width) > reach, c.x + c.width - (box!.x + box!.width)],
      [c.y > reach, box!.y - c.y],
      [on.stage.height - (c.y + c.height) > reach, c.y + c.height - (box!.y + box!.height)],
    ] as const;
    let checked = 0;
    for (const [far, gap] of sides) {
      if (!far) continue;
      checked++;
      expect(gap, where).toBeLessThan(4);
    }
    expect(checked, where).toBeGreaterThanOrEqual(2);
  };
  await check('initial');
  await lab(page, `h.capsule.setPosition(37, 211)`);
  await settle(page);
  await check('moved');
  await page.locator('#stageMain .scroller').evaluate((el) => (el.scrollTop = 173));
  await settle(page);
  await check('inner scroll');
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: Math.round(vp.width * 0.8), height: Math.round(vp.height * 0.9) });
  await settle(page);
  await check('resize');
  await page.setViewportSize(vp);
  passed.push('aligned after move, inner scroll and viewport resize');
});

test('alignment holds when the page itself scrolls', async ({ page }) => {
  // Open the panel on narrow layouts and make the document taller than the viewport.
  await page.addStyleTag({ content: 'body{padding-bottom:1200px}' });
  const toggle = page.locator('#panelToggle');
  if (await toggle.isVisible()) await toggle.click();
  await page.evaluate(() => window.scrollTo(0, 60));
  await settle(page);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await lab(page, `h.setOption('scene', 'coords'); h.setParams({ refraction: 40 })`);
  // The open panel shortens the stage on narrow layouts: keep the lens away from
  // the source edge, where sampling falls outside (documented limit).
  await lab(page, `const o = document.querySelector('#stageMain .overlay'); h.capsule.setPosition(Math.max(0, (o.clientWidth - 280) / 2), Math.max(0, (o.clientHeight - 104) / 2))`);
  await settle(page);
  const [on, off] = await pair(page);
  const box = diffBox(on, off, 3);
  expect(box).not.toBeNull();
  expectInside(box!, on.capsule);
  expect(box!.width).toBeGreaterThan(on.capsule.width - 8);
  expect(box!.height).toBeGreaterThan(on.capsule.height - 8);
  passed.push('aligned after page scroll');
});

test('foreground is never displaced', async ({ page }) => {
  // A fine pattern covering the whole capsule, painted in the foreground layer,
  // over a flat scene: if it were inside the filter its rim would move.
  await lab(page, `h.setOption('scene', 'solid')`);
  await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.id = 'fgProbe';
    probe.style.cssText =
      'position:absolute;inset:0;border-radius:inherit;background:repeating-linear-gradient(90deg,#000 0 2px,transparent 2px 6px),repeating-linear-gradient(0deg,#c00 0 2px,transparent 2px 6px)';
    document.getElementById('capsuleMain')!.append(probe);
  });
  await settle(page);
  expect(await page.evaluate(() => document.getElementById('sourceMain')!.contains(document.getElementById('fgProbe')))).toBe(false);
  await lab(page, `h.setParams({ refraction: 60 })`);
  const [on, off] = await pair(page);
  const d = regionDiff(on, off, 'rim', BAND);
  metrics.foregroundRimDifference = d;
  expect(d).toBeLessThan(0.05);
  passed.push('foreground outside the filter, not displaced');
});

test('map is not regenerated by translation', async ({ page }) => {
  const before = await lab<{ mapRegenerations: number; attributeWrites: number }>(page, `return h.stats()`);
  await lab(page, `for (let i = 0; i < 40; i++) h.capsule.setPosition(20 + i * 7, 40 + i * 3, true)`);
  await settle(page);
  const after = await lab<{ mapRegenerations: number; attributeWrites: number }>(page, `return h.stats()`);
  expect(after.mapRegenerations).toBe(before.mapRegenerations);
  expect(after.attributeWrites).toBeGreaterThan(before.attributeWrites);
  passed.push('translation updates attributes only, no map regeneration');
});

test('navbar lens is aligned with the bar and stays put while the content scrolls', async ({ page }) => {
  await lab(page, `h.setOption('object', 'navbar'); h.setOption('scene', 'coords'); h.setParams({ band: 16, refraction: 10, profile: 'smooth' })`);
  await settle(page);
  const check = async (label: string) => {
    const [on, off] = await pair(page, '.navbar');
    const box = diffBox(on, off, 3);
    expect(box, label).not.toBeNull();
    expectInside(box!, on.capsule);
    // The bar is wide and low: the distortion must reach both ends and both long sides.
    expect(box!.width, label).toBeGreaterThan(on.capsule.width - 12);
    expect(box!.height, label).toBeGreaterThan(on.capsule.height - 8);
    return on.capsule;
  };
  const before = await check('initial');
  await page.locator('#stageMain .scroller').evaluate((el) => (el.scrollTop = 300));
  await settle(page);
  const after = await check('scrolled');
  expect(after).toEqual(before);
  passed.push('navbar: lens aligned with the bar, unchanged while the content scrolls');
});

test('navbar labels and icons are not displaced', async ({ page }) => {
  await lab(page, `h.setOption('object', 'navbar'); h.setOption('scene', 'solid'); h.setParams({ band: 16, refraction: 30 })`);
  await settle(page);
  expect(await page.evaluate(() => document.getElementById('sourceMain')!.contains(document.querySelector('#stageMain .nav-item')))).toBe(false);
  const [on, off] = await pair(page, '.navbar');
  // Flat scene: any difference inside the bar would come from displaced foreground.
  const d = regionDiff(on, off, 'rim', 16);
  metrics.navbarForegroundRimDifference = d;
  expect(d).toBeLessThan(0.05);
  passed.push('navbar: foreground outside the filter, not displaced');
});

test('blur reaches the edge of the source without fading', async ({ page }) => {
  // Lens touching the bottom edge of the source. Without alpha renormalization
  // the kernel weight falling outside the source let the sharp grid through.
  // Only grid lines under the lens: no capsule label, no grid letters.
  await page.addStyleTag({ content: '.capsule-content,.scene-grid-labels{visibility:hidden!important}' });
  await lab(page, `h.setParams({ refraction: 0, blur: 8 })`);
  await lab(page, `const o = document.querySelector('#stageMain .overlay'); h.capsule.setPosition(Math.max(0, (o.clientWidth - 280) / 2), o.clientHeight - 104)`);
  await settle(page);
  // Best of five rows around each target: a single row can fall on a horizontal
  // grid line (depends on the stage height mod 32) and read as flat.
  const rows = (cap: Capture, y: number, x0: number, x1: number) =>
    Math.max(...[-2, -1, 0, 1, 2].map((d) => stripContrast(cap, y + d, x0, x1)));
  const contrast = async () => {
    const cap = await captureStage(page);
    const c = cap.capsule;
    return {
      inner: rows(cap, c.y + c.height - 29, c.x + 60, c.x + c.width - 60),
      edge: rows(cap, c.y + c.height - 6, c.x + 60, c.x + c.width - 60),
    };
  };
  const normalized = await contrast();
  // Same filter with the identity alpha row, edited in place, for reference.
  await page.evaluate(() => {
    for (const m of document.querySelectorAll('[data-jello-filters] feColorMatrix[result^="s"]')) {
      m.setAttribute('values', m.getAttribute('values')!.replace(/0 0 0 0 1$/, '0 0 0 1 0'));
    }
  });
  await settle(page);
  const raw = await contrast();
  metrics.edgeBlurContrastNormalized = normalized.edge;
  metrics.edgeBlurContrastUnnormalized = raw.edge;
  metrics.innerBlurContrast = normalized.inner;
  expect(normalized.edge).toBeLessThan(normalized.inner * 1.6 + 3);
  expect(raw.edge).toBeGreaterThan(normalized.edge * 1.8);
  passed.push('blur renormalized at the source edge (no sharp content showing through)');
});

test('writes the verification record for this engine', async ({ page }, info) => {
  const status = await lab<{ engine: { engine: string; major: number; mobile: boolean } }>(page, `return h.status()`);
  const project = info.project.name;
  const record = {
    engine: status.engine.engine,
    major: status.engine.major,
    environment: `${process.platform} ${process.arch}, Playwright ${info.config.version}, headless, progetto "${project}"${
      project.includes('mobile') ? ', viewport mobile emulato' : ', viewport desktop'
    }`,
    mobileEmulated: project.includes('mobile'),
    date: new Date().toISOString().slice(0, 10),
    // Evidence belongs to this runtime and backend: older records do not certify changed code.
    runtime: RUNTIME_VERSION,
    backend: 'svg',
    checks: passed,
    metrics,
  };
  mkdirSync('verification', { recursive: true });
  writeFileSync(`verification/${project}.json`, `${JSON.stringify(record, null, 2)}\n`);
  expect(passed.length).toBeGreaterThanOrEqual(11);
});
