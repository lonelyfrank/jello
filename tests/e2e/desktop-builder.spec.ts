import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ComponentDefinition } from '../../src/components';
import { unzip } from '../../src/export/zip';
import { lab, showPanel } from './helpers';

const nav = (page: Page) => page.locator('#stageMain .jello-dnav');
const node = (page: Page, id: string) => page.locator(`#structureTree [data-node="${id}"]`);
const doc = (page: Page) => lab<ComponentDefinition>(page, 'return JSON.parse(h.builder.json())');
async function open(page: Page, component = 'desktop-navbar') {
  await page.goto(`./?workspace=builder&component=${component}&scene=app&animate=0`);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await showPanel(page);
}
async function action(page: Page, kind: string, destination: string) {
  await page.locator('#tab-action-kind').selectOption(kind);
  await page.locator('#tab-action-destination').fill(destination);
  await page.locator('#tab-action-apply').click();
}

test('create Desktop visually, edit brand/items/regions/groups/actions/layout, save/reopen and export both packages', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, 'button');
  await page.locator('#newComponentWizard').click();
  await page.locator('input[name=componentType][value=desktop-navbar]').check();
  await page.getByRole('button', { name: 'Continua', exact: true }).click();
  await page.getByRole('button', { name: 'Continua', exact: true }).click();
  await page.locator('#openComponentBuilder').click();
  await expect(nav(page)).toBeVisible();
  await showPanel(page);
  await expect(page.locator('[data-tree-region]')).toHaveCount(3);
  await expect(page.locator('.canvas-states')).toContainText('Seleziona');
  await node(page, 'brand').click();
  await page.locator('#tab-label').fill('My studio');
  await page.locator('label[for=tab-icon-home]').click();
  await expect(page.locator('#tab-icon-home')).toBeChecked();
  await expect(nav(page).locator('[data-item=brand]')).toHaveAccessibleName('My studio');
  await expect(page.locator('.builder-highlight-name')).toHaveText('My studio');
  await page.locator('#tabAdd').click();
  const added = await lab<string>(page, 'return h.builder.state.selection');
  await page.locator('#tab-label').fill('Documentation');
  await page.locator('#navbar-region').selectOption('end');
  await expect(nav(page).locator(`[data-region=end] [data-item="${added}"]`)).toBeVisible();
  await page.locator('#structure-group-name').fill('Resources');
  await page.getByRole('button', { name: 'Crea gruppo', exact: true }).click();
  const group = await lab<string>(page, 'return h.builder.state.selection');
  await page.locator('#navbar-region').selectOption('end');
  await node(page, added).click();
  await page.locator('#tab-group').selectOption(group);
  await expect(nav(page).locator(`[data-item="${added}"]`)).toHaveAttribute('data-group', group);
  await page.locator('#tabDuplicate').click();
  const copy = await lab<string>(page, 'return h.builder.state.selection');
  await page.locator('#tabUp').click();
  await expect(nav(page).locator(`[data-group="${group}"]`)).toHaveCount(2);
  expect((await doc(page)).structure.children?.find((n) => n.id === group)?.children?.map((n) => n.id)).toEqual([copy, added]);
  await action(page, 'navigate', '#documentation');
  await expect(nav(page).locator(`[data-item="${copy}"]`)).toHaveAttribute('href', '#documentation');
  await action(page, 'navigate', 'javascript:alert(1)');
  await expect(page.locator('#inspectorMessages').last()).toContainText('non sicura');
  await expect(nav(page).locator(`[data-item="${copy}"]`)).toHaveAttribute('href', '#documentation');
  await node(page, 'action').click();
  await action(page, 'consumer', 'create-project');
  await node(page, 'root').click();
  await page.getByRole('button', { name: 'Avanzato', exact: true }).click();
  await page.locator('#bf-layout-height-num').fill('88');
  await page.locator('#bf-layout-widthMode').selectOption('fixed');
  await page.locator('#bf-layout-width-num').fill('600');
  await page.locator('#bf-layout-itemLayout').selectOption('stacked');
  await expect(nav(page)).toHaveCSS('height', '88px');
  await expect(nav(page)).toHaveAttribute('data-item-layout', 'stacked');
  await page.locator('#bf-layout-height-num').fill('-1');
  await expect(page.locator('#bf-layout-height-num')).toHaveAttribute('aria-invalid', 'true');
  expect((await doc(page)).layout.height).toBe(88);
  await page.locator('#bf-layout-height-num').fill('88');
  await showPanel(page);
  await page.locator('#cmpFamily').selectOption('solid');
  await expect(nav(page)).toHaveAttribute('data-material', 'solid');
  await page.locator('#cmpFamily').selectOption('glass');
  await page.locator('#tb-device-phone').click();
  await expect(nav(page)).toHaveAttribute('data-breakpoint', 'compact');
  await expect(page.locator('#navbarLayoutStatus')).toContainText('compact');
  await page.locator('#tb-device-desktop').click();
  await page.locator('#tb-pick').click();
  await nav(page).locator('[data-item=brand]').click();
  await expect(node(page, 'brand')).toHaveAttribute('aria-pressed', 'true');
  const before = await doc(page);
  await page.locator('#tab-preview-state').selectOption('hover');
  expect(await doc(page)).toEqual(before);
  await page.locator('#tb-interact').click();
  await nav(page).locator('[data-item=action]').click();
  await expect(node(page, 'brand')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.notice')).toContainText('create-project');
  await page.locator('#saveNow').click();
  await expect(page.locator('#cmpOrigin')).toHaveAttribute('data-origin', 'user');
  const saved = await doc(page);
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-kind', 'saved');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  expect(await doc(page)).toEqual(saved);
  await showPanel(page);
  await page.locator('#exportOpen').click();
  for (const format of ['react', 'vanilla']) {
    await page.locator(`#export-adapter-component-${format}`).check();
    await expect(page.locator('#exportPlan')).toContainText('source');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportGo').click()]);
    const entries = unzip(new Uint8Array(readFileSync((await download.path())!)));
    const config = entries.find((e) => e.path.endsWith('/component.json'))!;
    expect(JSON.parse(new TextDecoder().decode(config.data))).toEqual(saved);
    const js = entries.find((e) => e.path.endsWith('/index.js') && !e.path.includes('/runtime/'))!;
    expect(new TextDecoder().decode(js.data)).toContain('createComponent');
    expect(entries.some((e) => e.path.endsWith('/jello-manifest.json'))).toBe(true);
  }
});

test('logical groups highlight their visible geometry, retain selection and dissolve in place', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await page.locator('#structure-group-name').fill('Primary');
  await page.getByRole('button', { name: 'Crea gruppo', exact: true }).click();
  const group = await lab<string>(page, 'return h.builder.state.selection');
  await node(page, 'explore').click(); await page.locator('#tab-group').selectOption(group);
  await node(page, 'projects').click(); await page.locator('#tab-group').selectOption(group);
  await node(page, group).click();
  await expect(page.locator('#navbar-group-label')).toHaveValue('Primary');
  await page.locator('#navbar-group-label').fill('Workspace');
  await expect(node(page, group)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.builder-highlight-name')).toHaveText('Workspace');
  await expect(page.locator('.builder-highlight')).toBeVisible();
  await page.locator('#navbar-region').selectOption('end');
  await expect(nav(page).locator('[data-region=end] [data-group]')).toHaveCount(2);
  await page.locator('#navbarUngroup').click();
  await expect(node(page, group)).toHaveCount(0);
  await expect(nav(page).locator('[data-item=explore]')).not.toHaveAttribute('data-group');
  await expect(nav(page).locator('[data-region=end] [data-item=explore]')).toBeVisible();
});

for (const width of [320, 390, 768, 844, 1024, 1440]) test(`Desktop Builder Studio reflow at ${width}px and bidirectional Canvas selection`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 844 ? 390 : 900 });
  await open(page);
  const toggle = page.locator('#panelToggle');
  if (await toggle.isVisible()) await page.locator('#panelClose').click();
  await page.locator('#tb-pick').click();
  await nav(page).locator('[data-item=home]').click();
  await expect(node(page, 'home')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tab-label')).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if ([320, 390, 1440].includes(width)) await page.screenshot({ path: test.info().outputPath(`desktop-builder-${width}.png`), fullPage: true });
});

test('Canvas pick selects disabled controls and keyboard actions without changing the definition', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await node(page, 'action').click();
  await page.locator('#tab-disabled').check();
  await node(page, 'root').click();
  const before = await doc(page);
  await page.locator('#tb-pick').click();
  const target = (await nav(page).locator('[data-item=action]').boundingBox())!;
  await page.mouse.click(target.x + target.width / 2, target.y + target.height / 2);
  await expect(node(page, 'action')).toHaveAttribute('aria-pressed', 'true');
  await nav(page).locator('[data-item=brand]').focus();
  await page.keyboard.press('Enter');
  await expect(node(page, 'brand')).toHaveAttribute('aria-pressed', 'true');
  expect(await doc(page)).toEqual(before);
});

test('tree selection reveals overflowed Desktop controls inside their region', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page);
  await node(page, 'home').click();
  const id = await lab<string>(page, 'let id; for (let i = 0; i < 10; i++) id = h.builder.addTab(); return id');
  await page.locator('#tb-device-phone').click();
  await expect(nav(page)).toHaveAttribute('data-overflowing');
  await node(page, 'root').click();
  await node(page, id).click();
  await expect.poll(() => nav(page).locator(`[data-item="${id}"]`).evaluate((el) => {
    const r = el.getBoundingClientRect(), p = el.parentElement!.getBoundingClientRect();
    return r.left >= p.left - 1 && r.right <= p.right + 1;
  })).toBe(true);
  await expect(page.locator('.builder-highlight')).toBeVisible();
});

test('picking in Preview & Test returns to the existing Builder inspector and structure', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('./?studio=preview&workspace=builder&component=desktop-navbar&scene=app&animate=0');
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
  await page.locator('#tb-pick').click();
  await nav(page).locator('[data-item=brand]').click();
  await expect(page.locator('#lab')).toHaveAttribute('data-studio-area', 'editor');
  await expect(node(page, 'brand')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#tab-label')).toBeInViewport();
});
