/**
 * M6.4.2 §7.1 / §14.5 «runtime sperimentale mancante»: the experimental Jello chunks are fetched on demand. When a fetch fails, the
 * failure stays inside the experimental area; the stable Studio, the project and the person's way out are untouched, and a retry
 * works once the network is back.
 */
import { expect, test, type Page } from '@playwright/test';
import { showPanel } from './helpers';

const JELLY_CHUNKS = /\/assets\/(JellyMain|jelly-lab|JellyCatalogPreview|BuilderTrial)-/;

async function startKit(page: Page) {
  await page.goto('./');
  await page.waitForSelector('html[data-ready=true]');
  await page.locator('#startKit').click();
  await expect(page.locator('#lab')).toBeVisible();
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-kind', 'saved', { timeout: 8000 });
}

test('the Jello Lab chunk fails: the Studio stays usable, the failure is explained and a retry recovers', async ({ page }) => {
  await startKit(page);
  let offline = true;
  await page.route(JELLY_CHUNKS, (route) => (offline ? route.abort() : route.continue()));
  await page.locator('#ws-jelly').click();
  const failure = page.locator('[data-experimental-failed]');
  await expect(failure).toBeVisible();
  await expect(failure).toContainText('Il Jello Lab non si è caricato');
  await expect(failure).toContainText('il resto dello Studio');
  // Everything stable is still there and still works.
  await expect(page.locator('.studio-rail')).toBeVisible();
  await page.locator('#ws-material').click();
  await expect(page.locator('#lab')).toBeVisible();
  await expect(failure).toBeHidden(); // not drawn over another page
  await page.locator('#ws-builder').click();
  await expect(page.getByRole('heading', { name: 'Component Builder' })).toBeVisible();
  // Network back: «Riprova» loads the lab without reloading the page.
  offline = false;
  await page.locator('#ws-jelly').click();
  await expect(failure).toBeVisible();
  await failure.getByRole('button', { name: 'Riprova' }).click();
  await expect(page.locator('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-experimental-failed]')).toHaveCount(0);
});

test('the Library previews of Jello fail: only their cards say so; stable cards keep working', async ({ page }) => {
  await startKit(page);
  await page.route(JELLY_CHUNKS, (route) => route.abort());
  await page.locator('#ws-library').click();
  await page.locator('.home-tabs .pill', { hasText: 'Jello' }).click();
  await expect(page.locator('.catalog-card [data-experimental-failed]').first()).toBeVisible();
  await expect(page.locator('.catalog-card')).toHaveCount(4);
  await page.locator('.home-tabs .pill', { hasText: 'Tutti' }).click();
  await expect(page.locator('.catalog-card', { hasText: 'Glass · Frosted' }).first()).toBeVisible();
  await expect(page.locator('#studioLibrary')).toBeVisible();
});

test('the Builder trial chunk fails: the component, its inspector and the stable material are untouched', async ({ page }) => {
  await startKit(page);
  await page.route(JELLY_CHUNKS, (route) => route.abort());
  await page.locator('#ws-builder').click();
  await page.evaluate(() => (window as unknown as { __jello: { builder: { open(id: string): void } } }).__jello.builder.open('button'));
  const before = await page.evaluate(() => JSON.stringify((window as unknown as { __jello: { builder: { doc: unknown } } }).__jello.builder.doc));
  await showPanel(page); // on phones the inspector is a drawer
  await page.locator('#jl-trial-toggle').check();
  await expect(page.locator('[data-experimental-failed]')).toContainText('La prova Jello non si è caricato');
  const after = await page.evaluate(() => JSON.stringify((window as unknown as { __jello: { builder: { doc: unknown } } }).__jello.builder.doc));
  expect(after).toBe(before);
  await expect(page.locator('#stageMain')).toBeVisible();
});
