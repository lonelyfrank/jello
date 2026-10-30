/**
 * Component Builder, through the UI as a user would: template → structure →
 * icon and text → sizes → material → personal preset → library → reload →
 * export (React package, material only). Plus: the Material Lab keeps
 * working and nothing is left behind when switching workspace.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { unzip } from '../../src/export/zip';
import { lab, openLab, settle } from './helpers';

const BUILDER = 'workspace=builder&component=mobile-navbar&scene=app&animate=0';
const preview = (page: Page) => page.locator('#stageMain nav.jello-bnav:not(.navbar)');
const previewTabs = (page: Page) => page.locator('#stageMain nav.jello-bnav:not(.navbar) .jello-bnav-tab');
const node = (page: Page, id: string) => page.locator(`#structureTree [data-node="${id}"]`);

/** Narrow layouts keep library and inspector in a drawer. */
async function controls(page: Page) {
  const toggle = page.locator('#panelToggle');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

async function openSection(page: Page, id: string) {
  await page.evaluate((s) => document.querySelectorAll<HTMLDetailsElement>(`[data-section="${s}"]`).forEach((d) => (d.open = true)), id);
}

async function download(page: Page, action: () => Promise<void>) {
  const [d] = await Promise.all([page.waitForEvent('download'), action()]);
  return { name: d.suggestedFilename(), data: new Uint8Array(readFileSync((await d.path())!)) };
}

test.describe('component builder', () => {
  test.beforeEach(async ({ page }) => {
    await openLab(page, BUILDER);
    await controls(page);
  });

  test('switches workspace without leaving a second renderer, and the Material Lab keeps working', async ({ page }) => {
    await expect(preview(page)).toBeVisible();
    await expect(previewTabs(page)).toHaveText(['Home', 'Explore', 'Profile']);
    // The builder uses the stage's own group: one filter, one surface, the navbar demo is not mounted.
    expect(await page.locator('[data-jello-filters]').count()).toBe(1);
    expect(await page.locator('#stageMain .navbar').count()).toBe(1);
    await expect(page.locator('#stageMain .navbar')).toBeHidden();
    const before = await lab<{ surfaces: number }>(page, 'return h.stats()');
    expect(before.surfaces).toBe(1);
    for (let i = 0; i < 3; i++) {
      await lab(page, `h.setWorkspace('material')`);
      await settle(page);
      await lab(page, `h.setWorkspace('builder')`);
      await settle(page);
    }
    expect((await lab<{ surfaces: number }>(page, 'return h.stats()')).surfaces).toBe(1);
    expect(await page.locator('#stageMain nav.jello-bnav').count()).toBe(2); // builder bar + the hidden demo navbar
    await page.locator('#ws-material').click();
    await settle(page);
    await expect(preview(page)).toHaveCount(0);
    await expect(page.locator('#stageMain .builder-highlight')).toHaveCount(0);
    expect(await lab(page, 'return h.workspace()')).toBe('material');
    await expect(page.locator('#paramsJson')).toBeAttached();
  });

  test('the full flow: edit the Mobile Navbar demo, save preset and component, reopen, export', async ({ page }) => {
    // 1–2. The official demo is open: three editable tabs.
    await expect(page.locator('[data-template="mobile-navbar"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#cmpOrigin')).toHaveText(/Template/);
    await expect(previewTabs(page)).toHaveText(['Home', 'Explore', 'Profile']);

    // 3. Add a fourth tab.
    await page.locator('#tabAdd').click();
    await expect(previewTabs(page)).toHaveCount(4);
    await expect(page.locator('#tab-id')).toHaveValue('tab');

    // 4. Its icon and text.
    await page.locator('#tab-label').fill('Settings');
    await expect(previewTabs(page).nth(3)).toHaveText('Settings');
    await page.locator('label[for="tab-icon-settings"]').click();
    await expect.poll(() => lab(page, `return h.builder.view.children[3].icon`)).toEqual({ kind: 'builtin', name: 'settings' });
    await page.locator('#tab-value').fill('/settings');
    // Custom SVG: accepted when safe, refused with reasons otherwise.
    await page.locator('#tab-icon-upload').setInputFiles({ name: 'punto.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>') });
    await expect(page.locator('#builderMessages').first()).toHaveAttribute('data-ok', 'true');
    await expect(previewTabs(page).nth(3).locator('svg')).toHaveAttribute('data-paint', 'fill');
    await page.locator('#tab-icon-upload').setInputFiles({ name: 'evil.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 1 1" onload="alert(1)"><script>alert(1)</script></svg>') });
    await expect(page.locator('#builderMessages').first()).toHaveAttribute('data-ok', 'false');
    await expect(previewTabs(page).nth(3).locator('svg')).toHaveAttribute('data-paint', 'fill');
    expect(await page.locator('#stageMain script').count()).toBe(0);

    // Reorder and delete.
    await node(page, 'profile').click();
    await page.locator('#tabUp').click();
    await expect(previewTabs(page)).toHaveText(['Home', 'Profile', 'Explore', 'Settings']);
    await page.locator('#tabRemove').click();
    await expect(previewTabs(page)).toHaveText(['Home', 'Explore', 'Settings']);

    // 5. Sizes, font and arrangement of the bar.
    await node(page, 'root').click();
    await openSection(page, 'b-layout');
    await page.locator('#bf-layout-height-num').fill('70');
    await expect.poll(async () => Math.round((await preview(page).boundingBox())!.height)).toBe(70);
    await page.locator('#bf-layout-itemLayout').selectOption('inline');
    await expect(preview(page)).toHaveAttribute('data-item-layout', 'inline');
    await openSection(page, 'b-typography');
    await page.locator('#bf-typography-fontSize-num').fill('13');
    expect(await previewTabs(page).first().evaluate((el) => getComputedStyle(el).fontSize)).toBe('13px');

    // Interactions are simulated in the preview: selection mode picks, interaction mode activates.
    await page.locator('#tb-pick').click();
    await previewTabs(page).nth(1).click();
    await expect(page.locator('#tab-label')).toHaveValue('Explore');
    await expect(page.locator('#stageMain .builder-highlight')).toBeVisible();
    await page.locator('#tb-interact').click();
    await previewTabs(page).nth(2).click();
    await expect(previewTabs(page).nth(2)).toHaveAttribute('aria-current', 'page');
    await openSection(page, 'b-states');
    await page.locator('#tab-preview-state').selectOption('focus');
    await expect(previewTabs(page).nth(1)).toHaveAttribute('data-preview-state', 'focus');

    // 6–7. Glass, its parameters.
    const labMaterial = await lab<Record<string, unknown>>(page, 'return h.params');
    await page.locator('#bl-material-glass').click();
    await page.locator('#num-blur').fill('9');
    await expect.poll(() => preview(page).locator('.jello-surface').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--jello-blur'))).toBe('9px');
    await expect(page.locator('#cmpMaterialNote')).toContainText('modificato');
    // The Material Lab's own material is untouched.
    expect(await lab(page, 'return h.params')).toEqual(labMaterial);

    // 8. Save the Glass configuration as a personal preset.
    await page.locator('#cmpPresetName').fill('My Soft Glass');
    await page.locator('#cmpSavePreset').click();
    await expect(page.locator('#savedPresets')).toContainText('My Soft Glass');
    const presetId = await lab<string>(page, 'return h.builder.doc.material.preset');
    expect(presetId).toMatch(/^user-/);
    expect(await lab(page, `return h.library().find((i) => i.id === '${presetId}')?.name`)).toBe('My Soft Glass');

    // 9. Save the navbar in the library, reload, reopen it unchanged.
    await page.locator('#cmpSave').click();
    await expect(page.locator('#cmpOrigin')).toHaveText(/salvata/);
    const saved = await lab<{ id: string; json: string }>(page, 'return { id: h.builder.state.componentId, json: h.builder.json() }');
    expect(saved.id).toMatch(/^cmp-/);
    await lab(page, 'await h.flush()');
    await page.goto(`./?workspace=builder&component=${saved.id}&scene=app&animate=0`);
    await page.waitForSelector('html[data-ready=true]');
    await settle(page);
    expect(await lab(page, 'return h.builder.json()')).toBe(saved.json);
    await expect(previewTabs(page)).toHaveText(['Home', 'Explore', 'Settings']);
    await controls(page);
    await expect(page.locator(`#savedComponents [data-component="${saved.id}"]`)).toHaveAttribute('aria-pressed', 'true');

    // 10. Export the navbar as a React component.
    await page.locator('#exportOpen').click();
    await expect(page.locator('#exportDialog')).toBeVisible();
    await expect(page.locator('#export-target-component')).toBeChecked();
    await expect(page.locator('#exportPlan')).toContainText('MobileNavbar');
    await expect(page.locator('#exportDeps')).toContainText('react, react-dom');
    const zip = await download(page, () => page.locator('#exportGo').click());
    expect(zip.name).toBe('jello-mobile-navbar-react.zip');
    const files = new Map(unzip(zip.data).map((e) => [e.path, new TextDecoder().decode(e.data)]));
    const root = 'jello-mobile-navbar-react/';
    expect(files.get(`${root}component.json`)!.trim()).toBe(saved.json);
    expect(files.get(`${root}index.d.ts`)).toContain('"home" | "explore" | "tab"');
    expect([...files.keys()].some((p) => p.startsWith(`${root}runtime/types/`))).toBe(true);
    expect(JSON.parse(files.get(`${root}material.json`)!).material.blur).toBe(9);

    // Material only: no component inside.
    await page.locator('#export-target-material').check();
    const mat = await download(page, () => page.locator('#exportGo').click());
    const mpaths = unzip(mat.data).map((e) => e.path);
    expect(mpaths.some((p) => p.endsWith('/material.json'))).toBe(true);
    expect(mpaths.some((p) => /component\.json|\.tsx$/.test(p))).toBe(false);
    await page.keyboard.press('Escape');
    await expect(page.locator('#exportDialog')).toBeHidden();
  });

  test('responsive: breakpoints follow the preview frame', async ({ page }) => {
    await node(page, 'root').click();
    await openSection(page, 'b-responsive');
    await page.locator('#bpAdd').click();
    await page.locator('#bp-bp-480-layout-labels-on').check();
    await page.locator('#bp-bp-480-layout-labels').selectOption('hide');
    await lab(page, `h.setOption('device', 'phone')`);
    await expect(preview(page)).toHaveAttribute('data-breakpoint', 'bp-480');
    await expect(preview(page)).toHaveAttribute('data-labels', 'hide');
    // Hidden labels are still the tabs' accessible names.
    await expect(previewTabs(page).first()).toHaveAccessibleName('Home');
    // Wider frames leave the breakpoint (the emulated phone is narrower than 480 px whatever the frame).
    if (page.viewportSize()!.width > 900) {
      await lab(page, `h.setOption('device', 'desktop')`);
      await expect(preview(page)).not.toHaveAttribute('data-breakpoint', /.+/);
    }
  });

  test('many tabs overflow into a scrolling track instead of being refused', async ({ page }) => {
    for (let i = 0; i < 9; i++) await lab(page, 'h.builder.addTab()');
    await lab(page, `h.setOption('device', 'phone')`);
    await expect(previewTabs(page)).toHaveCount(12);
    await expect(preview(page)).toHaveAttribute('data-overflowing', '');
    const track = preview(page).locator('.jello-bnav-track');
    expect(await track.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    for (const t of await previewTabs(page).all()) expect((await t.boundingBox())!.width).toBeGreaterThanOrEqual(43.5);
  });
});

test.describe('official templates and personal components', () => {
  test('only Jello’s own templates are official; types without an implementation are marked as such', async ({ page }) => {
    await openLab(page, BUILDER);
    await controls(page);
    await expect(page.locator('[data-template]')).toHaveCount(2);
    await expect(page.locator('[data-template]')).toHaveText([/Mobile Navbar/, /Button/]);
    expect((await lab<{ id: string; origin: string }[]>(page, 'return h.builder.components()')).filter((c) => c.origin === 'template').map((c) => c.id)).toEqual(['mobile-navbar', 'button']);
    await expect(page.locator('#sidebar')).not.toContainText(/darts|\bBT\b|cable/i);
    // Planned, not offered: no editor, no template, nothing that looks like it works.
    await expect(page.locator('.soon-card')).toHaveText([/Desktop Navbar/, /Input/]);
    await expect(page.locator('.soon-card')).toHaveCount(2);
  });

  test('an old template link opens the generic demo, with a notice', async ({ page }) => {
    await openLab(page, 'workspace=builder&component=bt-darts&scene=app&animate=0');
    await expect(page.locator('#notice')).toContainText('non è più incluso');
    expect(await lab(page, 'return h.builder.state.componentId')).toBe('mobile-navbar');
    await expect(previewTabs(page)).toHaveText(['Home', 'Explore', 'Profile']);
  });

  test('an old template link for the renamed type opens the same demo quietly', async ({ page }) => {
    await openLab(page, 'workspace=builder&component=bottom-navigation&scene=app&animate=0');
    expect(await lab(page, 'return h.builder.state.componentId')).toBe('mobile-navbar');
    // No notice at all: the renamed template is the same thing, not a removed one.
    await expect(page.locator('#notice')).toHaveCount(0);
    await expect(previewTabs(page)).toHaveText(['Home', 'Explore', 'Profile']);
  });

  test('a component saved by the previous version (real v1 file) is converted, stays personal and is never deleted', async ({ page }) => {
    await openLab(page, BUILDER);
    const old = readFileSync(new URL('../fixtures/legacy/bt-darts.component.json', import.meta.url), 'utf8');
    await lab(page, `return h.builder.importComponent(${JSON.stringify(old)})`);
    await expect.poll(() => lab(page, 'return h.builder.state.componentId')).toBe('bt-darts');
    expect(await lab(page, 'return h.builder.state.origin')).toBe('user');
    // Converted: the canonical definition is what the lab holds and saves.
    expect(await lab(page, 'return [h.builder.doc.format, h.builder.doc.type]')).toEqual(['jello-component-definition', 'mobile-navbar']);
    await lab(page, 'await h.flush()');
    await page.reload();
    await page.waitForSelector('html[data-ready=true]');
    const list = await lab<{ id: string; origin: string }[]>(page, 'return h.builder.components()');
    expect(list).toContainEqual(expect.objectContaining({ id: 'bt-darts', origin: 'user' }));
    expect(list.filter((c) => c.origin === 'template').map((c) => c.id)).toEqual(['mobile-navbar', 'button']);
    await lab(page, `h.builder.open('bt-darts')`);
    await expect(previewTabs(page)).toHaveText(['Matrice', 'Live', 'Risultati']);
    // Its icons, kept for compatibility, still render.
    await expect(previewTabs(page).nth(2).locator('svg')).toHaveCount(1);
    expect(await lab(page, 'return h.builder.view.defaultTab')).toBe('live');
  });
});

test.describe('personal materials in components', () => {
  const surfaceBlur = (page: Page) => preview(page).locator('.jello-surface').evaluate((el) => (el as HTMLElement).style.getPropertyValue('--jello-blur'));
  const componentBlur = (page: Page) => lab<number>(page, 'return h.builder.material().material.blur');

  async function setLabBlur(page: Page, v: number) {
    await page.locator('#ws-material').click();
    await controls(page);
    await page.locator('#num-blur').fill(String(v));
    await expect.poll(() => lab<number>(page, 'return h.params.blur')).toBe(v);
    await page.locator('#ws-builder').click();
    await controls(page);
  }

  test('a material customised in the Material Lab is used, followed and re-synced by components', async ({ page }) => {
    await openLab(page, 'scene=app&animate=0');
    await controls(page);
    // Customise: a personal copy of the built-in, with its own blur.
    await page.locator('#libDuplicate').click();
    await expect(page.locator('#activeOrigin')).toHaveAttribute('data-origin', 'user');
    const id = await lab<string>(page, 'return h.materialId()');
    await page.locator('#num-blur').fill('7');

    // Material Lab → component.
    await page.locator('#libUseInComponent').click();
    // The button saves, then applies the material and switches workspace: wait for the outcome, not for the click.
    await expect.poll(() => lab(page, 'return h.workspace()')).toBe('builder');
    await controls(page);
    await expect.poll(() => lab(page, 'return h.builder.doc.material.preset')).toBe(id);
    await expect.poll(() => surfaceBlur(page)).toBe('7px');
    await expect(page.locator('#cmpMaterialNote')).toHaveAttribute('data-link', 'linked');
    await expect(page.locator('#cmpMaterial')).toHaveValue(id);

    // Changing the material in the Material Lab reaches the component.
    await setLabBlur(page, 11);
    await expect.poll(() => surfaceBlur(page)).toBe('11px');
    expect(await componentBlur(page)).toBe(11);
    await page.locator('#ws-material').click();
    await controls(page);
    await expect(page.locator('#activeUsage')).toContainText('Usato da 1 componente');
    await page.locator('#ws-builder').click();
    await controls(page);

    // Edited in the component: it keeps its own value…
    await page.locator('#bl-material-glass').click();
    await page.locator('#num-blur').fill('3');
    await expect(page.locator('#cmpMaterialNote')).toHaveAttribute('data-link', 'modified');
    await setLabBlur(page, 13);
    expect(await componentBlur(page)).toBe(3);
    await expect(page.locator('#cmpMaterialNote')).toHaveAttribute('data-link', 'diverged');
    // …until it is updated from the preset, and it follows again.
    await page.locator('#cmpUpdateFromPreset').click();
    await expect.poll(() => surfaceBlur(page)).toBe('13px');
    await expect(page.locator('#cmpMaterialNote')).toHaveAttribute('data-link', 'linked');

    // A saved component that is closed follows too, and keeps it after a reload.
    await page.locator('#cmpSave').click();
    await expect.poll(() => lab(page, 'return h.builder.state.origin')).toBe('user');
    const saved = await lab<string>(page, 'return h.builder.state.componentId');
    await lab(page, `h.builder.open('mobile-navbar')`);
    await setLabBlur(page, 15);
    await lab(page, 'await h.flush()');
    await page.goto(`./?workspace=builder&component=${saved}&scene=app&animate=0`);
    await page.waitForSelector('html[data-ready=true]');
    await settle(page);
    expect(await componentBlur(page)).toBe(15);
    expect(await lab(page, 'return h.builder.state.modified')).toBe(false);
    await expect.poll(() => surfaceBlur(page)).toBe('15px');
  });

  test('an edited built-in is saved as a personal copy before a component uses it', async ({ page }) => {
    await openLab(page, 'scene=app&animate=0');
    await controls(page);
    await page.locator('#num-blur').fill('6');
    await expect(page.locator('#libUseInComponent')).toContainText('Salva e usa');
    await page.locator('#libUseInComponent').click();
    await expect.poll(() => lab(page, 'return h.builder.doc.material.preset')).toMatch(/^user-/);
    const preset = await lab<string>(page, 'return h.builder.doc.material.preset');
    expect(await lab(page, `return h.library().find((i) => i.id === '${preset}')?.origin`)).toBe('user');
    await expect.poll(() => componentBlur(page)).toBe(6);
  });
});
