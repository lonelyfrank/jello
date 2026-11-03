/**
 * M6.4.1: the Library speaks the catalog's vocabulary, experimental Jello stays behind its own door,
 * and two tabs of the experimental lab can never overwrite each other silently.
 */
import { expect, test, type Page } from '@playwright/test';

const ready = (page: Page) => page.waitForSelector('html[data-ready=true]');

async function drawer(page: Page, open: boolean) {
  const toggle = page.locator('#panelToggle');
  if (!(await toggle.isVisible())) return;
  if (((await toggle.getAttribute('aria-expanded')) === 'true') !== open) await toggle.click();
}
async function openJelly(page: Page) {
  await page.goto('./?studio=jelly&animate=0');
  await ready(page);
  await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
  await page.waitForFunction(() => !!(window as any).__jelloJelly?.bridge()?.status);
}
const work = (page: Page) => page.evaluate(() => (window as any).__jelloJelly.state() as { doc: any; records: { id: string; rev?: number; doc: any }[]; recordId: string | null; conflict: any; dirty: boolean });
async function setDensity(page: Page, value: string) {
  await drawer(page, true);
  await page.locator('#jl-level-advanced').click();
  const input = page.locator('#num-jelly-density');
  await input.scrollIntoViewIfNeeded();
  await input.fill(value);
}

test.describe('Library vocabulary (M6.4.1)', () => {
  test('shows catalog names, family · treatment, «Incluso»; Refraction Test only in advanced mode', async ({ page }) => {
    await page.goto('./?studio=library');
    await ready(page);
    const grid = page.locator('.catalog-grid');
    await page.locator('.pill', { hasText: 'Materiali' }).first().isVisible().catch(() => undefined);
    await page.locator('.cat', { hasText: 'Materiali' }).click();
    const frosted = grid.locator('article', { has: page.getByRole('button', { name: 'Glass · Frosted', exact: true }) });
    await expect(frosted).toContainText('Glass · Frosted · Incluso');
    await expect(frosted).toContainText('backdrop blur');
    await expect(grid.locator('article', { has: page.getByRole('button', { name: 'Solid · Matte', exact: true }) })).toContainText('Solid · Matte · Neutral');
    await expect(grid.getByRole('button', { name: 'Refraction Test', exact: true })).toHaveCount(0);
    await expect(page.locator('.cat', { hasText: 'Diagnostica' })).toHaveCount(0);
    await page.locator('#showDiagnostics').check();
    await page.locator('.cat', { hasText: 'Diagnostica' }).click();
    const diag = grid.locator('article[data-diagnostic=true]');
    await expect(diag).toHaveCount(1);
    await expect(diag).toContainText('Refraction Test');
    await expect(diag).toContainText('Diagnostica');
    await page.reload();
    await ready(page);
    await expect(page.locator('#showDiagnostics')).toBeChecked(); // per-viewer preference
    await page.locator('#showDiagnostics').uncheck();
  });

  test('Jello is an experimental family: no Jelly module loads until chosen, then the real renderer draws each card', async ({ page }) => {
    const jelly: string[] = [];
    page.on('request', (r) => { if (/Jelly|jelly-lab/.test(r.url())) jelly.push(r.url()); });
    await page.goto('./?studio=library');
    await ready(page);
    await page.waitForTimeout(300);
    expect(jelly).toEqual([]);
    await expect(page.locator('[data-catalog-kind=experimental]')).toHaveCount(0);
    await page.locator('.pill', { hasText: 'Jello · sperimentale' }).click();
    const cards = page.locator('[data-catalog-kind=experimental]');
    await expect(cards).toHaveCount(4);
    for (const name of ['Jello · Soft', 'Jello · Clear', 'Jello · Candy', 'Jello · Dense']) await expect(cards.filter({ hasText: name })).toHaveCount(1);
    await expect(cards.first()).toContainText('Sperimentale');
    await expect(cards.first()).toContainText('Gel');
    await expect(cards.first().locator('.jelly-decoration')).toBeAttached();
    expect(jelly.length).toBeGreaterThan(0);
    // not a stable material: no favourite, no duplicate, no export of it from here
    await expect(cards.first().getByRole('button', { name: /Duplica|preferiti/ })).toHaveCount(0);
    await cards.first().getByRole('button', { name: /Apri nel Jello Lab/ }).click();
    await expect(page.locator('#jelly-lab')).toBeVisible();
  });

  test('the Material Lab keeps «Inclusi» apart from «I miei» and has no Jello preset to edit', async ({ page }) => {
    await page.goto('./?preset=satin&scene=grid&animate=0');
    await ready(page);
    await drawer(page, true);
    await expect(page.locator('#libTab-jello')).toContainText('Inclusi');
    await expect(page.locator('#libPanel [data-preset=satin] .preset-name')).toHaveText('Glass · Frosted');
    await expect(page.locator('#libPanel [data-preset=optics]')).toHaveCount(0);
    await expect(page.locator('#labFamily option[value=jelly]')).toHaveAttribute('disabled', '');
    await expect(page.locator('#labFamily option[value=jelly]')).toContainText('Jello');
  });
});

test.describe('Two tabs of the Jello lab (M6.4.1)', () => {
  test('the second, stale save is refused with an explicit choice; nothing is overwritten', async ({ context }) => {
    const a = await context.newPage();
    await openJelly(a);
    await setDensity(a, '5');
    await drawer(a, true);
    await a.locator('#jl-save-copy').click();
    await expect(a.locator('#jl-save-status')).toContainText('Salvato');
    const id = (await work(a)).recordId!;

    const b = await context.newPage();
    await openJelly(b);
    await expect.poll(async () => (await work(b)).records.length).toBe(1);
    await drawer(b, true);
    await b.locator('.jl-record button.jl-item').first().click();
    expect((await work(b)).recordId).toBe(id);

    await a.bringToFront();
    await setDensity(a, '9');
    await drawer(a, true);
    await a.locator('#jl-save').click();
    await expect(a.locator('#jl-save-status')).toContainText('Salvato');

    await b.bringToFront(); // a background tab gets no animation frames in Firefox, so «stable» would never hold
    await setDensity(b, '15');
    await drawer(b, true);
    await b.locator('#jl-save').click();
    await expect(b.locator('#jl-conflict')).toBeVisible();
    await expect(b.locator('#jl-conflict')).toContainText('modificata da un’altra scheda');
    await expect(b.locator('#jl-save-status')).toContainText('Non salvato');
    expect((await work(b)).doc.bubbles.density).toBe(15); // my edit is still here
    // the other tab's save was not overwritten
    await expect.poll(async () => (await work(a)).records[0]!.doc.bubbles.density).toBe(9);
    const stored = await b.evaluate(() => new Promise<number>((resolve) => {
      const r = indexedDB.open('jello-lab-experimental');
      r.onsuccess = () => { const g = r.result.transaction('jelly-materials').objectStore('jelly-materials').getAll(); g.onsuccess = () => resolve(g.result[0].doc.bubbles.density); };
    }));
    expect(stored).toBe(9);

    // choose: keep both
    await drawer(b, true);
    await b.locator('#jl-conflict').scrollIntoViewIfNeeded();
    await b.locator('#jl-conflict-copy').click();
    await expect(b.locator('#jl-conflict')).toHaveCount(0);
    await expect(b.locator('.jl-record')).toHaveCount(2);
    await b.close();
    await a.close();
  });

  test('the integrity check is read-only, offers a backup, and quarantine is reversible', async ({ page }) => {
    await openJelly(page);
    await setDensity(page, '4');
    await drawer(page, true);
    await page.locator('#jl-save-copy').click();
    await expect(page.locator('#jl-save-status')).toContainText('Salvato');
    // a record of a project that no longer exists, written straight into the experimental database
    await page.evaluate(async () => {
      const w = (window as any).__jelloJelly.state();
      const doc = { ...w.doc, id: 'ghost' };
      const db: IDBDatabase = await new Promise((resolve) => { const r = indexedDB.open('jello-lab-experimental'); r.onsuccess = () => resolve(r.result); });
      await new Promise<void>((resolve) => {
        const tx = db.transaction('jelly-materials', 'readwrite');
        tx.objectStore('jelly-materials').put({ id: 'ghost', projectId: 'prj-deleted-long-ago', doc, basePreset: null, createdAt: 'x', updatedAt: 'x' });
        tx.oncomplete = () => resolve();
      });
      db.close();
    });
    await drawer(page, true);
    await page.locator('#jl-integrity summary').click();
    await page.locator('#jl-scan').click();
    await expect(page.locator('#jl-scan-report')).toContainText('1 orfani');
    await expect(page.locator('#jl-scan-report')).toContainText('2 validi');
    await expect(page.locator('.jl-record')).toHaveCount(1); // the scan changed nothing (valid = the copy and its draft)
    await expect(page.locator('#jl-orphans-export')).toBeVisible();
    await page.locator('#jl-orphans-move').click();
    await page.locator('#jl-orphans-move').click(); // second press confirms
    await expect(page.locator('#jl-integrity-message')).toContainText('1 record spostati in quarantena');
    await expect(page.locator('#jl-integrity-message')).toContainText('Nessun record è stato eliminato');
    await expect(page.locator('#jl-quarantine li')).toHaveCount(1);
    await expect(page.locator('#jl-quarantine')).toContainText('orfano');
    await page.locator('#jl-quarantine li').getByRole('button', { name: /^Ripristina/ }).click();
    await expect(page.locator('#jl-integrity-message')).toContainText('1 record ripristinati');
    await expect(page.locator('#jl-quarantine')).toHaveCount(0);
  });
});
