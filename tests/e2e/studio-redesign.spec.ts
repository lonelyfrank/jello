import { expect, test, type Page } from '@playwright/test';
import { showPanel } from './helpers';

async function studio(page: Page, query = 'workspace=builder&component=mobile-navbar&scene=grid&animate=0&theme=dark') {
  await page.goto(`./?${query}`);
  await page.waitForSelector('html[data-ready=true]');
}

test('Studio navigation retains the same Stage and canonical component', async ({ page }) => {
  await studio(page);
  const before = await page.evaluate(() => {
    document.querySelector('.stages')!.setAttribute('data-retained-stage', 'yes');
    return (window.__jello as any).builder.doc;
  });
  await page.locator('#ws-library').click();
  await expect(page.locator('#studioLibrary')).toBeVisible();
  await page.locator('#ws-preview').click();
  await expect(page.locator('.stages')).toHaveAttribute('data-retained-stage', 'yes');
  await showPanel(page);
  await expect(page.locator('#testInspector')).toBeVisible();
  await expect(page.locator('[data-test-renderer]')).not.toBeEmpty();
  expect(await page.evaluate(() => (window.__jello as any).builder.doc)).toEqual(before);
});

test('Library searches real documents, filters categories and persists favorites', async ({ page }) => {
  await studio(page);
  await page.locator('#ws-library').click();
  await page.locator('#catalogSearch').fill('Solid');
  await expect(page.locator('.catalog-card')).toHaveCount(4);
  await expect(page.locator('.catalog-card .material-sample .jello-solid').first()).toBeAttached();
  await page.locator('.catalog-card').first().getByRole('button', { name: /ai preferiti/ }).click();
  await page.locator('#catalogSearch').clear();
  await page.getByRole('button', { name: /^Preferiti/ }).click();
  await expect(page.locator('.catalog-card')).toHaveCount(1);
  await page.waitForTimeout(900);
  await page.reload();
  await page.waitForSelector('html[data-ready=true]');
  await expect(page.locator('#studioLibrary')).toBeVisible();
  await page.getByRole('button', { name: /^Preferiti/ }).click();
  await expect(page.locator('.catalog-card')).toHaveCount(1);
});

test('Builder panels and inspector tabs expose contextual controls without changing data', async ({ page }) => {
  await studio(page);
  await showPanel(page);
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await expect(page.locator('#structureTree')).toBeVisible();
  await expect(page.locator('#bl-components')).toBeHidden();
  await page.getByRole('button', { name: 'Interactions', exact: true }).click();
  await expect(page.locator('[data-section=b-layout]')).toHaveCount(0);
  await expect(page.locator('[data-section=b-states]')).toBeAttached();
  await page.getByRole('button', { name: 'Advanced', exact: true }).click();
  await page.locator('[data-section=b-definition] > summary').click();
  const definition = JSON.parse(await page.locator('#studioDefinition').inputValue());
  expect(definition.format).toBe('jello-component-definition');
  expect(definition.schemaVersion).toBe(1);
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Asset del progetto', exact: true })).toBeVisible();
});

test('preview preferences restore from the URL and keyboard panel resizing does not alter documents', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Resize separators belong to the desktop layout. Mobile reflow is covered by screenshots.');
  await studio(page);
  await page.locator('#previewZoom').selectOption('0.75');
  const separator = page.getByRole('separator', { name: 'Larghezza inspector' });
  await separator.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(separator).toHaveAttribute('aria-valuenow', '344');
  await page.locator('#ws-preview').click();
  await expect(page).toHaveURL(/studio=preview/);
  await page.reload();
  await page.waitForSelector('html[data-ready=true]');
  await expect(page.locator('#ws-preview')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#previewZoom')).toHaveValue('0.75');
  await expect(page.getByRole('separator', { name: 'Larghezza inspector' })).toHaveAttribute('aria-valuenow', '344');
});

test('five export steps download the existing canonical JSON adapter', async ({ page }) => {
  await studio(page);
  await page.locator('#ws-export').click();
  await page.getByRole('button', { name: '1 Elemento', exact: true }).click();
  await page.locator('#export-target-configuration').check();
  await page.getByRole('button', { name: 'Continua', exact: true }).click();
  await page.locator('#export-adapter-component-json').check();
  for (let step = 1; step < 4; step++) await page.getByRole('button', { name: 'Continua', exact: true }).click();
  await expect(page.locator('#exportPlan')).toContainText('.jello-component.json');
  const download = page.waitForEvent('download');
  await page.locator('#exportGo').click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await expect(page.locator('#exportMessages')).toHaveAttribute('data-ok', 'true');
});

test('Jello backgrounds coexist with diagnostic scenes and survive reload', async ({ page }) => {
  await studio(page);
  await page.locator('#tb-background').selectOption('jelly-spectrum');
  await expect(page.locator('.scene-jelly-spectrum img').first()).toBeAttached();
  await expect(page.locator('#tb-background option[value=photo]')).toHaveCount(1);
  await expect(page.locator('#tb-background option[value=coords]')).toHaveCount(1);
  await expect(page).toHaveURL(/scene=jelly-spectrum/);
  await page.reload();
  await page.waitForSelector('html[data-ready=true]');
  await expect(page.locator('#tb-background')).toHaveValue('jelly-spectrum');
});

for (const family of ['glass', 'solid'] as const) {
  test(`Preview & Test handles a customized primary ${family} button without unstable store snapshots`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await studio(page, 'workspace=builder&component=button&animate=0&theme=dark');
    await page.evaluate((family) => {
      const h = window.__jello as any;
      h.builder.setFamily(family);
      h.builder.setField('style.variant', 'primary');
      h.builder.setControl(family === 'glass' ? 'blur' : 'fill', family === 'glass' ? 12 : '#7142ae');
    }, family);
    const before = await page.evaluate(() => (window.__jello as any).builder.json());
    await page.locator('#ws-preview').click();
    await showPanel(page);
    await expect(page.locator('#testInspector')).toBeVisible();
    await expect(page.locator('[data-test-renderer]')).not.toBeEmpty();
    expect(await page.evaluate(() => (window.__jello as any).builder.json())).toBe(before);
    expect(errors).toEqual([]);
  });
}
