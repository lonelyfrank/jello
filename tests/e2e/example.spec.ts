/**
 * Consumer example (examples/navbar-bt), served on its own origin from the
 * export package prepared with the built library: it must never fetch lab
 * sources.
 */
import { expect, test, type Page } from '@playwright/test';

const EXAMPLE = 'http://127.0.0.1:4175/';

async function open(page: Page, query = '') {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${EXAMPLE}${query}`);
  await page.waitForSelector('html[data-ready=true]');
  await page.waitForTimeout(200);
  return { requests, errors };
}

const ex = <T>(page: Page, body: string) => page.evaluate(`(() => { const e = window.__example; ${body} })()`) as Promise<T>;

test('loads the built runtime from the package, never the lab sources', async ({ page, browserName }) => {
  const { requests, errors } = await open(page);
  expect(errors).toEqual([]);
  expect(requests.some((u) => u.endsWith('/jello/runtime/jello.js'))).toBe(true);
  expect(requests.some((u) => /\/src\/|:4173\//.test(u))).toBe(false);
  // Only DOM materials here: the WebGL2 chunk is never fetched.
  expect(requests.some((u) => /scene-view-/.test(u))).toBe(false);
  const effective = await page.locator('#status').getAttribute('data-effective');
  if (browserName === 'chromium') expect(effective).toBe('svg');
  else expect(['svg', 'css']).toContain(effective);
  await expect(page.locator('[data-jello-filters]')).toHaveCount(effective === 'svg' ? 1 : 1);
});

test('active tab, press and scrolling content', async ({ page }) => {
  await open(page);
  const live = page.locator('.tab[data-tab=live]');
  await live.click();
  await expect(live).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.tab[data-tab=home]')).not.toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#sectionTitle')).toHaveText('Live');
  // Press is transient and does not select.
  const box = (await page.locator('.tab[data-tab=results]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator('#tabbar')).toHaveAttribute('data-pressed');
  await page.mouse.move(box.x + box.width / 2, box.y - 200);
  await page.mouse.up();
  await expect(page.locator('#tabbar')).not.toHaveAttribute('data-pressed');
  expect(await ex<string>(page, 'return e.selected')).toBe('live');
  // Keyboard.
  await live.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.tab[data-tab=matrix]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.tab[data-tab=matrix]')).toHaveAttribute('aria-current', 'page');
  // Content scrolls under the bar (wheel over the bar too).
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 400);
  await expect.poll(() => page.locator('#content').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
});

test('destroy leaves no filter, layer or listener behind', async ({ page }) => {
  await open(page);
  await ex(page, 'e.destroy()');
  await expect(page.locator('[data-jello-filters]')).toHaveCount(0);
  await expect(page.locator('.jello-surface')).toHaveCount(0);
  expect(await page.locator('#content').evaluate((el) => el.style.filter)).toBe('');
});

test('backend override from the URL is honoured', async ({ page }) => {
  await open(page, '?backend=css');
  await expect(page.locator('#status')).toHaveAttribute('data-effective', 'css');
  await expect(page.locator('#tabbar .jello-surface')).toHaveAttribute('data-jello-path', 'satin');
});
