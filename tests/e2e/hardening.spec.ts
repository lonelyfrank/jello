/**
 * M6.H regressions in the browser: untrusted SVG never reaches the DOM as
 * markup, projects stay independent after a duplicate, links left across
 * projects by earlier versions are repaired at start, and the Library and
 * Export dialog behave as their controls say.
 */

import { expect, test, type Page } from '@playwright/test';
import { bindMaterial, componentTemplate } from '../../src/components';
import { createGlassDocument } from '../../src/model';
import { kitAssets } from '../../src/project/defaults';
import { createProject } from '../../src/project/document';
import { showPanel } from './helpers';

const ready = (page: Page) => page.waitForSelector('html[data-ready=true]');
const saved = (page: Page) => expect(page.locator('#saveStatus')).toHaveAttribute('data-kind', 'saved', { timeout: 8000 });

async function startKit(page: Page) {
  await page.goto('./');
  await ready(page);
  await page.locator('#startKit').click();
  await expect(page.locator('#lab')).toBeVisible();
  await saved(page);
}

type Stores = { materials: any[]; components: any[]; projectdocs: any[] };

/** What IndexedDB holds (a second connection: the lab's own stays open). */
function stored(page: Page): Promise<Stores> {
  return page.evaluate(
    () =>
      new Promise<Stores>((resolve, reject) => {
        const r = indexedDB.open('jello-lab');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const names = ['materials', 'components', 'projectdocs'] as const;
          const tx = db.transaction([...names], 'readonly');
          const out = {} as Stores;
          let n = 0;
          for (const s of names) {
            const q = tx.objectStore(s).getAll();
            q.onsuccess = () => {
              out[s] = q.result;
              if (++n === names.length) {
                db.close();
                resolve(out);
              }
            };
          }
        };
      }),
  );
}

/** Writes records as an earlier or tampered version would have, bypassing every check of the lab. */
function seed(page: Page, data: Partial<Stores>): Promise<void> {
  return page.evaluate(
    (d) =>
      new Promise<void>((resolve, reject) => {
        const r = indexedDB.open('jello-lab');
        r.onerror = () => reject(r.error);
        r.onsuccess = () => {
          const db = r.result;
          const tx = db.transaction(['materials', 'components', 'projectdocs', 'projects'], 'readwrite');
          for (const [store, rows] of Object.entries(d)) for (const row of rows as unknown[]) tx.objectStore(store).put(row);
          tx.objectStore('projects').delete('last');
          tx.oncomplete = () => (db.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    data,
  );
}

const at = '2026-10-01T10:00:00.000Z';
const blurOf = (c: any): number => c.doc.material.document.material.blur;

test.describe('untrusted SVG', () => {
  const hostile = [
    { id: 'ic-ok', name: 'valida', viewBox: '0 0 24 24', body: '<path d="M4 12h16"/>', paint: 'stroke', warning: null },
    { id: 'ic-img', name: 'immagine', viewBox: '0 0 24 24', body: '<image href="x" onerror="__pwned()"/>', paint: 'stroke', warning: null },
    { id: 'ic-fo', name: 'foreign', viewBox: '0 0 24 24', body: '<foreignObject><img src="x" onerror="__pwned()"></foreignObject>', paint: 'stroke', warning: null },
    { id: 'ic-vb', name: 'viewbox', viewBox: '0 0 24 24" onload="__pwned()', body: '<path d="M4 12h16"/>', paint: 'stroke', warning: null },
  ];

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__pwned = () => ((window as any).__hit = true);
    });
  });

  test('a stored project with hostile icons renders only the valid one and reports the others', async ({ page }) => {
    await page.goto('./');
    await ready(page);
    const p = createProject({ id: 'prj-svg', name: 'Icone ostili', assets: kitAssets(), at });
    const doc = { ...p, assets: { ...p.assets, iconSets: [{ id: 'set-x', name: 'Caricate', builtin: false, icons: hostile }, ...p.assets.iconSets] } };
    await seed(page, { projectdocs: [doc] });
    await page.reload();
    await ready(page);
    await page.locator('#nav-assets').click();
    await page.locator('#asset-tab-icons').click();
    await expect(page.getByRole('heading', { name: 'valida' })).toBeVisible();
    // Only the valid icon is listed; the others were removed before reaching the page.
    await expect(page.locator('.icon-name').filter({ hasText: /^(immagine|foreign|viewbox)$/ })).toHaveCount(0);
    await expect(page.locator('.detail .icon-prev svg path').first()).toHaveAttribute('d', 'M4 12h16');
    const sinks = await page.evaluate(() => document.querySelectorAll('#app [onerror], #app [onload], #app foreignObject, #app svg image, #app svg script').length);
    expect(sinks).toBe(0);
    expect(await page.evaluate(() => (window as any).__hit)).toBeUndefined();
    // The user is told which icons were removed.
    await page.goto('./?page=settings&project=prj-svg');
    await ready(page);
    await expect(page.getByText(/«immagine».*rimossa/)).toBeVisible();
    await expect(page.getByText(/«foreign».*rimossa/)).toBeVisible();
  });

  test('an imported .jello with a hostile icon adds only safe icons', async ({ page }) => {
    await startKit(page);
    const p = createProject({ id: 'prj-src', name: 'Sorgente', assets: { palettes: [], iconSets: [{ id: 'set-x', name: 'Ostili', builtin: false, icons: hostile as any }], fonts: [], typeStyles: [] }, at });
    // A crafted package: progetto.json written by hand, not by the Studio.
    const { zip } = await import('../../src/export/zip');
    const bytes = zip([{ path: 'progetto.json', data: new TextEncoder().encode(JSON.stringify(p)) }]);
    await page.locator('#brandHome').click();
    await page.locator('#headerImport').click();
    await page.locator('#importFiles').setInputFiles({ name: 'ostile.jello', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
    await page.getByRole('button', { name: 'Continua' }).click();
    await page.locator('#importApply').click();
    await expect(page.getByRole('heading', { name: 'Importazione completata' })).toBeVisible();
    const s = await stored(page);
    const icons = s.projectdocs.flatMap((d) => d.assets.iconSets.flatMap((set: any) => set.icons));
    expect(icons.some((i: any) => i.name === 'valida')).toBe(true);
    expect(JSON.stringify(icons)).not.toMatch(/onerror|onload|foreignObject|<image/);
    expect(await page.evaluate(() => (window as any).__hit)).toBeUndefined();
  });
});

test.describe('projects stay independent', () => {
  test('duplicate A into B; editing A changes only A, editing B changes only B', async ({ page }) => {
    await startKit(page);
    const ids = await page.evaluate(async () => {
      const h = window.__jello as any;
      const a = h.projects.active();
      const mat = h.library().find((m: any) => m.origin === 'user').id;
      const cmp = h.builder.components().find((c: any) => c.origin === 'user').id;
      h.setWorkspace('builder');
      h.builder.open(cmp);
      h.builder.applyPreset(mat);
      await h.flush();
      return { a, mat, cmp };
    });
    await page.locator('#brandHome').click();
    await page.getByRole('button', { name: /Azioni di Il mio progetto/ }).click();
    await page.getByRole('menuitem', { name: 'Duplica' }).click();
    await expect(page.locator('.project-card')).toHaveCount(2);
    const b = await page.evaluate(() => (window.__jello as any).projects.active());
    expect(b).not.toBe(ids.a);

    let s = await stored(page);
    const bMats = new Set(s.materials.filter((m) => m.projectId === b).map((m) => m.id));
    const bCmp = s.components.find((c) => c.projectId === b && c.doc.material.preset !== null && !['jello', 'satin', 'deep', 'optics'].includes(c.doc.material.preset));
    expect(bCmp, 'B has its copy of the linked component').toBeTruthy();
    expect(bMats.has(bCmp.doc.material.preset)).toBe(true);
    const bBefore = blurOf(bCmp);

    // Edit A's material.
    await page.evaluate(
      async ({ a, mat }) => {
        const h = window.__jello as any;
        h.projects.switch(a);
        h.setWorkspace('material');
        h.open(mat);
        h.setParams({ blur: 21 });
        await h.flush();
      },
      ids,
    );
    s = await stored(page);
    expect(blurOf(s.components.find((c) => c.id === ids.cmp))).toBe(21);
    expect(blurOf(s.components.find((c) => c.id === bCmp.id))).toBe(bBefore);

    // Edit B's copy.
    await page.evaluate(
      async ({ b, mat }) => {
        const h = window.__jello as any;
        h.projects.switch(b);
        h.open(mat);
        h.setParams({ blur: 5 });
        await h.flush();
      },
      { b, mat: bCmp.doc.material.preset },
    );
    s = await stored(page);
    expect(blurOf(s.components.find((c) => c.id === bCmp.id))).toBe(5);
    expect(blurOf(s.components.find((c) => c.id === ids.cmp))).toBe(21);

    // Survives a reload: both projects as they were left.
    await page.reload();
    await ready(page);
    const again = await stored(page);
    expect(blurOf(again.components.find((c) => c.id === bCmp.id))).toBe(5);
  });

  test('a component left linked to another project’s material by an earlier version is unlinked at start, and says so', async ({ page }) => {
    await page.goto('./');
    await ready(page);
    const pa = createProject({ id: 'prj-a', name: 'A', assets: kitAssets(), at });
    const pb = createProject({ id: 'prj-b', name: 'B', assets: kitAssets(), at: '2026-10-01T10:00:01.000Z' });
    const mat = createGlassDocument({ id: 'user-mata', name: 'Vetro A' });
    const nav = componentTemplate('mobile-navbar')!.create();
    const linked = { ...nav, material: bindMaterial(mat, mat.id) };
    await seed(page, {
      projectdocs: [pa, pb],
      materials: [{ id: mat.id, doc: mat, projectId: 'prj-a', createdAt: at, updatedAt: at }],
      components: [
        { id: 'cmp-a', doc: { ...linked, id: 'cmp-a', name: 'Navbar A' }, projectId: 'prj-a', createdAt: at, updatedAt: at },
        { id: 'cmp-b', doc: { ...linked, id: 'cmp-b', name: 'Navbar B' }, projectId: 'prj-b', createdAt: at, updatedAt: at },
      ],
    });
    await page.reload();
    await ready(page);
    expect((await page.evaluate(() => (window.__jello as any).projects.notice()))?.text).toMatch(/collegata a un materiale di un altro progetto/);
    const s = await stored(page);
    const b = s.components.find((c) => c.id === 'cmp-b');
    expect(b.doc.material.preset).toBeNull();
    expect(b.doc.material.document.id).toBe(mat.id);
    expect(s.components.find((c) => c.id === 'cmp-a').doc.material.preset).toBe(mat.id);
  });
});

test.describe('library and export controls', () => {
  async function library(page: Page) {
    await page.goto('./?workspace=builder&component=mobile-navbar&scene=grid&animate=0&theme=dark');
    await ready(page);
    await page.locator('#ws-library').click();
    await expect(page.locator('#studioLibrary')).toBeVisible();
  }

  test('the favourite button does not select its card; the name button selects with the keyboard', async ({ page }) => {
    await library(page);
    const cards = page.locator('.catalog-card');
    await expect(cards.first()).toHaveAttribute('data-selected', 'true');
    await cards.nth(1).getByRole('button', { name: /ai preferiti/ }).click();
    await expect(cards.nth(1).getByRole('button', { name: /dai preferiti/ })).toHaveAttribute('aria-pressed', 'true');
    // Still the first card: the favourite did one thing only.
    await expect(cards.first()).toHaveAttribute('data-selected', 'true');
    await expect(cards.nth(1)).not.toHaveAttribute('data-selected', 'true');
    const pick = cards.nth(1).locator('.catalog-pick');
    await pick.focus();
    await page.keyboard.press('Enter');
    await expect(cards.nth(1)).toHaveAttribute('data-selected', 'true');
    await expect(pick).toHaveAttribute('aria-pressed', 'true');
    await cards.nth(2).locator('.catalog-pick').focus();
    await page.keyboard.press('Space');
    await expect(cards.nth(2)).toHaveAttribute('data-selected', 'true');
    // No interactive element inside another one.
    expect(await page.evaluate(() => document.querySelectorAll('#studioLibrary button button, #studioLibrary [onclick] button, .catalog-card[role=button]').length)).toBe(0);
  });

  test('guided export steps show the section of the step, the summary shows all, choices survive switching', async ({ page }) => {
    await library(page);
    await page.locator('#ws-export').click();
    const dlg = page.locator('#exportDialog');
    await expect(dlg.getByText('colonna a destra')).toHaveCount(0);
    await dlg.getByRole('button', { name: '1 Elemento', exact: true }).click();
    await expect(dlg.locator('.export-targets')).toBeVisible();
    await expect(dlg.getByRole('region', { name: 'Formato' })).toBeHidden();
    await page.locator('#export-target-configuration').check();
    await dlg.getByRole('button', { name: 'Continua', exact: true }).click();
    await expect(dlg.getByRole('region', { name: 'Formato' })).toBeVisible();
    await expect(dlg.locator('.export-targets')).toBeHidden();
    await expect(dlg.getByRole('region', { name: 'Anteprima pacchetto' })).toBeHidden();
    await page.locator('#export-adapter-component-json').check();
    await dlg.getByRole('button', { name: 'Continua', exact: true }).click();
    await expect(page.locator('#exportDeps')).toBeVisible();
    await expect(dlg.locator('.export-files').first()).toBeHidden();
    await dlg.getByRole('button', { name: 'Mostra riepilogo completo' }).click();
    await expect(dlg.locator('.export-targets')).toBeVisible();
    await expect(dlg.getByRole('region', { name: 'Formato' })).toBeVisible();
    await expect(dlg.getByRole('region', { name: 'Anteprima pacchetto' })).toBeVisible();
    await expect(page.locator('#export-target-configuration')).toBeChecked();
    await expect(page.locator('#export-adapter-component-json')).toBeChecked();
  });
});

test('the lab declares a script Content-Security-Policy and still boots and renders', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => m.type() === 'error' && /Content Security Policy/i.test(m.text()) && violations.push(m.text()));
  await startKit(page);
  await showPanel(page);
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("script-src 'self'");
  expect(violations).toEqual([]);
});

test.describe('saving', () => {
  test('a failed autosave keeps the edit pending; the next save writes it and a reload finds it', async ({ page }) => {
    await startKit(page);
    const mat = await page.evaluate(() => {
      const h = window.__jello as any;
      const id = h.library().find((m: any) => m.origin === 'user').id;
      h.open(id);
      return id;
    });
    // Every read-write transaction fails as if the disk were full.
    await page.evaluate(() => {
      const original = IDBDatabase.prototype.transaction;
      (window as any).__restoreIdb = () => (IDBDatabase.prototype.transaction = original);
      IDBDatabase.prototype.transaction = function (this: IDBDatabase, stores: any, mode?: IDBTransactionMode, ...rest: any[]) {
        if (mode === 'readwrite') throw new DOMException('disk full', 'QuotaExceededError');
        return original.call(this, stores, mode, ...rest);
      } as typeof original;
    });
    await page.evaluate(async () => {
      const h = window.__jello as any;
      h.setParams({ blur: 27 });
      h.projects.rename(h.projects.active(), 'Rinominato durante il guasto');
      await h.flush();
    });
    await expect(page.locator('#saveStatus')).toHaveAttribute('data-kind', 'error');
    const failed = await stored(page);
    expect(failed.materials.find((m) => m.id === mat).doc.material.blur).not.toBe(27);
    expect(failed.projectdocs[0].name).not.toBe('Rinominato durante il guasto');
    // Storage is back: an unrelated save also writes the pending material.
    await page.evaluate(async () => {
      (window as any).__restoreIdb();
      const h = window.__jello as any;
      h.setOption('animate', false);
      await h.flush();
    });
    await saved(page);
    const after = await stored(page);
    expect(after.materials.find((m) => m.id === mat).doc.material.blur).toBe(27);
    expect(after.projectdocs[0].name).toBe('Rinominato durante il guasto');
    await page.reload();
    await ready(page);
    expect(await page.evaluate(() => (window.__jello as any).params.blur)).toBe(27);
  });

  test('switching project right after an edit does not lose the edit', async ({ page }) => {
    await startKit(page);
    const { mat, b } = await page.evaluate(async () => {
      const h = window.__jello as any;
      const a = h.projects.active();
      const b = await h.projects.duplicate(a);
      h.projects.switch(a);
      const mat = h.library().find((m: any) => m.origin === 'user').id;
      h.open(mat);
      await h.flush();
      // Edit and leave before the debounced autosave runs.
      h.setParams({ blur: 33 });
      h.projects.switch(b);
      await h.flush();
      return { mat, b };
    });
    expect(b).toBeTruthy();
    expect((await stored(page)).materials.find((m) => m.id === mat).doc.material.blur).toBe(33);
  });

  test('another tab saving the open project is reported here, not overwritten silently', async ({ page, context }) => {
    await startKit(page);
    const project = await page.evaluate(() => (window.__jello as any).projects.active());
    const other = await context.newPage();
    await other.goto(`./?project=${project}&page=lab`);
    await ready(other);
    await other.evaluate(async () => {
      const h = window.__jello as any;
      h.open(h.library().find((m: any) => m.origin === 'user').id);
      h.setParams({ blur: 12 });
      await h.flush();
    });
    await expect(page.locator('#notice')).toContainText('modificato in un’altra scheda');
    await expect(page.locator('#notice').getByRole('button', { name: 'Ricarica' })).toBeVisible();
    await other.close();
  });
});
