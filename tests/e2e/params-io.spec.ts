import { expect, test } from '@playwright/test';
import { OPTICS, lab, openLab, showPanel } from './helpers';

test.beforeEach(async ({ page }) => {
  await openLab(page, OPTICS);
  await showPanel(page);
});

test('export → import round trip keeps every parameter', async ({ page }) => {
  await lab(page, `h.setParams({ refraction: 31.5, profile: 'smooth', tint: '#3366cc', chroma: 0.2 })`);
  const before = await lab<Record<string, unknown>>(page, `return h.params`);
  await page.locator('#exportParams').click();
  const text = await page.locator('#paramsJson').inputValue();
  const doc = JSON.parse(text);
  // The preset JSON is now jello-material v2: same parameters, split into sections.
  expect(doc.format).toBe('jello-material');
  expect(doc.schemaVersion).toBe(2);
  expect({ ...doc.material, ...doc.geometry, ...doc.behavior }).toEqual(before);
  await page.locator('#resetParams').click();
  expect(await lab<number>(page, `return h.params.refraction`)).toBe(22);
  await page.locator('#paramsJson').fill(text);
  await page.locator('#importParams').click();
  await expect(page.locator('#importMessages')).toHaveAttribute('data-ok', 'true');
  expect(await lab(page, `return h.params`)).toEqual(before);
  // Panel controls reflect the imported values.
  await expect(page.locator('#param-refraction')).toHaveValue('31.5');
  await expect(page.locator('#param-profile')).toHaveValue('smooth');
});

test('invalid imports are rejected with reasons and change nothing', async ({ page }) => {
  const before = await lab(page, `return h.params`);
  const cases = [
    '{ not json',
    JSON.stringify({ format: 'jello-glass', version: 1, params: { refraction: 999 } }),
    JSON.stringify({ format: 'jello-glass', version: 1, params: { profile: 'spiral', tint: 'red' } }),
    JSON.stringify({ format: 'other', version: 1, params: {} }),
  ];
  for (const text of cases) {
    await page.locator('#paramsJson').fill(text);
    await page.locator('#importParams').click();
    await expect(page.locator('#importMessages')).toHaveAttribute('data-ok', 'false');
    await expect(page.locator('#importMessages li').nth(1)).not.toBeEmpty();
    expect(await lab(page, `return h.params`)).toEqual(before);
  }
  await expect(page.locator('#importMessages')).toContainText('format');
});

test('partial imports fill defaults and report warnings', async ({ page }) => {
  await page.locator('#paramsJson').fill(JSON.stringify({ format: 'jello-glass', version: 1, params: { blur: 7, sparkle: 1 } }));
  await page.locator('#importParams').click();
  await expect(page.locator('#importMessages')).toHaveAttribute('data-ok', 'true');
  await expect(page.locator('#importMessages')).toContainText('sparkle');
  expect(await lab<number>(page, `return h.params.blur`)).toBe(7);
});

test('official presets apply and none is labelled as an approximation', async ({ page }) => {
  await page.locator('#preset').selectOption('deep');
  await expect(page.locator('#presetNote')).toHaveAttribute('data-approximation', 'false');
  expect(await lab<number>(page, `return h.params.band`)).toBe(36);
  await page.locator('#preset').selectOption('satin');
  expect(await lab<number>(page, `return h.params.refraction`)).toBe(0);
  await page.locator('#param-blur').fill('12');
  await expect(page.locator('#preset')).toHaveValue('');
});

test('the previous jello-glass v1 export is still available and reports what it drops', async ({ page }) => {
  await lab(page, `h.setParams({ refraction: 12.5, blur: 3 })`);
  const before = await lab<Record<string, unknown>>(page, `return h.params`);
  await page.locator('#exportLegacy').click();
  const doc = JSON.parse(await page.locator('#paramsJson').inputValue());
  expect(doc).toEqual({ format: 'jello-glass', version: 1, params: before });
  await expect(page.locator('#importMessages')).toContainText('Non rappresentabili e omessi');
  await expect(page.locator('#importMessages')).toContainText('id (optics)');
  // Importing it back migrates it without losing parameters.
  await page.locator('#paramsJson').fill(JSON.stringify(doc));
  await page.locator('#importParams').click();
  await expect(page.locator('#importMessages')).toContainText('Migrato da jello-glass@1');
  expect(await lab(page, `return h.params`)).toEqual(before);
});
