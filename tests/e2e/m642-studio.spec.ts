/**
 * M6.4.2 — Studio quality gate. Every test pins a defect that was reproduced in the browser first
 * (docs/m642/audit-baseline.md, ids M642-NN) or a guarantee the mandate asks to be demonstrated.
 */
import { expect, test, type Page } from '@playwright/test';

const ready = (page: Page) => page.waitForSelector('html[data-ready=true]');

async function firstLaunch(page: Page) {
  await page.goto('./');
  await ready(page);
  await expect(page.locator('#homePage[data-empty=true]')).toBeVisible();
}
async function startKit(page: Page) {
  await firstLaunch(page);
  await page.locator('#startKit').click();
  await expect(page.locator('#lab')).toBeVisible();
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-kind', 'saved', { timeout: 8000 });
}

/** Visible text outside code-like surfaces (inputs, <pre>, <code>, <textarea>): what a person actually reads. */
const readableText = (page: Page, selector: string) =>
  page.locator(selector).evaluate((root) => {
    // The sample Button of the preview is demonstration content, not interface text.
    const skip = 'pre, code, textarea, input, select, script, style, [hidden], .visually-hidden, .jl-stage, .jl-compare';
    const out: string[] = [];
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (el && !el.closest(skip) && n.textContent?.trim()) out.push(n.textContent.trim());
    }
    return out.join('\n');
  });

test.describe('first launch (M642-01, 02, 04, 09)', () => {
  test('one h1; areas that need a project say so, stay focusable and do nothing when activated', async ({ page }) => {
    await firstLaunch(page);
    await expect(page.locator('h1:visible')).toHaveCount(1);
    const library = page.locator('#ws-library');
    await expect(library).toHaveAttribute('aria-disabled', 'true');
    await expect(library).toHaveAttribute('aria-describedby', 'railNeedsProject');
    await expect(page.locator('#railNeedsProject')).toContainText('Serve un progetto');
    await library.focus();
    await expect(library).toBeFocused();
    await library.click({ force: true });
    await expect(page.locator('#homePage')).toBeVisible();
    await expect(page.locator('#studioLibrary')).toHaveCount(0);
    // Not a "pressed" toggle: the rail is navigation.
    await expect(page.locator('.studio-rail [aria-pressed]')).toHaveCount(0);
    // The shortcuts that need a project carry the same reason in text, not only in a tooltip.
    await expect(page.locator('#homeNeedsProject')).toContainText('creato o importato un progetto');
    await expect(page.locator('.home-cats .cat', { hasText: 'Library' })).toHaveAttribute('aria-describedby', 'homeNeedsProject');
  });

  test('the Jello tile is the experimental family, not «presto»: it opens the Jello Lab once a project exists', async ({ page }) => {
    await firstLaunch(page);
    const tile = page.locator('.home-cats .cat', { hasText: 'Jello β' });
    await expect(tile).toHaveCount(1);
    await expect(tile).not.toContainText('presto');
    await expect(tile).not.toHaveAttribute('title', /non ancora disponibile/);
    await expect(tile).toHaveAttribute('aria-disabled', 'true'); // needs a project, like Library
    await page.locator('#startKit').click();
    await expect(page.locator('#lab')).toBeVisible();
    await page.locator('#ws-home').click();
    const unlocked = page.locator('.home-cats .cat', { hasText: 'Jello β' });
    await expect(unlocked).not.toHaveAttribute('aria-disabled', 'true');
    await expect(unlocked).toHaveAttribute('title', /Sperimentale/);
    await unlocked.click();
    await expect(page.locator('#jelly-lab')).toBeVisible();
  });

  test('the Material Gallery shows the 8 designer-facing presets named by the catalog, never a diagnostic one', async ({ page }) => {
    await firstLaunch(page);
    const tiles = page.locator('.demo-gallery .mat-tile');
    await expect(tiles).toHaveCount(8);
    const names = await tiles.locator('strong').allTextContents();
    expect(names).toEqual(['Glass · Default', 'Glass · Frosted', 'Glass · Refractive', 'Glass · Subtle', 'Solid · Matte', 'Solid · Dark', 'Solid · Accent Blue', 'Solid · Outlined']);
    const metas = await tiles.locator('.mat-tile-meta .muted').allTextContents();
    for (const m of metas) expect(m).toMatch(/^(Glass|Solid) · /);
    await expect(page.locator('.demo-gallery')).not.toContainText('preset Jello');
    await expect(page.locator('.demo-gallery')).not.toContainText('in sviluppo');
  });
});

test.describe('a new project starts clean (M642-03, 06, 07, 08)', () => {
  test('the kit creates no diagnostic configuration, and the wizard does not offer it', async ({ page }) => {
    await firstLaunch(page);
    await page.locator('#startEmpty').click();
    await page.getByRole('button', { name: 'Continua' }).click();
    await page.getByLabel('Kit Jello').check();
    const chips = page.locator('[aria-label="Preset da includere"] .chip-toggle');
    const labels = await chips.allTextContents();
    expect(labels.map((l) => l.trim())).toEqual(['Glass · Default', 'Glass · Frosted', 'Glass · Refractive', 'Navbar']);
  });

  test('Library: no Refraction Test with diagnostics off; with them on, the badge counts what the category shows', async ({ page }) => {
    await startKit(page);
    await page.locator('#ws-library').click();
    await expect(page.locator('#studioLibrary')).toBeVisible();
    const grid = page.locator('.catalog-grid');
    await expect(grid.getByRole('button', { name: 'Refraction Test', exact: true })).toHaveCount(0);
    await expect(page.locator('.lib-cats .cat', { hasText: 'Diagnostica' })).toHaveCount(0);
    await page.locator('#showDiagnostics').check();
    const cat = page.locator('.lib-cats .cat', { hasText: 'Diagnostica' });
    await expect(cat.locator('.count-badge')).toHaveText('1');
    await cat.click();
    await expect(grid.locator('article')).toHaveCount(1);
    await expect(page.locator('.section-tools [role=status]')).toHaveText('1 elementi');
  });

  test('Library: the Jello family offers only the categories that exist for it, and a stale category falls back to «Tutti»', async ({ page }) => {
    await startKit(page);
    await page.locator('#ws-library').click();
    await page.locator('.lib-cats .cat', { hasText: 'Buttons' }).click();
    await expect(page.locator('.lib-cats .cat', { hasText: 'Buttons' })).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.home-tabs .pill', { hasText: 'Jello' }).click();
    const labels = (await page.locator('.lib-cats .cat').allTextContents()).map((t) => t.replace(/\s*\d+$/, '').trim());
    expect(labels).toEqual(['Tutti gli elementi', 'Materiali']);
    await expect(page.locator('.lib-cats .cat', { hasText: 'Tutti gli elementi' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.catalog-grid article')).toHaveCount(4);
    // Back to the stable families: the full set returns.
    await page.locator('.home-tabs .pill', { hasText: 'Tutti' }).click();
    await expect(page.locator('.lib-cats .cat')).toHaveCount(6);
  });

  test('Home «Template»: the diagnostic preset appears only in advanced mode', async ({ page }) => {
    await startKit(page);
    await page.locator('#ws-home').click();
    await page.getByRole('tab', { name: 'Template' }).click();
    await expect(page.locator('.home-card', { hasText: 'Glass · Frosted' }).first()).toBeVisible();
    await expect(page.locator('.home-card', { hasText: 'Refraction Test' })).toHaveCount(0);
    await page.locator('#ws-library').click();
    await page.locator('#showDiagnostics').check();
    await page.locator('#ws-home').click();
    await page.getByRole('tab', { name: 'Template' }).click();
    await expect(page.locator('.home-card', { hasText: 'Refraction Test' })).toHaveCount(1);
  });
});

test.describe('Jello vocabulary (M642-05)', () => {
  test('the Jello Lab names the preset as the catalog does, and keeps the persisted technical name', async ({ page }) => {
    await startKit(page);
    await page.locator('#ws-jelly').click();
    await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
    await page.waitForFunction(() => !!(window as unknown as { __jelloJelly?: { bridge(): { status?: unknown } } }).__jelloJelly?.bridge()?.status);
    const toggle = page.locator('#panelToggle');
    if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await expect(page.locator('#jl-reset-all')).toBeVisible();
    const text = await readableText(page, '#jelly-lab');
    await expect(page.locator('#jl-panel').getByText('Base:')).toContainText('Base: Jello · Soft');
    await expect(page.locator('#jl-reset-all')).toHaveText('Ripristina «Jello · Soft»');
    expect(text).not.toMatch(/\bJelly\b/);
    // Presentation only: the stored document still carries its technical name and id.
    const doc = await page.evaluate(() => (window as unknown as { __jelloJelly: { state(): { doc: { id: string; name: string } } } }).__jelloJelly.state().doc);
    expect(doc).toMatchObject({ id: 'jelly-soft', name: 'Jelly Soft' });
  });

  test('the Builder trial section is called Jello, not Jelly', async ({ page }) => {
    await startKit(page);
    await page.locator('#ws-builder').click();
    await page.evaluate(() => (window as unknown as { __jello: { builder: { open(id: string): void } } }).__jello.builder.open('button'));
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
    await expect(page.getByRole('heading', { name: 'Prova Jello · sperimentale' })).toBeAttached();
    await expect(page.getByRole('heading', { name: /Prova Jelly/ })).toHaveCount(0);
  });
});

test.describe('Builder fields (M642-12, 13)', () => {
  test('the px radius field has an accessible name that says what it is, and explains a rejected value', async ({ page }) => {
    await startKit(page);
    await page.locator('#ws-builder').click();
    await page.evaluate(() => (window as unknown as { __jello: { builder: { open(id: string): void } } }).__jello.builder.open('button'));
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
    await page.locator('select[id$="layout-radius"]').selectOption('px');
    const field = page.getByRole('textbox', { name: /Raggio/ });
    await expect(field).toBeVisible();
    // Every aria-labelledby on the page points at something that exists.
    const dangling = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-labelledby]')].flatMap((e) => e.getAttribute('aria-labelledby')!.split(/\s+/).filter((id) => !document.getElementById(id))),
    );
    expect(dangling).toEqual([]);
    await field.fill('9999');
    const err = page.locator('.param-error:not([hidden])');
    await expect(err).toContainText('serve un numero da');
    await expect(err).toContainText('Non applicato');
    await field.blur();
    await expect(page.locator('.param-error:not([hidden])')).toHaveCount(0);
  });
});
