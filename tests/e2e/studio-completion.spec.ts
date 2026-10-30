import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { unzip } from '../../src/export/zip';
import { createSolidDocument, serializeMaterial } from '../../src/model';
import { lab, openLab } from './helpers';

async function controls(page: Page) {
  const toggle = page.locator('#panelToggle');
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
}
async function section(page: Page, id: string) {
  await page.locator(`[data-section="${id}"]`).evaluate((el) => (el as HTMLDetailsElement).open = true);
}
async function download(page: Page, adapter: string) {
  await page.locator('#exportOpen').click();
  await page.locator(`#export-adapter-${adapter}`).check();
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#exportGo').click()]);
  await page.locator('#exportClose').click();
  return unzip(new Uint8Array(readFileSync((await file.path())!)));
}

test('optional wizard creates a generic Solid button; Base/Advanced and zoom preserve the definition', async ({ page }, testInfo) => {
  await page.goto('./');
  await page.waitForSelector('html[data-ready=true]');
  await page.locator('#homeComponentWizard').click();
  await page.locator('input[name=componentType][value=button]').check();
  await page.getByRole('button', { name: 'Continua', exact: true }).click();
  await page.locator('input[name=componentFamily][value=solid]').check();
  await expect(page.locator('.component-sample .jello-btn')).toHaveAttribute('data-material', 'solid');
  await page.getByRole('button', { name: 'Continua', exact: true }).click();
  await page.locator('#openComponentBuilder').click();
  await expect(page.locator('#stageMain .jello-btn')).toHaveAttribute('data-material', 'solid');
  await controls(page);
  await expect(page.getByRole('button', { name: 'Base', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const before = await lab(page, 'return h.builder.json()');
  await page.getByRole('button', { name: 'Avanzato', exact: true }).click();
  await page.getByRole('button', { name: 'Base', exact: true }).click();
  expect(await lab(page, 'return h.builder.json()')).toBe(before);
  // Six editing sections remain; Studio adds a separate canonical JSON section.
  expect(await page.locator('#inspector .panel-body > details:not([data-section=b-definition])').count()).toBe(6);
  await expect(page.locator('[data-section=b-definition]')).toBeAttached();
  if (await page.locator('#panelClose').isVisible()) await page.locator('#panelClose').click();
  await page.locator('#previewZoom').selectOption('0.75');
  await page.locator('#tb-restore').click();
  await expect(page.locator('#previewZoom')).toHaveValue('1');
  await page.screenshot({ path: `/tmp/jello-studio-${testInfo.project.name}.png`, fullPage: true });
});

test('Solid button: edit, save material and component, reload, follow revised preset, export React and Vanilla', async ({ page }) => {
  await openLab(page, 'workspace=builder&component=button&animate=0');
  await controls(page);
  await page.locator('#btn-text').fill('Conferma Solid');
  await page.locator('#bl-material-solid').click();
  await page.locator('#num-elevation').fill('3');
  await page.locator('#num-elevation').press('Tab');
  await page.locator('#cmpPresetName').fill('Solid personale');
  await page.locator('#cmpSavePreset').click();
  await expect.poll(() => lab<string>(page, 'return h.builder.doc.material.preset')).toMatch(/^user-/);
  const preset = await lab<string>(page, 'return h.builder.doc.material.preset');
  await page.locator('#cmpSave').click();
  await expect(page.locator('#cmpOrigin')).toContainText('salvata');
  await lab(page, 'await h.flush()');
  await page.reload();
  await page.waitForSelector('html[data-ready=true]');
  await expect(page.locator('#stageMain .jello-btn-label')).toHaveText('Conferma Solid');
  expect(await lab(page, 'return h.builder.material().material.elevation')).toBe(3);
  await page.locator('#ws-material').click();
  await lab(page, `h.open('${preset}')`);
  await controls(page);
  await expect(page.locator('#labFamily')).toHaveValue('solid');
  await page.locator('#num-elevation').fill('4');
  await page.locator('#num-elevation').press('Tab');
  await lab(page, 'await h.flush()');
  await page.locator('#ws-builder').click();
  expect(await lab(page, 'return h.builder.material().material.elevation')).toBe(4);
  for (const adapter of ['component-react', 'component-vanilla']) {
    const files = await download(page, adapter);
    const doc = JSON.parse(new TextDecoder().decode(files.find((f) => f.path.endsWith('/component.json'))!.data));
    expect(doc.material.document.material.elevation).toBe(4);
    expect(doc.material.family).toBe('solid');
    expect(files.some((f) => f.path.endsWith('/runtime/jello.js'))).toBe(true);
  }
});

test('Solid Material Lab: new, duplicate, rename, favourite, JSON, reload and delete', async ({ page }) => {
  await openLab(page, 'scene=app&animate=0');
  await controls(page);
  await page.locator('#labFamily').selectOption('solid');
  await page.locator('#libNew').click();
  await expect(page.locator('#stageMain .jello-solid')).toHaveCount(1);
  await page.locator('#num-borderWidth').fill('2');
  await page.locator('#num-borderWidth').press('Tab');
  await page.locator('#libRename').click();
  await page.locator('#renameInput').fill('Superficie personale');
  await page.locator('#renameInput').press('Enter');
  const id = await lab<string>(page, 'return h.materialId()');
  await page.getByRole('button', { name: 'Aggiungi «Superficie personale» ai preferiti', exact: true }).click();
  await page.locator('#libTab-favorites').click();
  await expect(page.locator(`[data-preset="${id}"]`)).toBeVisible();
  await page.locator('#libDuplicate').click();
  const copy = await lab<string>(page, 'return h.materialId()');
  expect(copy).not.toBe(id);
  const json = await lab<string>(page, 'return h.exportJson()');
  expect(JSON.parse(json)).toMatchObject({ family: 'solid', material: { borderWidth: 2 } });
  await lab(page, 'await h.flush()');
  await page.reload();
  await page.waitForSelector('html[data-ready=true]');
  expect(await lab(page, 'return h.materialId()')).toBe(copy);
  expect(await lab(page, 'return h.material().material.borderWidth')).toBe(2);
  await controls(page);
  await section(page, 'solid-states');
  await page.locator('#solid-preview-state').selectOption('active');
  await expect(page.locator('#stageMain .jello-btn')).toHaveAttribute('data-jello-state', 'active');
  await lab(page, "h.setMaterialControl({ key: 'fill', state: 'active' }, '#123456')");
  await expect.poll(() => page.locator('#stageMain .jello-solid').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(18, 52, 86)');
  await page.locator('#solid-preview-state').selectOption('default');
  await page.locator('#libDelete').click();
  await page.locator('#confirmDelete').click();
  await expect.poll(() => lab(page, `return h.library().some((m) => m.id === '${copy}')`)).toBe(false);
  // Import is atomic and works after deletion as well.
  await lab(page, `h.importText(${JSON.stringify(json)}); await h.flush()`);
  expect(await lab(page, 'return h.material().family')).toBe('solid');
  expect(await lab(page, 'return h.material().material.borderWidth')).toBe(2);
});

test('Solid navbar: add and reorder tabs, change icon, simulate active/disabled, switch families and export Vanilla', async ({ page }) => {
  await openLab(page, 'workspace=builder&component=mobile-navbar&animate=0');
  await controls(page);
  await page.locator('#bl-material-solid').click();
  await page.locator('#tabAdd').click();
  await page.locator('#tab-label').fill('Preferiti');
  await page.locator('label[for="tab-icon-star"]').click();
  const selected = await lab<string>(page, 'return h.builder.state.selection');
  await page.locator('#tabUp').click();
  await section(page, 'b-states');
  await page.locator('#tab-preview-state').selectOption('active');
  await expect(page.locator(`#stageMain [data-tab="${selected}"]`)).toHaveAttribute('data-active', '');
  await page.locator('#tab-preview-state').selectOption('disabled');
  await expect(page.locator(`#stageMain [data-tab="${selected}"]`)).toHaveAttribute('aria-disabled', 'true');
  await page.locator('#tab-preview-state').selectOption('');
  const before = await lab<{ structure: unknown; content: unknown; interactions: unknown }>(page, 'return h.builder.doc');
  await lab(page, "h.builder.setFamily('glass'); h.builder.setFamily('solid')");
  const after = await lab<typeof before>(page, 'return h.builder.doc');
  for (const key of ['structure', 'content', 'interactions'] as const) expect(after[key]).toEqual(before[key]);
  const files = await download(page, 'component-vanilla');
  const doc = JSON.parse(new TextDecoder().decode(files.find((f) => f.path.endsWith('/component.json'))!.data));
  expect(Object.values(doc.content as Record<string, { icon?: { name?: string } }>).some((v) => v.icon?.name === 'star')).toBe(true);
  expect(doc.structure.children.map((n: { id: string }) => n.id).indexOf(selected)).toBe(2);
});

test('working drafts survive an immediate reload; importing Solid leaves an incompatible Glass scene', async ({ page }) => {
  await openLab(page, 'workspace=builder&component=button&animate=0');
  await controls(page);
  await page.locator('#btn-text').fill('Bozza recuperata');
  await lab(page, 'await h.flush()');
  await page.reload();
  await page.waitForSelector('html[data-ready=true]');
  await expect(page.locator('#stageMain .jello-btn-label')).toHaveText('Bozza recuperata');
  expect(await lab(page, 'return h.builder.state.origin')).toBe('template');
  await lab(page, "h.setWorkspace('material'); h.setOption('mode', 'scene')");
  const json = serializeMaterial(createSolidDocument({ id: 'imported-solid', name: 'Solid importato' }));
  await lab(page, `h.importText(${JSON.stringify(json)}); await h.flush()`);
  expect(await lab(page, 'return h.options().mode')).toBe('components');
  await expect(page.locator('#stageMain .jello-solid')).toHaveCount(1);
  await expect(page.locator('#stageScene')).toBeHidden();
});

test('a locally edited Solid component keeps its overrides until explicitly updated from the revised preset', async ({ page }) => {
  await openLab(page, 'workspace=builder&component=button&animate=0');
  await controls(page);
  await page.locator('#bl-material-solid').click();
  await page.locator('#cmpPresetName').fill('Solid revisioni');
  await page.locator('#cmpSavePreset').click();
  await expect.poll(() => lab<string>(page, 'return h.builder.doc.material.preset')).toMatch(/^user-/);
  const id = await lab<string>(page, 'return h.builder.doc.material.preset');
  await lab(page, "h.builder.setControl('elevation', 2); h.setWorkspace('material')");
  await lab(page, `h.open('${id}'); h.setMaterialControl({ key: 'elevation' }, 5); await h.flush(); h.setWorkspace('builder'); h.builder.select('material')`);
  expect(await lab(page, 'return h.builder.material().material.elevation')).toBe(2);
  await expect(page.locator('#cmpMaterialNote')).toHaveAttribute('data-link', 'diverged');
  await page.locator('#cmpUpdateFromPreset').click();
  expect(await lab(page, 'return h.builder.material().material.elevation')).toBe(5);
  await expect(page.locator('#cmpMaterialNote')).toHaveAttribute('data-link', 'linked');
});

test('unsupported material states cannot create invalid or ineffective component overrides', async ({ page }) => {
  await openLab(page, 'workspace=builder&component=button&animate=0');
  await lab(page, "h.builder.setFamily('solid')");
  const button = await lab(page, 'return h.builder.json()');
  expect(await lab(page, "return h.builder.setControl('fill', '#123456', 'active')")).toBe(false);
  expect(await lab(page, 'return h.builder.json()')).toBe(button);
  await lab(page, "h.builder.open('mobile-navbar'); h.builder.setFamily('solid')");
  const navbar = await lab(page, 'return h.builder.json()');
  for (const state of ['pressed', 'active', 'disabled']) {
    expect(await lab(page, `return h.builder.setControl('fill', '#123456', '${state}')`)).toBe(false);
  }
  expect(await lab(page, 'return h.builder.json()')).toBe(navbar);
});
