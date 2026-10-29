import { expect, test, type Page } from '@playwright/test';
import { OPTICS, captureStage, lab, openLab, settle, showPanel } from './helpers';

const status = (page: Page) => lab<{ effective: string; reasons: string[]; motionReduced: boolean }>(page, `return h.status()`);
const sourceFilter = (page: Page) => page.locator('#sourceMain').evaluate((el) => getComputedStyle(el).filter);

/** Centre pixel of the capsule surface, read from a raster capture. */
async function capsuleCentre(page: Page) {
  const cap = await captureStage(page);
  const x = Math.round((cap.capsule.x + cap.capsule.width * 0.2) * cap.dpr);
  const y = Math.round((cap.capsule.y + cap.capsule.height / 2) * cap.dpr);
  const i = (y * cap.png.width + x) * 4;
  return [cap.png.data[i]!, cap.png.data[i + 1]!, cap.png.data[i + 2]!];
}

test('opaque path removes the filter and paints an opaque surface on any scene', async ({ page }) => {
  await openLab(page, `${OPTICS}&path=opaque&theme=light`);
  expect((await status(page)).effective).toBe('opaque');
  expect(await sourceFilter(page)).toBe('none');
  const bg = await page.locator('#capsuleMain .jello-surface').evaluate((el) => getComputedStyle(el).backgroundColor);
  const alpha = Number(/rgba?\([^)]*?(?:,\s*|\/\s*)([\d.]+)\)/.exec(bg)?.[1] ?? '1');
  expect(alpha).toBeGreaterThan(0.9);
  const onGrid = await capsuleCentre(page);
  await lab(page, `h.setOption('scene', 'blocks')`);
  await settle(page);
  const onBlocks = await capsuleCentre(page);
  for (let c = 0; c < 3; c++) expect(Math.abs(onGrid[c]! - onBlocks[c]!)).toBeLessThan(12);
  // Foreground remains in place and readable.
  await expect(page.locator('#capsuleMain .capsule-label')).toBeVisible();
});

test('satin path uses backdrop-filter and no SVG filter', async ({ page }) => {
  await openLab(page, `${OPTICS}&path=satin`);
  expect((await status(page)).effective).toBe('satin');
  expect(await sourceFilter(page)).toBe('none');
  const backdrop = await page
    .locator('#capsuleMain .jello-surface')
    .evaluate((el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).getPropertyValue('-webkit-backdrop-filter'));
  expect(backdrop).toContain('blur');
});

test('manual "reduce transparency" switches to opaque and back', async ({ page }) => {
  await openLab(page, OPTICS);
  await showPanel(page);
  expect((await status(page)).effective).toBe('refraction');
  await page.locator('#opt-reduceTransparency').check();
  await settle(page);
  const s = await status(page);
  expect(s.effective).toBe('opaque');
  expect(s.reasons.join()).toMatch(/manualmente/);
  expect(await sourceFilter(page)).toBe('none');
  await page.locator('#opt-reduceTransparency').uncheck();
  await settle(page);
  expect((await status(page)).effective).toBe('refraction');
});

test('forced colors use the opaque path with system colours', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await openLab(page, OPTICS);
  expect((await status(page)).effective).toBe('opaque');
  expect(await sourceFilter(page)).toBe('none');
});

test('prefers-contrast: more uses the opaque path with a visible edge', async ({ page }) => {
  await page.emulateMedia({ contrast: 'more' });
  await openLab(page, OPTICS);
  expect((await status(page)).effective).toBe('opaque');
  const shadow = await page.locator('#capsuleMain .jello-surface').evaluate((el) => getComputedStyle(el).boxShadow);
  expect(shadow).not.toBe('none');
});

test('prefers-reduced-transparency uses the opaque path', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Emulation only available through Chromium CDP');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  await openLab(page, OPTICS);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches)).toBe(true);
  expect((await status(page)).effective).toBe('opaque');
});

test('reduced motion: no spring, no stretch, no background animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openLab(page, 'preset=jello&scene=blocks');
  expect((await status(page)).motionReduced).toBe(true);
  // The lab does not animate the background by default under reduced motion.
  await expect(page.locator('#stages')).not.toHaveClass(/is-animated/);
  expect(await page.locator('#stageMain .scroller').evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
  await lab(page, `h.capsule.setPosition(10, 20, false)`);
  // Jumps on the next frame instead of travelling.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(await page.locator('#capsuleMain').evaluate((el) => el.style.transform)).toBe('translate3d(10px, 20px, 0px)');
  const box = (await page.locator('#capsuleMain').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  // Press changes light only: no scale on the surface.
  expect(await page.locator('#capsuleMain .jello-surface').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  await page.mouse.up();
});

test('manual "reduce effects" stops background animation and elasticity', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openLab(page, 'preset=jello&scene=blocks&animate=1');
  await showPanel(page);
  await expect(page.locator('#stages')).toHaveClass(/is-animated/);
  await page.locator('#opt-reduceMotion').check();
  await settle(page);
  expect((await status(page)).motionReduced).toBe(true);
  await expect(page.locator('#stages')).not.toHaveClass(/is-animated/);
});

test('animation toggle starts and stops the background', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await openLab(page, 'preset=jello&scene=grid&animate=0');
  await showPanel(page);
  const running = () => page.locator('#stageMain .scroller').evaluate((el) => el.getAnimations({ subtree: true }).length);
  expect(await running()).toBe(0);
  await page.locator('#opt-animate').check();
  expect(await running()).toBeGreaterThan(0);
  await page.locator('#opt-animate').uncheck();
  expect(await running()).toBe(0);
});

test('status separates configured, detected and verified', async ({ page }) => {
  await openLab(page, OPTICS);
  await showPanel(page);
  await expect(page.locator('[data-status=configured]')).toHaveText('Automatico');
  await expect(page.locator('[data-status=detected]')).toContainText('filtro SVG su HTML');
  await expect(page.locator('[data-status=verified]')).not.toBeEmpty();
  await lab(page, `h.setOption('path', 'satin')`);
  await expect(page.locator('[data-status=configured]')).toHaveText(/Satinato/);
  await expect(page.locator('[data-status=effective]')).toHaveText(/Satinato/);
});
