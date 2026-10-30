/**
 * Projects, start pages, assets and the guided flows, through the UI.
 * A first launch has no project: Home explains how to start. Everything a
 * person creates belongs to a project, and survives a reload.
 */

import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { showPanel } from './helpers';
import { createGlassDocument, glassParams, serializeMaterial, withGlassParams } from '../../src/model';

const ready = (page: Page) => page.waitForSelector('html[data-ready=true]');

async function firstLaunch(page: Page) {
  await page.goto('./');
  await ready(page);
}

async function startKit(page: Page) {
  await firstLaunch(page);
  await page.locator('#startKit').click();
  await expect(page.locator('#lab')).toBeVisible();
  await saved(page);
  // On phones the library and the panel live in the drawer.
  await showPanel(page);
}

/** Autosave is debounced: a reload right after an edit would legitimately lose it. */
const saved = (page: Page) => expect(page.locator('#saveStatus')).toHaveAttribute('data-kind', 'saved', { timeout: 8000 });

test.describe('first launch', () => {
  test('lands on Home with three ways to start and no project yet', async ({ page }) => {
    await firstLaunch(page);
    await expect(page.locator('#homePage[data-empty=true]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Crea la tua prima componente' })).toBeVisible();
    await expect(page.locator('#startEmpty')).toBeVisible();
    await expect(page.locator('#startKit')).toBeVisible();
    await expect(page.locator('#startImport')).toBeVisible();
    // Nothing to open yet.
    await expect(page.locator('#ws-material')).toBeDisabled();
    await expect(page.locator('#nav-assets')).toBeDisabled();
    await expect(page.locator('#lab')).toBeHidden();
  });

  test('"Parti da un preset Jello" makes a project with 4 materials and the example navbar, and it survives a reload', async ({ page }) => {
    await startKit(page);
    await expect(page.locator('#libTab-mine .count-badge')).toHaveText('4');
    await page.reload();
    await ready(page);
    await expect(page.locator('#lab')).toBeVisible();
    await page.locator('#brandHome').click();
    await expect(page.locator('.project-card')).toHaveCount(1);
    await expect(page.locator('.project-card').first()).toContainText('1 componente · 4 materiali');
    // The preview is laid out as soon as the lab is shown again.
    await page.locator('#ws-material').click();
    await showPanel(page);
    await expect(page.locator('#libTab-mine')).toBeVisible();
  });

  test('a file dropped on the empty Home opens the import flow with a verified check', async ({ page }) => {
    await firstLaunch(page);
    await page.locator('#startImport').click();
    await page.locator('#importFiles').setInputFiles({ name: 'rotto.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"jello-glass","schemaVersion":1,"material":{"blur":64}}') });
    await expect(page.getByText('Import rifiutato: nessun parametro è stato modificato.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continua' })).toBeDisabled();
  });
});

test.describe('projects', () => {
  test('the wizard creates a named project whose materials stay apart from other projects', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the project switcher lives in the breadcrumb, which phones hide; Home switches projects there');
    await startKit(page);
    await page.locator('#brandHome').click();
    await page.locator('#headerNewProject').click();
    await page.locator('#projectName').fill('Progetto B');
    await page.getByLabel('Android').check();
    await page.getByRole('button', { name: 'Continua' }).click();
    await page.getByLabel('Progetto vuoto').check();
    await page.getByRole('button', { name: 'Continua' }).click();
    await expect(page.getByText('Progetto B')).toBeVisible();
    await expect(page.locator('.summary')).toContainText('Android');
    await page.locator('#createProject').click();
    // The new project holds one Glass material; the first one's four are not here.
    await expect(page.locator('#libTab-mine .count-badge')).toHaveText('1');
    await expect(page.locator('#projectSwitch')).toBeVisible();
    await page.locator('#projectSwitch').selectOption({ label: 'Il mio progetto' });
    await expect(page.locator('#libTab-mine .count-badge')).toHaveText('4');
    await page.locator('#projectSwitch').selectOption({ label: 'Progetto B' });
    await expect(page.locator('#libTab-mine .count-badge')).toHaveText('1');
  });

  test('deleting a project asks first, says what goes with it, and keeps focus inside the dialog', async ({ page }) => {
    await startKit(page);
    await page.locator('#brandHome').click();
    await page.getByRole('button', { name: /Azioni di Il mio progetto/ }).click();
    await page.getByRole('menuitem', { name: 'Elimina…' }).click();
    const dlg = page.getByRole('alertdialog');
    await expect(dlg).toContainText('4 materiali');
    await expect(dlg).toContainText('1 componente');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await expect(page.locator('.project-card')).toHaveCount(1);
    await page.getByRole('button', { name: /Azioni di Il mio progetto/ }).click();
    await page.getByRole('menuitem', { name: 'Elimina…' }).click();
    await page.locator('#confirmDelete').click();
    await expect(page.locator('#homePage[data-empty=true]')).toBeVisible();
  });

  test('favourites: marked from a card, listed in their tab, empty state says how', async ({ page }) => {
    await startKit(page);
    await page.locator('#libTab-favorites').click();
    await expect(page.getByText('Nessun preferito')).toBeVisible();
    await page.locator('#libTab-mine').click();
    await page.getByRole('button', { name: /Aggiungi «Satinato» ai preferiti/ }).click();
    await expect(page.locator('#libTab-favorites .count-badge')).toHaveText('1');
    await saved(page);
    await page.locator('#libTab-favorites').click();
    await expect(page.locator('#libPanel .preset-card')).toHaveCount(1);
    await page.reload();
    await ready(page);
    await showPanel(page);
    await expect(page.locator('#libTab-favorites .count-badge')).toHaveText('1');
  });
});

test.describe('material workspace', () => {
  test('Rendering tab holds path, accessibility and diagnostics; reduced transparency shows its banner and can be switched off', async ({ page }) => {
    await startKit(page);
    await expect(page.locator('#panelTab-params')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#opt-reduceTransparency')).toBeHidden();
    await page.locator('#panelTab-rendering').click();
    await expect(page.locator('#opt-path')).toBeVisible();
    await page.locator('#opt-reduceTransparency').check();
    await expect(page.locator('#opaqueBanner')).toContainText('Trasparenza ridotta attiva');
    await page.locator('#opaqueOff').click();
    await expect(page.locator('#opaqueBanner')).toBeHidden();
    await expect(page.locator('#opt-reduceTransparency')).not.toBeChecked();
  });

  test('the centre capsule is laid out when the lab was opened from another page', async ({ page }) => {
    await startKit(page);
    await page.reload();
    await ready(page);
    await page.locator('#brandHome').click();
    // The address bar follows the page a moment later; a reload keeps it.
    await expect(page).toHaveURL(/page=home/);
    await page.reload();
    await ready(page);
    await expect(page.locator('#homePage')).toBeVisible();
    await page.locator('#ws-material').click();
    await expect(page.locator('#lab')).toBeVisible();
    const pos = await page.evaluate(() => (window as unknown as { __jello: { capsule: { position: { x: number; y: number } } } }).__jello.capsule.position);
    expect(pos.x).toBeGreaterThan(50);
    expect(pos.y).toBeGreaterThan(50);
  });
});

test.describe('assets', () => {
  test('colours: new colour gets a unique token, a taken token is refused, edits survive a reload', async ({ page }) => {
    await startKit(page);
    await page.locator('#nav-assets').click();
    await expect(page.locator('#assetsPage')).toBeVisible();
    await page.getByRole('button', { name: 'Nuovo colore' }).click();
    const token = page.getByLabel('Token', { exact: true });
    await expect(token).toHaveValue(/^--jello-nuovo-colore/);
    await token.fill('--jello-viola');
    await expect(page.getByRole('alert')).toContainText('già usato');
    await token.fill('--jello-mio');
    await expect(page.getByRole('alert')).toBeHidden();
    await page.getByLabel('Nome', { exact: true }).fill('Mio colore');
    await saved(page);
    await page.reload();
    await ready(page);
    await expect(page.locator('#assetsPage')).toBeVisible();
    await expect(page.getByRole('button', { name: /Mio colore/ })).toBeVisible();
  });

  test('colour picker: HEX, a pasted rgb() value and the OKLCH out-of-gamut warning', async ({ page }) => {
    await startKit(page);
    await page.locator('#nav-assets').click();
    await page.getByRole('button', { name: /Colore di Viola Jello/ }).click();
    const pop = page.getByRole('dialog', { name: /Selettore colore/ });
    await pop.getByLabel('Valore HEX').fill('336699');
    await expect(page.locator('.values')).toContainText('#336699');
    await pop.getByRole('tab', { name: 'Valori' }).click();
    await pop.getByPlaceholder(/rgb\(124 77 235\)/).fill('rgb(10 20 30)');
    await expect(pop.getByText('RGB riconosciuto')).toBeVisible();
    await expect(page.locator('.values')).toContainText('#0A141E');
    await pop.getByRole('button', { name: 'OKLCH' }).click();
    await pop.getByLabel('Croma', { exact: true }).fill('0.4');
    await expect(pop.getByRole('status')).toContainText('Fuori gamma sRGB');
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
  });

  test('icons: an SVG with a fixed colour is flagged and can be converted; a script is refused', async ({ page }) => {
    await startKit(page);
    await page.locator('#nav-assets').click();
    await page.locator('#asset-tab-icons').click();
    await page.locator('#iconFiles').setInputFiles([
      { name: 'bersaglio.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="#E8553F"/></svg>') },
      { name: 'cattivo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>') },
    ]);
    await expect(page.getByRole('status').filter({ hasText: 'cattivo.svg: rifiutato' })).toBeVisible();
    await expect(page.locator('.callout.warn')).toContainText('colore fisso (#E8553F)');
    await page.getByRole('button', { name: 'Converti in currentColor' }).click();
    await expect(page.locator('.callout.warn')).toBeHidden();
    await expect(page.locator('.code-block')).toContainText('stroke="currentColor"');
  });

  test('fonts: families, type scale and a CSS line that can be copied', async ({ page }) => {
    await startKit(page);
    await page.locator('#nav-assets').click();
    await page.locator('#asset-tab-fonts').click();
    await expect(page.locator('.font-card')).toHaveCount(3);
    await page.getByRole('button', { name: '--jello-titolo' }).click();
    await expect(page.getByLabel('Corpo (px)')).toHaveValue('24');
    await page.getByLabel('Corpo (px)').fill('28');
    await expect(page.locator('.type-table')).toContainText('28/30');
    await expect(page.locator('.code-block')).toContainText('600 28px/30px "Inter", sans-serif');
  });
});

test.describe('export and import', () => {
  test('exporting the project and importing it back keeps both copies when asked, and says what happened', async ({ page }) => {
    await startKit(page);
    await page.locator('#nav-assets').click();
    await page.locator('#exportOpen').click();
    await expect(page.locator('.export-group').first()).toContainText('4 di 4');
    await page.getByRole('button', { name: 'Continua' }).click();
    await page.locator('#exportFileName').fill('kit-prova');
    await page.locator('#exportRun').click();
    await expect(page.locator('#exportResultName')).toHaveText('kit-prova.jello');
    await expect(page.locator('.phase-list, .file-list').first()).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportDownload').click()]);
    expect(download.suggestedFilename()).toBe('kit-prova.jello');
    const path = await download.path();
    const bytes = readFileSync(path);
    expect(bytes.subarray(0, 2).toString()).toBe('PK');

    await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
    await page.locator('#brandHome').click();
    await page.locator('#headerImport').click();
    await page.locator('#importFiles').setInputFiles({ name: 'kit-prova.jello', mimeType: 'application/zip', buffer: bytes });
    await expect(page.getByRole('heading', { name: 'kit-prova.jello' }).or(page.getByText('kit-prova.jello').first())).toBeVisible();
    await page.getByRole('button', { name: 'Continua' }).click();
    // Same names as the open project: every material conflicts. Keep both.
    await expect(page.getByRole('heading', { name: /elementi esistono già/ })).toBeVisible();
    await page.getByRole('button', { name: 'Mantieni entrambi' }).click();
    await page.locator('#importApply').click();
    await expect(page.getByRole('heading', { name: 'Importazione completata' })).toBeVisible();
    await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
    await page.locator('#ws-material').click();
    await showPanel(page);
    // 4 originals + 4 copies; the copies are renamed, never overwriting.
    await expect(page.locator('#libTab-mine .count-badge')).toHaveText('8');
  });

  for (const [choice, label, blur, count] of [
    ['replace', 'Sostituisci il materiale esistente', 33, 4],
    ['skip', 'Salta', 14, 4],
    ['both', 'Mantieni entrambi', 14, 5],
  ] as const) {
    test(`a pasted material with an existing name: «${label}» leaves ${count} materials and Satinato at blur ${blur}`, async ({ page }) => {
      await startKit(page);
      const base = createGlassDocument({ id: 'imp-satinato', name: 'Satinato' });
      const text = serializeMaterial(withGlassParams(base, { ...glassParams(base), blur: 33 }));
      await page.locator('#brandHome').click();
      await page.locator('#headerImport').click();
      await page.getByRole('button', { name: 'Incolla JSON' }).click();
      await page.locator('#importPaste').fill(text);
      await page.getByRole('button', { name: 'Verifica' }).click();
      await page.getByRole('button', { name: 'Continua' }).click();
      await expect(page.getByText('1 elemento esiste già')).toBeVisible();
      await page.getByLabel(label).check();
      await page.locator('#importApply').click();
      await expect(page.getByRole('heading', { name: 'Importazione completata' })).toBeVisible();
      await page.getByRole('button', { name: 'Chiudi', exact: true }).click();
      await page.locator('#ws-material').click();
      await showPanel(page);
      await expect(page.locator('#libTab-mine .count-badge')).toHaveText(String(count));
      await page.locator('#libTab-mine').click();
      await page.locator('[data-origin=user]').filter({ hasText: /^Satinato$/ }).first().click();
      const got = await page.evaluate(() => (window as unknown as { __jello: { params: { blur: number } } }).__jello.params.blur);
      expect(got).toBe(blur);
      void choice;
    });
  }

  test('CSS variables export is a single readable file', async ({ page }) => {
    await startKit(page);
    await page.locator('#nav-assets').click();
    await page.locator('#exportOpen').click();
    await page.getByRole('button', { name: 'Continua' }).click();
    await page.getByLabel(/Variabili CSS/).check();
    await page.locator('#exportRun').click();
    await expect(page.locator('#exportResultName')).toHaveText(/\.css$/);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#exportDownload').click()]);
    const css = readFileSync((await download.path())!, 'utf8');
    expect(css).toContain(':root {');
    expect(css).toContain('--jello-viola: #7c4deb;');
    expect(css).toContain('--jello-titolo: 600 24px/30px "Inter", sans-serif;');
  });
});

test.describe('shell', () => {
  test('global search finds a material and opens it; Settings shows where the data lives', async ({ page }) => {
    await startKit(page);
    await page.locator('#brandHome').click();
    await page.getByRole('combobox').fill('lente');
    await page.getByRole('option', { name: 'Lente marcata Materiale', exact: true }).click();
    await expect(page.locator('#crumbPreset')).toHaveText('Lente marcata');
    await page.locator('#brandHome').click();
    await page.getByRole('button', { name: 'Impostazioni' }).click();
    await expect(page.locator('#settingsPage')).toContainText('salvati in questo browser');
    await expect(page.getByRole('heading', { name: 'Stati dell’interfaccia' })).toBeVisible();
  });

  test('keyboard: the section buttons and the flows are reachable without a mouse', async ({ page }) => {
    await startKit(page);
    await page.locator('#brandHome').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#homePage')).toBeVisible();
    await page.locator('#headerNewProject').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Nuovo progetto' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#homePage')).toBeVisible();
  });
});
