import { expect, test, type Page } from '@playwright/test';
import { lab, openLab, settle, showPanel } from './helpers';

/** Opens the lab without scenario keys, so the last project is restored. */
async function reopen(page: Page) {
  await page.goto('./');
  await page.waitForSelector('html[data-ready=true]');
}

const saved = (page: Page) => expect(page.locator('#saveStatus')).toHaveAttribute('data-kind', 'saved', { timeout: 5000 });

test.describe('library and local persistence', () => {
  test('a personal copy is saved automatically and reopens after a reload', async ({ page }) => {
    await openLab(page, 'preset=navbar&object=navbar&scene=app&animate=0');
    await showPanel(page);
    await expect(page.locator('#activeOrigin')).toHaveAttribute('data-origin', 'builtin');
    await page.locator('#libDuplicate').click();
    await expect(page.locator('#activeOrigin')).toHaveAttribute('data-origin', 'user');
    const id = await lab<string>(page, `return h.materialId()`);
    expect(id).toMatch(/^user-/);
    await page.locator('#num-refraction').fill('17.5');
    await saved(page);
    // Rename (personal materials only).
    await page.locator('#libRename').click();
    await page.locator('#renameInput').fill('Navbar BT chiara');
    await page.locator('#renameInput').press('Enter');
    await expect(page.locator('#crumbPreset')).toHaveText('Navbar BT chiara');
    await saved(page);
    await reopen(page);
    expect(await lab<string>(page, `return h.materialId()`)).toBe(id);
    expect(await lab<number>(page, `return h.params.refraction`)).toBe(17.5);
    await expect(page.locator('#crumbPreset')).toHaveText('Navbar BT chiara');
    expect(await lab<string>(page, `return h.options().object`)).toBe('navbar');
    // Built-in and personal materials stay distinguishable.
    const lib = await lab<{ id: string; origin: string }[]>(page, `return h.library()`);
    expect(lib.filter((m) => m.origin === 'builtin').map((m) => m.id)).toContain('navbar');
    expect(lib.find((m) => m.id === id)?.origin).toBe('user');
  });

  test('editing a built-in keeps a draft, never overwrites the preset, and can be undone after switching', async ({ page }) => {
    await openLab(page, 'preset=optics&scene=grid&animate=0');
    await lab(page, `h.setParams({ blur: 6 })`);
    expect(await lab<boolean>(page, `return h.modified()`)).toBe(true);
    await expect(page.locator('#activeOrigin')).toContainText('modificato');
    await saved(page);
    await reopen(page);
    // The draft survives the reload; the built-in itself is unchanged.
    expect(await lab<number>(page, `return h.params.blur`)).toBe(6);
    expect(await lab<boolean>(page, `return h.modified()`)).toBe(true);
    await lab(page, `h.open('jello')`);
    expect(await lab<number>(page, `return h.params.blur`)).toBe(2);
    await expect(page.locator('#notice')).toContainText('scartate');
    await page.locator('#noticeUndo').click();
    expect(await lab<number>(page, `return h.params.blur`)).toBe(6);
    await lab(page, `h.open('jello'); h.open('optics')`);
    expect(await lab<number>(page, `return h.params.blur`)).toBe(0);
  });

  test('imports become personal materials; deleting returns to a built-in', async ({ page }) => {
    await openLab(page, 'preset=jello&scene=grid&animate=0');
    await showPanel(page);
    const v1 = JSON.stringify({ format: 'jello-glass', version: 1, params: { refraction: 40, band: 30 } });
    await page.locator('#paramsJson').fill(v1);
    await page.locator('#importParams').click();
    await expect(page.locator('#importMessages')).toHaveAttribute('data-ok', 'true');
    await expect(page.locator('#importMessages')).toContainText('Migrato da jello-glass@1');
    await expect(page.locator('#activeOrigin')).toHaveAttribute('data-origin', 'user');
    const id = await lab<string>(page, `return h.materialId()`);
    expect(await lab<number>(page, `return h.params.band`)).toBe(30);
    await page.locator('#libDelete').click();
    await page.locator('#libDeleteConfirm').click();
    expect(await lab<string>(page, `return h.materialId()`)).toBe('jello');
    await reopen(page);
    const lib = await lab<{ id: string }[]>(page, `return h.library()`);
    expect(lib.some((m) => m.id === id)).toBe(false);
  });

  test('a document from a newer version is refused and nothing changes', async ({ page }) => {
    await openLab(page, 'preset=jello&scene=grid&animate=0');
    await showPanel(page);
    const before = await lab(page, `return h.material()`);
    const doc = JSON.parse(await lab<string>(page, `return h.exportJson()`));
    await page.locator('#paramsJson').fill(JSON.stringify({ ...doc, schemaVersion: 3 }));
    await page.locator('#importParams').click();
    await expect(page.locator('#importMessages')).toHaveAttribute('data-ok', 'false');
    await expect(page.locator('#importMessages')).toContainText('versione più recente');
    expect(await lab(page, `return h.material()`)).toEqual(before);
    await page.locator('#paramsJson').fill(JSON.stringify({ ...doc, family: 'gel' }));
    await page.locator('#importParams').click();
    await expect(page.locator('#importMessages')).toContainText('non è ancora disponibile');
  });

  test('without IndexedDB the lab works and says nothing is persisted', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    });
    await openLab(page, 'preset=jello&scene=grid&animate=0');
    await expect(page.locator('#saveStatus')).toHaveAttribute('data-kind', 'memory');
    await lab(page, `h.setParams({ blur: 5 })`);
    await page.waitForTimeout(900);
    await expect(page.locator('#saveStatus')).toHaveAttribute('data-kind', 'memory');
    await expect(page.locator('#saveStatus')).toContainText('Non persistente');
  });

  test('a quota error is shown and never reported as saved', async ({ page }) => {
    await page.addInitScript(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
        if ((window as unknown as { __fullDisk?: boolean }).__fullDisk) throw new DOMException('Spazio esaurito (test)', 'QuotaExceededError');
        return put.apply(this, args);
      };
    });
    await openLab(page, 'preset=jello&scene=grid&animate=0');
    await page.evaluate(() => ((window as unknown as { __fullDisk: boolean }).__fullDisk = true));
    await lab(page, `h.setParams({ blur: 5 })`);
    await expect(page.locator('#saveStatus')).toHaveAttribute('data-kind', 'error', { timeout: 5000 });
    await expect(page.locator('#saveStatus')).toContainText('spazio esaurito');
    expect(await lab<{ kind: string; error: string }>(page, `return h.save()`)).toMatchObject({ kind: 'error', error: 'quota' });
  });

  test('scenario URLs are kept reproducible', async ({ page }) => {
    await openLab(page, 'preset=bt&object=navbar&nav=live&scene=app&animate=0&quality=economy');
    expect(await lab<string>(page, `return h.material().quality.profile`)).toBe('economy');
    await expect.poll(() => page.evaluate(() => location.search)).toContain('material=bt');
    const url = await lab<string>(page, `return h.scenarioUrl()`);
    expect(url).toContain('object=navbar');
    expect(url).toContain('nav=live');
    expect(url).toContain('quality=economy');
    const other = await page.context().newPage();
    await other.goto(url);
    await other.waitForSelector('html[data-ready=true]');
    expect(await other.evaluate(() => (window.__jello as { options(): { nav: string } }).options().nav)).toBe('live');
  });
});

test.describe('layout', () => {
  test('the page never scrolls: only the columns and the drawer do', async ({ page }) => {
    await openLab(page, 'preset=navbar&object=navbar&scene=app&animate=0');
    // Drawer open on narrow layouts, every properties section expanded: the most content possible.
    await showPanel(page);
    await settle(page);
    const size = await page.evaluate(() => ({ scroll: document.scrollingElement!.scrollHeight, viewport: innerHeight }));
    expect(size.scroll).toBeLessThanOrEqual(size.viewport);
  });
});
