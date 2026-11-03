/**
 * M6.4: experimental Jelly inside Jello Studio. Real Studio, real renderer, real IndexedDB.
 * Physical response is read from the renderer's own pull-only snapshot ((window as any).__jelloJelly),
 * never from timing guesses; the exported package is served and rendered by a separate page.
 */
import { createServer, type Server } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { unzip } from '../../src/export/zip';

interface Motion { x: number; v: number; target: number; pressed: boolean; scheduler: { active: number; pending: boolean; frames: number } }

const motion = (page: Page): Promise<Motion> => page.evaluate(() => (window as any).__jelloJelly!.bridge()!.motion!);
const status = (page: Page) => page.evaluate(() => (window as any).__jelloJelly!.bridge()!.status as Record<string, any>);
interface Work { doc: Record<string, any>; records: { id: string }[]; recordId: string | null; dirty: boolean }
const work = (page: Page): Promise<Work> => page.evaluate(() => (window as any).__jelloJelly.state());

async function openJelly(page: Page, query = 'studio=jelly&animate=0') {
  await page.goto(`./?${query}`);
  await page.waitForSelector('html[data-ready=true]');
  await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
  await page.waitForFunction(() => !!(window as any).__jelloJelly?.bridge()?.status);
}
/** On phones the Inspector and the library live in a drawer behind the Regolazioni toggle. */
async function drawer(page: Page, open: boolean) {
  const toggle = page.locator('#panelToggle');
  if (!(await toggle.isVisible())) return;
  if (((await toggle.getAttribute('aria-expanded')) === 'true') !== open) await toggle.click();
}
async function advanced(page: Page) {
  await drawer(page, true);
  await page.locator('#jl-level-advanced').click();
}
async function num(page: Page, key: string, value: string) {
  const input = page.locator(`#num-jelly-${key}`);
  await input.scrollIntoViewIfNeeded();
  await input.fill(value);
}
async function press(page: Page, hold = 250) {
  const b = (await page.locator('#jl-primary').boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(hold);
}
const rest = (page: Page) => page.waitForFunction(() => { const m = (window as any).__jelloJelly!.bridge()!.motion!; return !m.scheduler.pending && m.scheduler.active === 0 && Math.abs(m.x) < 1e-3; }, null, { timeout: 8000 });

test.describe('Jelly Studio (M6.4)', () => {
  test('is a lazy experimental area: nothing of Jelly loads until it is opened', async ({ page }) => {
    const jelly: string[] = [];
    page.on('request', (r) => { if (/Jelly|jelly-lab|BuilderTrial/.test(r.url())) jelly.push(r.url()); });
    await page.goto('./?animate=0');
    await page.waitForSelector('html[data-ready=true]');
    await page.waitForTimeout(400);
    expect(jelly).toEqual([]);
    expect(await page.locator('.jelly-decoration').count()).toBe(0);
    await expect(page.locator('#ws-jelly')).toHaveAttribute('title', /sperimentale/);
    await page.locator('#ws-jelly').click();
    await expect(page.locator('#jl-primary .jelly-decoration')).toBeAttached();
    expect(jelly.length).toBeGreaterThan(0);
    await expect(page.locator('#jellyHeroSub')).toContainText('non ufficiale');
    await expect(page.locator('#jl-experimental-note')).toContainText('Sperimentale');
    // Never promoted: the stable catalogue still lists Jello as in development.
    await page.locator('#ws-material').click();
    await expect(page.locator('.soon-card', { hasText: 'Jello' })).toBeAttached();
  });

  test('uses the real renderer: Soft selected, SVG backend, every descriptor reachable in Advanced', async ({ page }) => {
    await openJelly(page);
    await expect(page.locator('#jl-preset-jelly-soft')).toHaveAttribute('aria-pressed', 'true');
    expect((await status(page)).backend).toBe('svg');
    await expect(page.locator('#jl-backend')).toContainText('SVG');
    await expect(page.locator('#jl-primary > .jelly-decoration svg')).toBeAttached();
    // Base shows the essentials; Advanced shows all 33 descriptors, generated from JELLY_PARAMS.
    await drawer(page, true);
    const base = await page.locator('[data-jelly-key]').count();
    expect(base).toBeLessThan(33);
    await advanced(page);
    expect(await page.locator('[data-jelly-key]').count()).toBe(33);
    for (const k of ['tint', 'foreground', 'seed', 'radiusMin', 'depthMax', 'responseMs', 'releaseImpulse', 'hover', 'press', 'profile', 'backend', 'fallback']) await expect(page.locator(`[data-jelly-key=${k}]`)).toBeAttached();
    const before = await work(page);
    await page.locator('#jl-level-base').click();
    expect((await work(page)).doc).toEqual(before.doc); // presentation only
  });

  test('edits tint, bubble density and damping live, without recreating the surface', async ({ page }) => {
    await openJelly(page);
    await advanced(page);
    const surfaceId = await page.locator('#jl-primary .jelly-decoration').evaluate((n) => { n.setAttribute('data-probe', 'same'); return n.className; });
    const bubbles0 = (await status(page)).bubbles;
    await num(page, 'density', '14');
    await expect.poll(async () => (await status(page)).bubbles).toBeGreaterThan(bubbles0);
    await num(page, 'dampingRatio', '0.4');
    await expect.poll(async () => (await work(page)).doc.behavior.dampingRatio).toBe(0.4);
    await page.locator('#param-jelly-tint').scrollIntoViewIfNeeded();
    await page.locator('#param-jelly-tint').click();
    await page.getByLabel('Valore HEX').fill('FF3366');
    await page.getByLabel('Valore HEX').blur();
    await expect.poll(async () => (await work(page)).doc.material.tint.toLowerCase()).toBe('#ff3366');
    expect(await page.locator('#jl-primary .jelly-decoration').getAttribute('data-probe')).toBe('same'); // same node: update(), not remount
    expect(surfaceId).toContain('jelly-decoration');
    await expect(page.locator('#jl-base-note')).toContainText('3 parametri modificati');
    expect((await work(page)).doc.bubbles.seed).toBe(10631); // seed untouched by edits
  });

  test('rejects invalid and relational edits visibly, without changing the document', async ({ page }) => {
    await openJelly(page);
    await advanced(page);
    await num(page, 'radiusMax', '1');
    await expect(page.locator('#reject-radiusMax')).toContainText('Raggio massimo (1) non può essere inferiore a Raggio minimo (2.5)');
    expect((await work(page)).doc.bubbles.radiusMax).toBe(6);
    await expect(page.locator('#jl-rejected')).toBeVisible();
    await num(page, 'density', '99');
    await expect(page.locator('#err-jelly-density')).toContainText('non applicato');
    expect((await work(page)).doc.bubbles.density).toBe(8);
    await num(page, 'radiusMax', '7');
    await expect(page.locator('#reject-radiusMax')).toBeHidden();
    expect((await work(page)).doc.bubbles.radiusMax).toBe(7);
  });

  test('press, hold and release use the solver: compression, rebound, rest, no RAF, one native click', async ({ page }) => {
    await openJelly(page);
    await drawer(page, false);
    const idle = await motion(page);
    expect(idle.scheduler.pending).toBe(false);
    await press(page);
    const held = await motion(page);
    expect(held.pressed).toBe(true);
    expect(held.x).toBeGreaterThan(0.02); // compressed toward pressStrength × maxDeformation = 0.039
    expect(held.x).toBeLessThanOrEqual(0.06 + 1e-9); // bounded by maxDeformation
    await page.mouse.up();
    await expect.poll(async () => (await motion(page)).v, { timeout: 3000 }).toBeLessThan(0); // release impulse
    await rest(page);
    const after = await motion(page);
    expect(after.scheduler).toMatchObject({ active: 0, pending: false });
    expect(await page.locator('#jl-clicks').textContent()).toContain('1');
    // repeated presses keep the state continuous and still come to rest
    for (let i = 0; i < 3; i++) { await press(page, 60); await page.mouse.up(); }
    await rest(page);
  });

  test('keyboard Space and Enter keep native Button semantics', async ({ page, isMobile }) => {
    test.skip(isMobile, 'no hardware keyboard on the emulated phone');
    await openJelly(page);
    const btn = page.locator('#jl-primary');
    await btn.focus();
    await page.keyboard.down(' ');
    await expect.poll(async () => (await motion(page)).pressed).toBe(true);
    await page.keyboard.up(' ');
    await expect(page.locator('#jl-clicks')).toContainText('1');
    await rest(page);
    await page.keyboard.down('Enter');
    await expect.poll(async () => (await motion(page)).pressed).toBe(true);
    await page.keyboard.up('Enter');
    await expect(page.locator('#jl-clicks')).toContainText('2');
    expect(await btn.evaluate((e) => e === document.activeElement)).toBe(true);
    // the decoration never intercepts input and never takes part in the accessibility tree
    expect(await btn.locator('.jelly-decoration').getAttribute('aria-hidden')).toBe('true');
    expect(await btn.locator('.jelly-decoration').evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none');
    await expect(page.getByRole('button', { name: 'Jelly', exact: true })).toHaveCount(1);
  });

  test('pointer leave cancels the press without a click; disabled does not move', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer-leave semantics are exercised with a mouse');
    await openJelly(page);
    await press(page, 120);
    await page.mouse.move(5, 5);
    await expect.poll(async () => (await motion(page)).pressed).toBe(false);
    await page.mouse.up();
    await expect(page.locator('#jl-clicks')).toContainText('0');
    await page.locator('#jl-state').selectOption('disabled');
    await expect(page.locator('#jl-primary')).toBeDisabled();
    await page.locator('#jl-primary').click({ force: true });
    expect((await motion(page)).x).toBe(0);
    await page.locator('#jl-state').selectOption('active');
    await expect(page.locator('#jl-primary')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.jl-hint')).toContainText(/Stato statico/);
  });

  test('presets, comparison and reset keep bubbles deterministic', async ({ page }) => {
    await openJelly(page);
    await advanced(page);
    const seeds: Record<string, number> = { 'jelly-soft': 10631, 'jelly-clear': 20631, 'jelly-candy': 30631, 'jelly-dense': 40631 };
    for (const [id, seed] of Object.entries(seeds)) {
      await page.locator(`#jl-preset-${id}`).click();
      await expect.poll(async () => (await work(page)).doc.id).toBe(id);
      expect((await work(page)).doc.bubbles.seed).toBe(seed);
    }
    // bubble positions of the live surface do not change across a Base/Advanced switch or a resize
    const positions = () => page.locator('#jl-primary [data-bubble-index]').evaluateAll((n) => n.map((e) => e.getAttribute('transform')));
    const p1 = await positions();
    await page.locator('#jl-level-base').click();
    await page.locator('#jl-size').selectOption('lg');
    await page.locator('#jl-size').selectOption('md');
    expect(await positions()).toEqual(p1);
    await page.locator('#jl-level-advanced').click();
    await num(page, 'dampingRatio', '1.5');
    await expect(page.locator('#jl-base-note')).toContainText('1 parametro modificato');
    await page.locator('#jl-reset-all').click();
    await expect(page.locator('#jl-base-note')).toContainText('nessuna modifica');
    await page.locator('#jl-compare').click();
    await expect(page.locator('#jl-stage .jelly-decoration')).toHaveCount(4);
    await expect.poll(async () => page.evaluate(() => (window as any).__jelloJelly!.bridge())).toBeNull(); // primary unmounted, no leak
    await page.locator('#jl-compare').click();
    await expect(page.locator('#jl-stage .jelly-decoration')).toHaveCount(1);
  });

  test('backend, fallbacks and reduced motion/transparency are reported honestly and stay readable', async ({ page }) => {
    await openJelly(page);
    await advanced(page);
    await page.locator('#param-jelly-backend').selectOption('css');
    await expect.poll(async () => (await status(page)).backend).toBe('css');
    await expect(page.locator('#jl-primary .jelly-decoration')).toHaveAttribute('data-backend', 'css');
    expect((await status(page)).bubbles).toBe(0);
    await expect(page.locator('#jl-diagnostics')).toContainText('CSS statico');
    await page.locator('#param-jelly-backend').selectOption('auto');
    await expect.poll(async () => (await status(page)).backend).toBe('svg');
    await page.locator('#jl-env-svgUnavailable').check();
    await expect.poll(async () => (await status(page)).backend).toBe('css');
    await expect(page.locator('#jl-reasons')).toContainText('SVG escluso');
    await page.locator('#jl-env-svgUnavailable').uncheck();
    await page.locator('#jl-env-opaque').check();
    await expect(page.locator('#jl-primary .jelly-decoration')).toHaveAttribute('data-opaque', 'true');
    await page.locator('#jl-env-opaque').uncheck();
    // reduced motion: dynamics stop, the Button is still there and the stored document is unchanged
    const doc = (await work(page)).doc;
    await drawer(page, false);
    await page.getByRole('button', { name: 'Ridotto', exact: true }).click();
    await expect.poll(async () => (await status(page)).motion).toBe('static');
    await press(page);
    expect((await motion(page)).x).toBe(0);
    await page.mouse.up();
    expect((await work(page)).doc).toEqual(doc);
    await page.getByRole('button', { name: 'Movimento', exact: true }).click();
    await expect.poll(async () => (await status(page)).motion).toBe('dynamic');
  });

  test('honours the system reduced-motion, reduced-transparency and forced-colors preferences', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await openJelly(page);
    const s = await status(page);
    expect(s).toMatchObject({ motion: 'static', motionReduced: true, forcedColors: true, opaque: true });
    await expect(page.locator('#jl-primary .jelly-decoration')).toHaveAttribute('data-forced', 'true');
    await expect(page.locator('#jl-primary')).toBeVisible();
    expect((await page.locator('#jl-primary').boundingBox())!.height).toBeGreaterThanOrEqual(36);
  });

  test('saves a personal copy atomically, restores it after reload and keeps projects apart', async ({ page, isMobile }) => {
    await openJelly(page);
    await advanced(page);
    await page.locator('#jl-preset-jelly-candy').click();
    await num(page, 'dampingRatio', '0.9');
    await num(page, 'density', '3');
    await drawer(page, true);
    await page.locator('#jl-save-copy').click();
    await expect(page.locator('#jl-save-status')).toContainText('Salvato');
    await expect(page.locator('.jl-record')).toHaveCount(1);
    const saved = await work(page);
    expect(saved.recordId).toBeTruthy();
    await page.reload();
    await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
    await expect.poll(async () => (await work(page)).records.length).toBe(1);
    await expect.poll(async () => (await work(page)).doc.behavior.dampingRatio).toBe(0.9);
    const after = await work(page);
    expect(after.doc.bubbles.seed).toBe(30631);
    expect(after.doc.bubbles.density).toBe(3);
    expect(after.recordId).toBe(saved.recordId);
    expect(after.dirty).toBe(false);
    // the stable database was never given a Jelly record
    const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());
    expect(dbs).toEqual(expect.arrayContaining(['jello-lab', 'jello-lab-experimental']));
    const stable = await page.evaluate(() => new Promise<string>((resolve) => {
      const r = indexedDB.open('jello-lab');
      r.onsuccess = () => {
        const tx = r.result.transaction(['materials', 'components', 'projectdocs'], 'readonly');
        const all = ['materials', 'components', 'projectdocs'].map((s) => new Promise<unknown[]>((res) => { const q = tx.objectStore(s).getAll(); q.onsuccess = () => res(q.result); }));
        void Promise.all(all).then((rows) => { r.result.close(); resolve(JSON.stringify(rows)); });
      };
    }));
    expect(stable).not.toMatch(/"family":"jelly"/);
    expect(stable).not.toMatch(/jelly-soft|jelly-candy/);
    if (isMobile) return;
    // a second project does not see the first one's copy
    await page.locator('#brandHome').click();
    await page.locator('#headerNewProject').click();
    await page.locator('#createNewProject').click();
    await page.locator('#projectName').fill('Progetto B');
    await page.getByRole('button', { name: 'Continua' }).click();
    await page.getByLabel('Progetto vuoto').check();
    await page.getByRole('button', { name: 'Continua' }).click();
    await page.locator('#createProject').click();
    await page.locator('#ws-jelly').click();
    await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
    await expect.poll(async () => (await work(page)).records.length).toBe(0);
    await expect(page.locator('#jl-empty')).toBeVisible();
    expect((await work(page)).doc.id).toBe('jelly-soft');
    await page.locator('#projectSwitch').selectOption({ label: 'Il mio progetto' });
    await expect.poll(async () => (await work(page)).records.length).toBe(1);
    await expect.poll(async () => (await work(page)).doc.behavior.dampingRatio).toBe(0.9);
  });

  test('a corrupt or newer stored record is reported and left alone', async ({ page }) => {
    await openJelly(page);
    await page.waitForFunction(() => new URLSearchParams(location.search).get('project')); // the URL follows the active project
    await page.evaluate(() => new Promise<void>((resolve) => {
      const open = indexedDB.open('jello-lab-experimental');
      open.onsuccess = () => {
        const db = open.result;
        const projectId = new URLSearchParams(location.search).get('project')!;
        const tx = db.transaction('jelly-materials', 'readwrite');
        tx.objectStore('jelly-materials').put({ id: 'broken', projectId, doc: { nope: 1 }, createdAt: 'x', updatedAt: 'x' });
        tx.oncomplete = () => { db.close(); resolve(); };
      };
    }));
    await page.reload();
    await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
    await drawer(page, true);
    await expect(page.locator('#jl-skipped')).toContainText('broken');
    await expect(page.locator('#jl-primary')).toBeVisible();
    await page.reload();
    await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration');
    await drawer(page, true);
    await expect(page.locator('#jl-skipped')).toContainText('broken'); // still there: reading never deletes
  });

  test('releases everything when the area is left: hidden preview is suspended and no RAF is left', async ({ page }) => {
    await openJelly(page);
    await drawer(page, false);
    await press(page, 100);
    await page.locator('#ws-material').click();
    await expect.poll(async () => (await status(page)).suspended).toBe(true);
    const m = await motion(page);
    expect(m.pressed).toBe(false);
    expect(m.scheduler.pending).toBe(false);
    await page.waitForTimeout(300);
    const frames = (await motion(page)).scheduler.frames;
    await page.waitForTimeout(300);
    expect((await motion(page)).scheduler.frames).toBe(frames);
    await page.mouse.up();
    await page.locator('#ws-jelly').click();
    await expect.poll(async () => (await status(page)).suspended).toBe(false);
  });

  test('Builder: Jelly trial on a Button leaves the component untouched and keeps its own snapshot', async ({ page }) => {
    await page.goto('./?workspace=builder&component=button&animate=0');
    await page.waitForSelector('html[data-ready=true]');
    await drawer(page, true);
    await page.evaluate(() => document.querySelectorAll('#panel details').forEach((d) => ((d as HTMLDetailsElement).open = true)));
    const doc0 = await page.evaluate(() => JSON.stringify((window.__jello as any).builder.doc));
    expect(await page.locator('.jelly-decoration').count()).toBe(0);
    await page.locator('#jl-trial-toggle').check();
    await expect(page.locator('#jl-trial-button .jelly-decoration')).toBeAttached();
    await page.locator('#jl-trial-source').selectOption('jelly-candy');
    await page.locator('#num-trial-dampingRatio').fill('0.8');
    await expect(page.locator('#jl-trial-message')).toContainText('salvata separatamente');
    expect(await page.evaluate(() => JSON.stringify((window.__jello as any).builder.doc))).toBe(doc0);
    const mat = await page.evaluate(() => (window.__jello as any).builder.doc.material);
    expect(mat.family).not.toBe('jelly');
    // back to the stable material: toggle off releases the renderer, nothing else to undo
    await page.locator('#jl-trial-toggle').uncheck();
    await expect(page.locator('.jelly-decoration')).toHaveCount(0);
    // the configuration was kept separately and comes back
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForSelector('html[data-ready=true]');
    await drawer(page, true);
    await page.evaluate(() => document.querySelectorAll('#panel details').forEach((d) => ((d as HTMLDetailsElement).open = true)));
    await page.locator('#jl-trial-toggle').check();
    await expect(page.locator('#jl-trial-source')).toHaveValue('jelly-candy');
    await expect(page.locator('#num-trial-dampingRatio')).toHaveValue('0.8');
    expect(await page.evaluate(() => JSON.stringify((window.__jello as any).builder.doc))).toBe(doc0);
  });

  test('Glass and Solid still render in the Material Lab, with no Jelly in them', async ({ page }) => {
    await page.goto('./?preset=optics&scene=grid&animate=0');
    await page.waitForSelector('html[data-ready=true]');
    expect(await page.locator('.jelly-decoration').count()).toBe(0);
    expect(await page.evaluate(() => Object.keys((window.__jello as any).params ?? {}).length)).toBeGreaterThan(5);
    await expect(page.locator('#statusChips')).toContainText('Percorso');
  });
});

// ---------------------------------------------------------------------------------------------
// Export → external consumer
// ---------------------------------------------------------------------------------------------

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown' };
function serve(root: string): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let file = normalize(join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)));
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) { res.statusCode = 404; res.end('not found'); return; }
      res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
      res.end(readFileSync(file));
    }).listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/` }));
  });
}

test.describe('Jelly experimental export', () => {
  test('exports a package that renders, with the real runtime, in an independent page', async ({ page, browser, isMobile }) => {
    test.skip(isMobile, 'download and consumer rendering are verified on desktop viewports');
    await openJelly(page);
    await page.locator('#jl-preset-jelly-candy').click();
    await expect.poll(async () => (await work(page)).doc.id).toBe('jelly-candy');
    const download = page.waitForEvent('download');
    await page.locator('#jl-export').click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('jello-jelly-jelly-candy.zip');
    const tmp = mkdtempSync(join(tmpdir(), 'jelly-pkg-'));
    const zipPath = join(tmp, 'pkg.zip');
    await file.saveAs(zipPath);
    const entries = unzip(new Uint8Array(readFileSync(zipPath)));
    const paths = entries.map((e) => e.path).sort();
    expect(paths).toEqual(['jello-jelly-jelly-candy/README.md', 'jello-jelly-jelly-candy/example/index.html', 'jello-jelly-jelly-candy/example/main.js', 'jello-jelly-jelly-candy/jelly.json', 'jello-jelly-jelly-candy/manifest.json', 'jello-jelly-jelly-candy/runtime/jello-jelly-experimental.css', 'jello-jelly-jelly-candy/runtime/jello-jelly-experimental.js']);
    for (const e of entries) { mkdirSync(dirname(join(tmp, 'site', e.path)), { recursive: true }); writeFileSync(join(tmp, 'site', e.path), e.data); }
    const manifest = JSON.parse(readFileSync(join(tmp, 'site/jello-jelly-jelly-candy/manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ experimental: true, backends: { supported: ['svg', 'css'] } });
    // the runtime in the package is byte-identical to the one the Studio serves (and the preview runs from the same sources)
    const served = await page.evaluate(async () => { const r = await fetch('./runtime-jelly/jello-jelly-experimental.js'); return Array.from(new Uint8Array(await r.arrayBuffer())).length; });
    expect(entries.find((e) => e.path.endsWith('experimental.js'))!.data.length).toBe(served);

    const { server, url } = await serve(join(tmp, 'site'));
    try {
      const consumer = await (await browser.newContext({ viewport: { width: 900, height: 600 } })).newPage();
      const errors: string[] = [];
      consumer.on('pageerror', (e) => errors.push(e.message));
      consumer.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      await consumer.goto(`${url}jello-jelly-jelly-candy/example/`);
      await consumer.waitForSelector('#jelly-button .jelly-decoration');
      await expect(consumer.locator('#state')).toContainText('Backend effettivo: svg');
      expect(await consumer.locator('#jelly-button .jelly-decoration svg').count()).toBe(1);
      const b = (await consumer.locator('#jelly-button').boundingBox())!;
      await consumer.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await consumer.mouse.down();
      await consumer.waitForTimeout(250);
      const m = await consumer.evaluate(() => (window as any).__jellyExample.surface.motion);
      expect(m.pressed).toBe(true);
      expect(m.x).toBeGreaterThan(0.02);
      await consumer.mouse.up();
      await expect(consumer.locator('#clicks')).toHaveText('1');
      await consumer.waitForFunction(() => { const x = (window as any).__jellyExample.surface.motion; return !x.scheduler.pending && Math.abs(x.x) < 1e-3; });
      await consumer.evaluate(() => (window as any).__jellyExample.destroy());
      expect(await consumer.locator('.jelly-decoration').count()).toBe(0);
      expect(errors).toEqual([]);
      await consumer.context().close();
    } finally { server.close(); }
  });

  test('offers no export without a runtime to ship: a clear message and no download', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop flow');
    await openJelly(page);
    await page.route('**/runtime-jelly/manifest.json', (r) => r.fulfill({ status: 404, body: 'x' }));
    let downloaded = false;
    page.on('download', () => { downloaded = true; });
    await page.locator('#jl-export').click();
    await expect(page.locator('#jl-export-message')).toContainText('Nessun pacchetto generato');
    expect(downloaded).toBe(false);
  });
});
