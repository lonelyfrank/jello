import { expect, test, type Page } from '@playwright/test';
import { lab, openLab, settle, showPanel, type Rect } from './helpers';

const NAVBAR = 'object=navbar&scene=app&animate=0';
type Lenses = { main: string[]; compare: string[] | null; active: string | null; activeCompare: string | null; components: string[] };

const lenses = (page: Page) => lab<Lenses>(page, `return h.lenses()`);
const navRect = (page: Page) => lab<Rect | null>(page, `return h.navbar.rect`);
const item = (page: Page, label: string, stage = '#stageMain') => page.locator(`${stage} .nav-item`, { hasText: label });
const selected = (page: Page, stage = '#stageMain') => page.locator(`${stage} .nav-item[aria-current=page]`);

/** Every lens in the filter belongs to a surface that is mounted and visible. */
async function expectOnlyMountedLenses(page: Page) {
  const l = await lenses(page);
  const expected = [l.active, ...l.components].filter(Boolean).sort();
  expect([...l.main].sort()).toEqual(expected);
  // One material layer per mounted surface, none left in hidden hosts.
  const layers = await page.locator('#stageMain .jello-surface').count();
  expect(layers).toBe(expected.length);
  expect(await page.locator('#stageMain [hidden] .jello-surface').count()).toBe(0);
  expect(await page.locator('#stageMain .navbar').count()).toBe(1);
}

test.describe('navbar', () => {
  test.beforeEach(async ({ page }) => {
    await openLab(page, NAVBAR);
  });

  test('is anchored at the bottom with three labelled, touch-sized items', async ({ page }) => {
    const nav = page.locator('#stageMain .navbar');
    await expect(nav).toBeVisible();
    await expect(nav).toHaveAttribute('aria-label', /Navigazione/);
    await expect(page.locator('#stageMain .nav-item')).toHaveText(['Home', 'Explore', 'Profile']);
    await expect(page.locator('#capsuleMain')).toBeHidden();
    const stage = (await page.locator('#stageMain').boundingBox())!;
    const box = (await nav.boundingBox())!;
    expect(stage.y + stage.height - (box.y + box.height)).toBeGreaterThanOrEqual(11);
    expect(stage.y + stage.height - (box.y + box.height)).toBeLessThan(40);
    expect(box.x).toBeGreaterThanOrEqual(stage.x + 11);
    expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width - 11);
    for (const b of await page.locator('#stageMain .nav-item').all()) {
      const r = (await b.boundingBox())!;
      expect(r.height).toBeGreaterThanOrEqual(44);
      expect(r.width).toBeGreaterThanOrEqual(44);
    }
    // Icons and labels are foreground: never inside the filtered source.
    expect(await page.evaluate(() => document.getElementById('sourceMain')!.contains(document.querySelector('.nav-label')))).toBe(false);
    expect(await page.locator('#stageMain .nav-item').first().evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    expect((await lab<{ effective: string }>(page, `return h.status()`)).effective).toBe('refraction');
    await expectOnlyMountedLenses(page);
  });

  test('stays still while the content scrolls under it; wheel over the bar scrolls the content', async ({ page }) => {
    const scroller = page.locator('#stageMain .scroller');
    const before = (await page.locator('#stageMain .navbar').boundingBox())!;
    const lensBefore = await navRect(page);
    const maps = (await lab<{ mapRegenerations: number }>(page, `return h.stats()`)).mapRegenerations;
    await scroller.evaluate((el) => (el.scrollTop = 420));
    await settle(page);
    expect(await scroller.evaluate((el) => el.scrollTop)).toBe(420);
    expect((await page.locator('#stageMain .navbar').boundingBox())!).toEqual(before);
    expect(await navRect(page)).toEqual(lensBefore);
    await scroller.evaluate((el) => (el.scrollTop = 100));
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    expect((await lab<{ mapRegenerations: number }>(page, `return h.stats()`)).mapRegenerations).toBe(maps);
    // The last line of content can be scrolled above the bar.
    await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await settle(page);
    const foot = (await page.locator('#stageMain .app-foot').boundingBox())!;
    expect(foot.y + foot.height).toBeLessThanOrEqual(before.y);
  });

  test('press is transient and never replaces the selection', async ({ page }) => {
    await expect(selected(page)).toHaveText('Home');
    const target = (await item(page, 'Profile').boundingBox())!;
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2);
    await page.mouse.down();
    await expect(item(page, 'Profile')).toHaveAttribute('data-pressed', '');
    await expect(page.locator('#stageMain .navbar')).toHaveAttribute('data-pressed', '');
    expect(await lab(page, `return h.navbar.pressedItem`)).toBe('profile');
    // Still the old selection while pressed.
    await expect(selected(page)).toHaveText('Home');
    await page.mouse.up();
    await expect(selected(page)).toHaveText('Profile');
    await expect(item(page, 'Profile')).not.toHaveAttribute('data-pressed', '');
    await expect(page.locator('#stageMain .navbar')).not.toHaveAttribute('data-pressed', '');
    // Pressing and leaving before release does not select.
    const live = (await item(page, 'Explore').boundingBox())!;
    await page.mouse.move(live.x + live.width / 2, live.y + live.height / 2);
    await page.mouse.down();
    await page.mouse.move(live.x + live.width / 2, live.y - 80, { steps: 4 });
    await expect(item(page, 'Explore')).not.toHaveAttribute('data-pressed', '');
    await page.mouse.up();
    await expect(selected(page)).toHaveText('Profile');
    await settle(page);
    expect((await lab<{ animating: number }>(page, `return h.stats()`)).animating).toBe(0);
  });

  test('works with the keyboard and shows a visible focus ring', async ({ page }) => {
    await item(page, 'Home').focus();
    await page.keyboard.press('ArrowRight');
    await expect(item(page, 'Explore')).toBeFocused();
    // Arrow keys move focus only; selection is still Home.
    await expect(selected(page)).toHaveText('Home');
    const ring = await item(page, 'Explore').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(ring).not.toBe('none');
    await page.keyboard.down(' ');
    await expect(item(page, 'Explore')).toHaveAttribute('data-pressed', '');
    await expect(selected(page)).toHaveText('Home');
    await page.keyboard.up(' ');
    await expect(selected(page)).toHaveText('Explore');
    await page.keyboard.press('End');
    await expect(item(page, 'Profile')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(selected(page)).toHaveText('Profile');
    await page.keyboard.press('ArrowRight');
    await expect(item(page, 'Home')).toBeFocused();
    // The panel reflects the same state.
    await expect(page.locator('#opt-nav')).toHaveValue('profile');
  });

  test('indicator follows the selection as a visual layer, not a lens', async ({ page }) => {
    const ind = page.locator('#stageMain .nav-indicator');
    const x0 = (await ind.boundingBox())!.x;
    await item(page, 'Profile').click();
    await settle(page);
    await page.waitForTimeout(400);
    const r = (await ind.boundingBox())!;
    const it = (await item(page, 'Profile').boundingBox())!;
    expect(r.x).toBeGreaterThan(x0);
    expect(Math.abs(r.x - it.x)).toBeLessThan(1.5);
    expect(Math.abs(r.width - it.width)).toBeLessThan(1.5);
    expect(await ind.evaluate((el) => el.classList.contains('jello-host') || !!el.querySelector('.jello-surface'))).toBe(false);
    expect((await lenses(page)).main).toHaveLength(1);
  });

  test('sidebar, toolbar and lab state stay in sync', async ({ page }) => {
    await showPanel(page);
    await expect(page.locator('#tb-object-navbar')).toBeChecked();
    await page.locator('label[for=tb-object-capsule]').click();
    await expect(page.locator('#tb-object-capsule')).toBeChecked();
    expect(await lab(page, `return h.options().object`)).toBe('capsule');
    await lab(page, `h.setOption('object', 'navbar')`);
    await expect(page.locator('#tb-object-navbar')).toBeChecked();
    await page.locator('#tb-compare').click();
    await expect(page.locator('#tb-compare')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#tb-single')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#stageCompare')).toBeVisible();
    await page.locator('#tb-single').click();
    expect(await lab(page, `return h.options().compare`)).toBe(false);
    await page.locator('label[for=tb-scene-grid]').click();
    await expect(page.locator('#tb-scene-grid')).toBeChecked();
    await expect(page.locator('#stageMain .scene')).toHaveAttribute('data-scene', 'grid');
    await lab(page, `h.setOption('scene', 'text')`);
    await expect(page.locator('#tb-scene-text')).toBeChecked();
  });

  test('scroll reset returns every stage to the top', async ({ page }) => {
    await lab(page, `h.setOption('compare', true)`);
    await settle(page);
    await page.locator('#stageMain .scroller').evaluate((el) => (el.scrollTop = 500));
    await expect.poll(() => page.locator('#stageCompare .scroller').evaluate((el) => el.scrollTop)).toBe(500);
    await page.locator('#tb-scrollTop').click();
    await expect.poll(() => page.locator('#stageMain .scroller').evaluate((el) => el.scrollTop)).toBe(0);
    await expect.poll(() => page.locator('#stageCompare .scroller').evaluate((el) => el.scrollTop)).toBe(0);
  });
});

test.describe('compare', () => {
  test('shows the same object on both sides and syncs selection, scene and scroll', async ({ page }) => {
    await openLab(page, `${NAVBAR}&compare=1`);
    await expect(page.locator('#stageCompare .navbar')).toBeVisible();
    await expect(page.locator('#capsuleCompare')).toBeHidden();
    await item(page, 'Explore').click();
    await expect(selected(page, '#stageCompare')).toHaveText('Explore');
    await item(page, 'Profile', '#stageCompare').click();
    await expect(selected(page)).toHaveText('Profile');
    expect(await lab(page, `return h.navbar.compareSelected`)).toBe('profile');
    await page.locator('#stageCompare .scroller').evaluate((el) => (el.scrollTop = 300));
    await expect.poll(() => page.locator('#stageMain .scroller').evaluate((el) => el.scrollTop)).toBe(300);
    await lab(page, `h.setOption('object', 'capsule')`);
    await settle(page);
    await expect(page.locator('#capsuleCompare')).toBeVisible();
    await expect(page.locator('#stageCompare .navbar')).toBeHidden();
    const l = await lenses(page);
    // The compare stage is satin: no lenses there.
    expect(l.compare).toEqual([]);
    expect(l.activeCompare).not.toBeNull();
    // Selection survives the round trip.
    await lab(page, `h.setOption('object', 'navbar')`);
    await expect(selected(page, '#stageCompare')).toHaveText('Profile');
  });

  test('compare label reports the path really used, including the opaque fallback', async ({ page }) => {
    await openLab(page, `${NAVBAR}&compare=1`);
    await settle(page);
    await expect(page.locator('#stageCompareLabel')).toHaveAttribute('data-effective', 'satin');
    await expect(page.locator('#stageCompareLabel')).toHaveText('Satinato CSS');
    await lab(page, `h.setOption('reduceTransparency', true)`);
    await settle(page);
    await expect(page.locator('#stageCompareLabel')).toHaveAttribute('data-effective', 'opaque');
    await expect(page.locator('#stageCompareLabel')).toHaveText(/Opaco · richiesto Satinato/);
    await expect(page.locator('#stageCompare .navbar .jello-surface')).toHaveAttribute('data-jello-path', 'opaque');
    await expect(page.locator('#stageMainLabel')).toHaveText('Opaco');
    await expect(page.locator('[data-status=compare]')).toContainText('effettivo Opaco');
  });
});

test.describe('lifecycle', () => {
  test('repeated capsule/navbar switches leave no residual lens, layer or binding', async ({ page }) => {
    await openLab(page, 'scene=grid&animate=0');
    await lab(page, `h.capsule.setPosition(30, 40)`);
    await lab(page, `h.setParams({ refraction: 31 })`);
    await settle(page);
    const statsStart = await lab<{ mapRegenerations: number }>(page, `return h.stats()`);
    for (let i = 0; i < 6; i++) {
      await lab(page, `h.setOption('object', 'navbar')`);
      await settle(page);
      await expectOnlyMountedLenses(page);
      expect((await lenses(page)).components).toEqual([]);
      await expect(page.locator('#dock')).toBeHidden();
      await lab(page, `h.setOption('object', 'capsule')`);
      await settle(page);
      await expectOnlyMountedLenses(page);
      expect((await lenses(page)).components).toHaveLength(3);
    }
    expect((await lab<{ surfaces: number }>(page, `return h.stats()`)).surfaces).toBe(4);
    expect(await page.locator('[data-jello-filters]').count()).toBe(1);
    // Parameters and capsule position are kept.
    expect(await lab<number>(page, `return h.params.refraction`)).toBe(31);
    expect(await lab(page, `return h.capsule.position`)).toEqual({ x: 30, y: 40 });
    // Geometry repeats: the cache serves it, at most one new map per distinct shape.
    const statsEnd = await lab<{ mapRegenerations: number; mapCacheHits: number }>(page, `return h.stats()`);
    expect(statsEnd.mapRegenerations - statsStart.mapRegenerations).toBeLessThanOrEqual(1);
    // A hidden capsule does not react to the keyboard any more (listeners released).
    await lab(page, `h.setOption('object', 'navbar')`);
    await page.locator('#capsuleMain').evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
    expect(await lab(page, `return h.capsule.position`)).toEqual({ x: 30, y: 40 });
  });

  test('switching during an animation, resizing and changing path never revive a hidden lens', async ({ page }) => {
    await openLab(page, 'scene=grid&animate=0&components=0');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await lab(page, `h.capsule.setPosition(200, 200, false)`);
    // Spring still travelling when the capsule is unmounted.
    expect(await lab<boolean>(page, `return h.capsule.animating`)).toBe(true);
    await lab(page, `h.setOption('object', 'navbar')`);
    await settle(page);
    expect((await lab<{ animating: number }>(page, `return h.stats()`)).animating).toBe(0);
    await expectOnlyMountedLenses(page);
    const vp = page.viewportSize()!;
    await page.setViewportSize({ width: Math.round(vp.width * 0.85), height: Math.round(vp.height * 0.9) });
    await settle(page);
    await expectOnlyMountedLenses(page);
    for (const path of ['satin', 'opaque', 'refraction', 'auto'] as const) {
      await lab(page, `h.setOption('path', '${path}')`);
      await settle(page);
      const l = await lenses(page);
      expect(l.main, path).toEqual(path === 'satin' || path === 'opaque' ? [] : [l.active]);
    }
    await page.setViewportSize(vp);
    await settle(page);
    await expectOnlyMountedLenses(page);
    // The navbar lens follows the resized layout.
    const rect = (await navRect(page))!;
    const box = (await page.locator('#stageMain .navbar').boundingBox())!;
    expect(Math.abs(rect.width - box.width)).toBeLessThan(1);
  });

  test('a host hidden by layout drops its lens', async ({ page }) => {
    await openLab(page, 'scene=grid&animate=0');
    expect((await lenses(page)).main).toHaveLength(4);
    await page.locator('#centerButton').evaluate((el) => (el.style.display = 'none'));
    await settle(page);
    expect((await lenses(page)).main).toHaveLength(3);
    await page.locator('#centerButton').evaluate((el) => (el.style.display = ''));
    await settle(page);
    expect((await lenses(page)).main).toHaveLength(4);
  });
});

test.describe('diagnostic map', () => {
  test('belongs to the mounted object, with its size, on every path', async ({ page }) => {
    await openLab(page, NAVBAR);
    await settle(page);
    const check = async (inUse: boolean) => {
      await settle(page);
      await page.waitForTimeout(200);
      const info = await lab<{ surface: string; object: string; inUse: boolean }>(page, `return h.map()`);
      const l = await lenses(page);
      expect(info.surface).toBe(l.active);
      expect(info.inUse).toBe(inUse);
      await showPanel(page);
      await page.locator('#panelTab-rendering').click();
      const size = await page.locator('#mapPreview').evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight }));
      return { info, size };
    };
    const nav = (await navRect(page))!;
    let r = await check(true);
    expect(r.info.object).toBe('navbar');
    expect(r.size).toEqual({ w: Math.ceil(nav.width), h: Math.ceil(nav.height) });
    await lab(page, `h.setOption('path', 'satin')`);
    r = await check(false);
    expect(r.size).toEqual({ w: Math.ceil(nav.width), h: Math.ceil(nav.height) });
    await lab(page, `h.setOption('path', 'auto'); h.setOption('object', 'capsule')`);
    r = await check(true);
    expect(r.info.object).toBe('capsule');
    expect(r.size).toEqual({ w: 280, h: 104 });
    // The overlay sits on the mounted host.
    await lab(page, `h.setOption('showMap', true)`);
    await expect(page.locator('#capsuleMain .map-overlay')).toBeVisible();
    await lab(page, `h.setOption('object', 'navbar')`);
    await expect(page.locator('#stageMain .navbar .map-overlay')).toBeVisible();
  });
});

test.describe('numeric controls', () => {
  test.beforeEach(async ({ page }) => {
    await openLab(page, NAVBAR);
    await showPanel(page);
  });

  test('slider and numeric field stay in sync', async ({ page }) => {
    const range = page.locator('#param-refraction');
    const text = page.locator('#num-refraction');
    await expect(text).toHaveValue('10');
    await range.fill('30');
    await expect(text).toHaveValue('30');
    expect(await lab<number>(page, `return h.params.refraction`)).toBe(30);
    await text.fill('12.5');
    await expect(range).toHaveValue('12.5');
    expect(await lab<number>(page, `return h.params.refraction`)).toBe(12.5);
    await text.fill('7,5');
    expect(await lab<number>(page, `return h.params.refraction`)).toBe(7.5);
    await text.press('ArrowUp');
    expect(await lab<number>(page, `return h.params.refraction`)).toBe(8);
    await expect(text).toHaveValue('8');
    await expect(page.locator('#unit-refraction')).toHaveText('px');
    await expect(page.locator('#desc-refraction')).toContainText('passo 0.5');
    // Toolbar-independent change (preset) updates both.
    await page.locator('#preset').selectOption('deep');
    await expect(text).toHaveValue('36');
    await expect(range).toHaveValue('36');
  });

  test('invalid values are rejected and never reach the renderer', async ({ page }) => {
    const text = page.locator('#num-refraction');
    const before = await lab<Record<string, unknown>>(page, `return h.params`);
    const writes = (await lab<{ attributeWrites: number }>(page, `return h.stats()`)).attributeWrites;
    for (const bad of ['', 'abc', '1e999', '999', '-41', '10.3', '12px']) {
      await text.fill(bad);
      await expect(text, bad).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#err-refraction'), bad).toBeVisible();
      expect(await lab(page, `return h.params`)).toEqual(before);
    }
    expect((await lab<{ attributeWrites: number }>(page, `return h.stats()`)).attributeWrites).toBe(writes);
    await expect(page.locator('#param-refraction')).toHaveValue('10');
    // Leaving the field restores the value in use.
    await text.blur();
    await expect(text).toHaveValue('10');
    await expect(text).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#err-refraction')).toContainText('resta 10');
  });

  test('capsule-only controls are disabled for the navbar, and explained', async ({ page }) => {
    for (const k of ['width', 'height']) {
      await expect(page.locator(`#param-${k}`)).toBeDisabled();
      await expect(page.locator(`#num-${k}`)).toBeDisabled();
      await expect(page.locator(`#note-${k}`)).toContainText('layout CSS');
    }
    await expect(page.locator('#opt-components')).toBeDisabled();
    await expect(page.locator('#param-refraction')).toBeEnabled();
    await lab(page, `h.setOption('object', 'capsule')`);
    await expect(page.locator('#param-width')).toBeEnabled();
    await expect(page.locator('#note-width')).toBeHidden();
    await expect(page.locator('#param-radius')).toBeDisabled(); // capsule shape
    await lab(page, `h.setOption('path', 'satin')`);
    await expect(page.locator('[data-param-field=refraction]')).toHaveAttribute('data-applicable', 'inactive');
  });
});

test.describe('accessibility fallbacks', () => {
  test('reduced motion: the indicator jumps, the press does not scale', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openLab(page, 'object=navbar&scene=app');
    await expect(page.locator('#stages')).not.toHaveClass(/is-animated/);
    expect(await page.locator('#stageMain .nav-indicator').evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s/);
    const b = (await item(page, 'Explore').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(150);
    expect(await page.locator('#stageMain .navbar .jello-surface').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    await page.mouse.up();
    await expect(selected(page)).toHaveText('Explore');
  });

  test('forced colours and opaque path keep the navbar usable', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openLab(page, NAVBAR);
    expect((await lab<{ effective: string }>(page, `return h.status()`)).effective).toBe('opaque');
    expect(await page.locator('#sourceMain').evaluate((el) => getComputedStyle(el).filter)).toBe('none');
    expect((await lenses(page)).main).toEqual([]);
    await item(page, 'Profile').click();
    await expect(selected(page)).toHaveText('Profile');
  });
});
