import { expect, test, type Page } from '@playwright/test';
import { OPTICS, drag, lab, openLab, settle, type Rect } from './helpers';

const stats = (page: Page) => lab<{ mapRegenerations: number; mapCacheHits: number; animating: number; surfaces: number }>(page, `return h.stats()`);
const capsuleBox = async (page: Page) => (await page.locator('#capsuleMain').boundingBox())!;

/** Records the pointerId of the last pointerdown on the capsule. */
async function trackPointer(page: Page) {
  await page.evaluate(() => {
    const el = document.getElementById('capsuleMain')!;
    el.addEventListener('pointerdown', (e) => ((window as unknown as { lastPointer: number }).lastPointer = e.pointerId));
  });
}

test.beforeEach(async ({ page }) => {
  await openLab(page, OPTICS);
});

test('dragging the capsule moves it without regenerating the map', async ({ page }) => {
  const before = await stats(page);
  const start = await lab<{ x: number; y: number }>(page, `return h.capsule.position`);
  const box = await capsuleBox(page);
  // Stay inside the stage: the lab clamps the capsule to its bounds.
  const dx = -Math.min(120, Math.floor(start.x));
  const steps = Array.from({ length: 30 }, (_, i) => ({ x: (dx * (i + 1)) / 30, y: (i + 1) * 3 }));
  const release = await drag(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, steps);
  expect(await lab(page, `return h.capsule.pressed`)).toBe(true);
  await expect(page.locator('#capsuleMain')).toHaveAttribute('data-dragging', '');
  await release();
  await settle(page);
  const end = await lab<{ x: number; y: number }>(page, `return h.capsule.position`);
  expect(end.x).toBeCloseTo(start.x + dx, 0);
  expect(end.y).toBeCloseTo(start.y + 90, 0);
  const after = await stats(page);
  expect(after.mapRegenerations).toBe(before.mapRegenerations);
  expect(after.animating).toBe(0);
  expect(await lab(page, `return h.capsule.pressed`)).toBe(false);
});

test('pressing stretches the existing map instead of regenerating it', async ({ page }) => {
  const before = await stats(page);
  const box = await capsuleBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(300);
  const scale = await page.locator('#capsuleMain .jello-surface').evaluate((el) => getComputedStyle(el).transform);
  expect(scale).not.toBe('none');
  await page.mouse.up();
  await settle(page);
  expect((await stats(page)).mapRegenerations).toBe(before.mapRegenerations);
});

test('only geometry changes regenerate, and the cache serves repeated shapes', async ({ page }) => {
  const a = await stats(page);
  await lab(page, `h.setParams({ refraction: 30, blur: 6, saturation: 150, light: 0.9 })`);
  await settle(page);
  const b = await stats(page);
  expect(b.mapRegenerations).toBe(a.mapRegenerations);
  await lab(page, `h.setParams({ width: 300 })`);
  await settle(page);
  const c = await stats(page);
  expect(c.mapRegenerations).toBe(b.mapRegenerations + 1);
  await lab(page, `h.setParams({ width: 280 })`);
  await settle(page);
  const d = await stats(page);
  expect(d.mapRegenerations).toBe(c.mapRegenerations);
  expect(d.mapCacheHits).toBeGreaterThan(c.mapCacheHits);
});

for (const ending of ['pointercancel', 'lostpointercapture', 'visibilitychange', 'blur'] as const) {
  test(`gesture state is cleared on ${ending}`, async ({ page }) => {
    await trackPointer(page);
    const box = await capsuleBox(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 10);
    expect(await lab(page, `return h.capsule.pressed`)).toBe(true);
    await page.evaluate((kind) => {
      const el = document.getElementById('capsuleMain')!;
      const id = (window as unknown as { lastPointer: number }).lastPointer;
      if (kind === 'pointercancel') {
        el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: id, isPrimary: true, bubbles: true }));
      } else if (kind === 'lostpointercapture') {
        el.releasePointerCapture(id);
      } else if (kind === 'visibilitychange') {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      } else {
        window.dispatchEvent(new Event('blur'));
      }
    }, ending);
    // Engines may defer lostpointercapture to the next pointer event
    // ("pending pointer capture" in the spec; observed in Firefox).
    if (ending === 'lostpointercapture') await page.mouse.move(box.x + box.width / 2 + 21, box.y + box.height / 2 + 10);
    await settle(page);
    expect(await lab(page, `return h.capsule.pressed`)).toBe(false);
    await expect(page.locator('#capsuleMain')).not.toHaveAttribute('data-dragging', '');
    await expect(page.locator('#capsuleMain')).not.toHaveAttribute('data-pressed', '');
    expect((await stats(page)).animating).toBe(0);
    // A later move without a new pointerdown must not drag.
    const pos = await lab<{ x: number }>(page, `return h.capsule.position`);
    await page.mouse.move(box.x + 10, box.y + 10);
    expect((await lab<{ x: number }>(page, `return h.capsule.position`)).x).toBe(pos.x);
    await page.mouse.up();
  });
}

test('the motion loop stops at rest', async ({ page }) => {
  await lab(page, `h.capsule.setPosition(40, 40, false)`);
  await settle(page);
  const frames = await lab<number>(page, `return h.capsule.frames`);
  await page.waitForTimeout(500);
  expect(await lab<number>(page, `return h.capsule.frames`)).toBe(frames);
  expect((await stats(page)).animating).toBe(0);
});

test('capsule is movable with the keyboard', async ({ page }) => {
  await page.locator('#capsuleMain').focus();
  const a = await lab<{ x: number; y: number }>(page, `return h.capsule.position`);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowDown');
  await settle(page);
  const b = await lab<{ x: number; y: number }>(page, `return h.capsule.position`);
  expect(b.x).toBe(a.x - 8);
  expect(b.y).toBe(a.y + 8);
});

test('button works with Enter and Space and shows a focus ring', async ({ page }) => {
  await lab(page, `h.capsule.setPosition(0, 0)`);
  const button = page.locator('#centerButton');
  await button.focus();
  await page.keyboard.press('Enter');
  await settle(page);
  const centred = await lab<{ x: number }>(page, `return h.capsule.position`);
  expect(centred.x).toBeGreaterThan(0);
  await lab(page, `h.capsule.setPosition(0, 0)`);
  await page.keyboard.press(' ');
  await settle(page);
  expect((await lab<{ x: number }>(page, `return h.capsule.position`)).x).toBeCloseTo(centred.x, 0);
  // Focus ring comes from :focus-visible, independent of press and selection.
  const outline = await button.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
  await expect(button).not.toHaveAttribute('data-pressed', '');
});

test('three-option selector uses native radios and arrow keys', async ({ page }) => {
  const radios = page.locator('#sceneSegmented input[type=radio]');
  await expect(radios).toHaveCount(3);
  await radios.nth(0).focus();
  await expect(radios.nth(0)).toBeChecked();
  await page.keyboard.press('ArrowRight');
  await expect(radios.nth(1)).toBeChecked();
  await expect(page.locator('#stageMain .scene')).toHaveAttribute('data-scene', 'blocks');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#stageMain .scene')).toHaveAttribute('data-scene', 'photo');
});

test('press, hover and selection stay separate on the selector', async ({ page }) => {
  const option = page.locator('#sceneSegmented label').nth(2);
  const box = (await option.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#sceneSegmented')).not.toHaveAttribute('data-pressed', '');
  await page.mouse.down();
  await expect(page.locator('#sceneSegmented')).toHaveAttribute('data-pressed', '');
  // Pressing alone does not select.
  await expect(page.locator('#sceneSegmented input').nth(2)).not.toBeChecked();
  await page.mouse.up();
  await expect(page.locator('#sceneSegmented input').nth(2)).toBeChecked();
  await expect(page.locator('#sceneSegmented')).not.toHaveAttribute('data-pressed', '');
});

test('native slider drives refraction and its glass thumb follows without new maps', async ({ page }) => {
  const range = page.locator('#refractionRange');
  await range.focus();
  const before = await stats(page);
  const thumbBefore = (await lab<Rect[]>(page, `return h.componentRects()`))[2]!;
  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
  await settle(page);
  expect(await lab<number>(page, `return h.params.refraction`)).toBe(22 + 3);
  await expect(page.locator('#param-refraction')).toHaveValue('25');
  const thumbAfter = (await lab<Rect[]>(page, `return h.componentRects()`))[2]!;
  expect(thumbAfter.x).toBeGreaterThan(thumbBefore.x);
  expect((await stats(page)).mapRegenerations).toBe(before.mapRegenerations);
  const focusRing = await page.locator('.glass-thumb').evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(focusRing).not.toBe('none');
});

test('dragging the lens does not block scrolling the content', async ({ page }) => {
  expect(await page.locator('#capsuleMain').evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
  const scroller = page.locator('#stageMain .scroller');
  expect(await scroller.evaluate((el) => getComputedStyle(el).touchAction)).toBe('auto');
  const box = await capsuleBox(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2);
  await page.mouse.up();
  // Top-left corner: away from the lens (centred) and from the dock, which wraps
  // onto several rows when the stage is narrow.
  const stage = (await page.locator('#stageMain').boundingBox())!;
  await page.mouse.move(stage.x + 40, stage.y + 60);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
});

test('removing surfaces removes lenses, surface layers and filters', async ({ page }) => {
  expect((await stats(page)).surfaces).toBe(4);
  const lenses = () => page.locator('[data-jello-filters] feImage').count();
  expect(await lenses()).toBe(4);
  await lab(page, `h.setOption('components', false)`);
  await settle(page);
  expect((await stats(page)).surfaces).toBe(1);
  expect(await lenses()).toBe(1);
  expect(await page.locator('#centerButton .jello-surface').count()).toBe(0);
  await lab(page, `h.setOption('compare', true)`);
  await settle(page);
  expect(await page.locator('[data-jello-filters]').count()).toBe(2);
  await lab(page, `h.setOption('compare', false)`);
  await settle(page);
  expect(await page.locator('[data-jello-filters]').count()).toBe(1);
  expect(await page.locator('#sourceCompare').evaluate((el) => el.style.filter)).toBe('');
});
