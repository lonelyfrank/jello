/**
 * M6.H release gate: one path through the Studio, end to end.
 *
 * project → Glass material → Button linked to it → edit and save → duplicate
 * the project → the two stay independent → export the project as .jello →
 * start a new project from that file → components, parameters and links are
 * intact and re-mapped → export the Button as a React package and mount it, with
 * the package's own runtime, in a page that knows nothing about the Studio.
 *
 * Every step reads what IndexedDB holds (a second connection), not what the UI
 * claims. Autosave is awaited through the Studio's own flush.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { unzip } from '../../src/export/zip';
import { MATERIALS } from '../../src/model';

const ready = (page: Page) => page.waitForSelector('html[data-ready=true]');
const saved = (page: Page) => expect(page.locator('#saveStatus')).toHaveAttribute('data-kind', 'saved', { timeout: 8000 });

type Stores = { materials: any[]; components: any[]; projectdocs: any[] };

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
              if (++n === names.length) (db.close(), resolve(out));
            };
          }
        };
      }),
  );
}

const blurOf = (doc: any): number => doc.material.document.material.blur;
const isLocal = (preset: string | null): preset is string => preset !== null && MATERIALS.preset(preset) === undefined;

test.describe('release gate', () => {
  test.skip(({ browserName, isMobile }) => isMobile || browserName === 'webkit', 'the project switcher and downloads are driven on desktop engines');

  test('project → Glass → Button → duplicate → .jello → new project from the file → React package', async ({ page, context }) => {
    // 1. A project.
    await page.goto('./');
    await ready(page);
    await page.locator('#startKit').click();
    await expect(page.locator('#lab')).toBeVisible();
    await saved(page);

    // 2–5. A Glass material, a Button linked to it, edited and saved.
    const made = await page.evaluate(async () => {
      const h = window.__jello as any;
      const a = h.projects.active();
      await h.newMaterial('glass');
      h.rename('Gate glass');
      h.setParams({ blur: 17 });
      const mat = h.materialId();
      await h.flush();
      h.setWorkspace('builder');
      h.builder.open('button');
      await h.builder.save();
      const cmp = h.builder.state.componentId;
      h.builder.applyPreset(mat);
      h.builder.setField('style.variant', 'primary');
      await h.flush();
      return { a, mat, cmp };
    });
    let s = await stored(page);
    const buttonA = s.components.find((c) => c.id === made.cmp);
    expect(buttonA, 'the Button is stored as a personal component').toBeTruthy();
    expect(buttonA.projectId).toBe(made.a);
    expect(buttonA.doc.material.preset).toBe(made.mat);
    expect(blurOf(buttonA.doc)).toBe(17);
    expect(s.materials.find((m) => m.id === made.mat)?.projectId).toBe(made.a);

    // 6–7. Duplicate the project; the copies are independent.
    await page.locator('#brandHome').click();
    await page.getByRole('button', { name: /Azioni di Il mio progetto/ }).click();
    await page.getByRole('menuitem', { name: 'Duplica' }).click();
    await expect(page.locator('.project-card')).toHaveCount(2);
    const b = await page.evaluate(() => (window.__jello as any).projects.active());
    expect(b).not.toBe(made.a);
    s = await stored(page);
    const gateB = s.materials.find((m) => m.projectId === b && m.doc.name.startsWith('Gate glass'));
    const buttonB = s.components.find((c) => c.projectId === b && c.doc.name === buttonA.doc.name);
    expect(gateB, 'B has its own copy of the material').toBeTruthy();
    expect(gateB.id).not.toBe(made.mat);
    expect(buttonB, 'B has its own copy of the Button').toBeTruthy();
    expect(buttonB.id).not.toBe(made.cmp);
    expect(buttonB.doc.material.preset).toBe(gateB.id);
    expect(blurOf(buttonB.doc)).toBe(17);

    await page.evaluate(async (ids) => {
      const h = window.__jello as any;
      h.projects.switch(ids.a);
      h.setWorkspace('material');
      h.open(ids.mat);
      h.setParams({ blur: 29 });
      await h.flush();
    }, made);
    s = await stored(page);
    expect(blurOf(s.components.find((c) => c.id === made.cmp).doc), 'A follows its material').toBe(29);
    expect(blurOf(s.components.find((c) => c.id === buttonB.id).doc), 'B is untouched').toBe(17);
    expect(s.materials.find((m) => m.id === gateB.id).doc.material.blur).toBe(17);

    // 8. Export project A as .jello (A is the open project, with blur 29).
    await saved(page);
    await page.locator('#nav-assets').click();
    await page.locator('#exportOpen').click();
    await page.getByRole('button', { name: 'Continua' }).click();
    await page.locator('#exportFileName').fill('gate');
    await page.locator('#exportRun').click();
    await expect(page.locator('#exportResultName')).toHaveText('gate.jello');
    const [pkgDownload] = await Promise.all([page.waitForEvent('download'), page.locator('#exportDownload').click()]);
    const pkgBytes = readFileSync((await pkgDownload.path())!);
    expect(pkgBytes.subarray(0, 2).toString()).toBe('PK');
    await page.getByRole('button', { name: 'Chiudi', exact: true }).click();

    // 9. A new project from that file.
    await page.locator('#brandHome').click();
    await page.locator('#headerNewProject').click();
    await page.locator('#createNewProject').click();
    await page.locator('#projectName').fill('Gate importato');
    await page.getByRole('button', { name: 'Continua' }).click();
    await page.getByLabel('Da un file').check();
    await page.locator('#wizardFile').setInputFiles({ name: 'gate.jello', mimeType: 'application/zip', buffer: pkgBytes });
    await page.getByRole('button', { name: 'Continua' }).click();
    await page.locator('#createProject').click();
    await expect(page.locator('#projectSwitch, #lab').first()).toBeVisible();
    await page.evaluate(() => (window.__jello as any).flush());

    // 10. Components, parameters, assets and references of the new project.
    const c = await page.evaluate(() => (window.__jello as any).projects.active());
    expect([made.a, b]).not.toContain(c);
    s = await stored(page);
    const doc = s.projectdocs.find((p) => p.id === c);
    const docA = s.projectdocs.find((p) => p.id === made.a);
    expect(doc?.name).toBe('Gate importato');
    expect(doc.assets.palettes.map((x: any) => x.colors.length)).toEqual(docA.assets.palettes.map((x: any) => x.colors.length));
    expect(doc.assets.fonts.length).toBe(docA.assets.fonts.length);
    expect(doc.assets.typeStyles.length).toBe(docA.assets.typeStyles.length);
    // The export keeps «solo le icone usate» by default: a subset of A's icons, all valid, and every one the components use.
    const namesA = new Set<string>(docA.assets.iconSets.flatMap((i: any) => i.icons.map((x: any) => x.name)));
    const namesC: string[] = doc.assets.iconSets.flatMap((i: any) => i.icons.map((x: any) => x.name));
    expect(namesC.length).toBeGreaterThan(0);
    for (const n of namesC) expect(namesA.has(n), `icon ${n} comes from A`).toBe(true);
    const used = new Set<string>(
      s.components
        .filter((x) => x.projectId === made.a)
        .flatMap((x) => JSON.stringify(x.doc).match(/"icon":\{"kind":"svg","name":"([^"]+)"/g) ?? [])
        .map((m) => m.replace(/.*"name":"/, '').replace(/"$/, '')),
    );
    for (const n of used) expect(namesC, `icon ${n} used by a component is kept`).toContain(n);
    const matsC = s.materials.filter((m) => m.projectId === c);
    const cmpsC = s.components.filter((x) => x.projectId === c);
    expect(matsC.length, 'every material of A arrives').toBe(s.materials.filter((m) => m.projectId === made.a).length);
    expect(cmpsC.length, 'every component of A arrives').toBe(s.components.filter((x) => x.projectId === made.a).length);
    const gateC = matsC.find((m) => m.doc.name.startsWith('Gate glass'));
    const buttonC = cmpsC.find((x) => x.doc.name === buttonA.doc.name);
    expect(gateC && buttonC).toBeTruthy();
    expect([made.mat, gateB.id]).not.toContain(gateC.id);
    expect(buttonC.doc.material.preset, 'the link is re-mapped to the imported material').toBe(gateC.id);
    expect(gateC.doc.material.blur).toBe(29);
    expect(blurOf(buttonC.doc)).toBe(29);
    // No component of any project points at a material of another one.
    for (const cmp of s.components) {
      if (!isLocal(cmp.doc.material.preset)) continue;
      const target = s.materials.find((m) => m.id === cmp.doc.material.preset);
      expect(target?.projectId, `component ${cmp.doc.name} (${cmp.projectId}) links inside its project (preset ${cmp.doc.material.preset})`).toBe(cmp.projectId);
    }

    // 11. React export of the imported Button, mounted by its own runtime in an unrelated page.
    await page.evaluate(async (id) => {
      const h = window.__jello as any;
      h.setWorkspace('builder');
      h.builder.open(id);
    }, buttonC.id);
    const [download] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => (window.__jello as any).builder.exportWith('component-react'))]);
    const entries = unzip(new Uint8Array(readFileSync((await download.path())!)));
    const root = entries[0]!.path.split('/')[0]!;
    const files = new Map(entries.map((e) => [e.path.slice(root.length + 1), e.data]));
    const config = JSON.parse(new TextDecoder().decode(files.get('component.json')!));
    expect(config.type).toBe('button');
    expect(config.material.document.material.blur, 'the package carries the imported material').toBe(29);
    files.set(
      'harness.html',
      new TextEncoder().encode(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/runtime/jello.css"></head><body style="margin:0">
<div id="src" style="position:fixed;inset:0;background:repeating-linear-gradient(135deg,#ff453a 0 18px,#f4f4f2 18px 54px)"></div><div id="slot" style="position:fixed;left:40px;top:40px;width:320px;height:120px"></div>
<script type="module">
import { createComponent } from './runtime/jello.js';
const config = await (await fetch('./component.json')).json();
const instance = createComponent({ container: document.getElementById('slot'), config, source: document.getElementById('src'), inertLinks: true });
instance.mount();
window.__instance = instance;
document.documentElement.dataset.ready = 'true';
</script></body></html>`),
    );
    const types: Record<string, string> = { js: 'text/javascript', css: 'text/css', json: 'application/json', html: 'text/html' };
    const consumer = await context.newPage();
    const errors: string[] = [];
    consumer.on('requestfailed', (r) => errors.push(`requestfailed ${r.url()}`));
    consumer.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
    consumer.on('pageerror', (e) => errors.push(e.message));
    consumer.on('console', (m) => m.type() === 'error' && errors.push(`console.error ${m.text()}`));
    await context.route('http://pkg.test/**', (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1)) || 'harness.html';
      const data = files.get(path);
      if (!data) return route.fulfill({ status: 404, body: 'not found' });
      return route.fulfill({ status: 200, contentType: types[path.split('.').pop()!] ?? 'application/octet-stream', body: Buffer.from(data) });
    });
    await consumer.goto('http://pkg.test/');
    await consumer.waitForSelector('html[data-ready=true]', { state: 'attached', timeout: 10_000 }).catch(async (e: Error) => {
      const html = await consumer.content();
      throw new Error(`the exported component did not mount; page errors: ${errors.join(' | ') || 'none'}; url ${consumer.url()}; html ${html.length} bytes: ${html.slice(0, 300)}; ${e.message}`);
    });
    await expect(consumer.locator('button, a').filter({ hasText: /\S/ }).first()).toBeVisible();
    expect(errors, 'the exported component mounts without errors').toEqual([]);
    await consumer.close();

    // Reload: everything above is what is on disk, not only in memory.
    await page.reload();
    await ready(page);
    const after = await stored(page);
    expect(after.materials.length).toBe(s.materials.length);
    expect(after.components.length).toBe(s.components.length);
    expect(after.projectdocs.length).toBe(3);
  });
});
