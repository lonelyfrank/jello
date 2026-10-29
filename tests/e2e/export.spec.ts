/**
 * Export packages, used as a consumer would: downloaded from the lab,
 * unpacked, served from another origin, opened. The package example is then
 * compared with the lab's preview fixture at the same backend, source,
 * size, DPR and animation time.
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { unzip } from '../../src/export/zip';
import { lab, openLab, showPanel } from './helpers';

const TYPES: Record<string, string> = { js: 'text/javascript', css: 'text/css', json: 'application/json', html: 'text/html', md: 'text/markdown', ts: 'text/plain', jpg: 'image/jpeg' };

async function downloadPackage(page: Page, button: string) {
  await showPanel(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
  const zip = new Uint8Array(readFileSync((await download.path())!));
  return new Map(unzip(zip).map((e) => [e.path, e.data]));
}

/** Serves unpacked files at http://pkg.test/ (another origin than the lab). */
async function serve(page: Page, files: Map<string, Uint8Array>) {
  await page.context().route('http://pkg.test/**', (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    const data = files.get(path);
    if (!data) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: TYPES[path.split('.').pop()!] ?? 'application/octet-stream', body: Buffer.from(data) });
  });
}

async function shot(page: Page) {
  const buf = await page.locator('#fixture').screenshot({ animations: 'disabled', caret: 'hide' });
  return PNG.sync.read(buf);
}

function meanDiff(a: PNG, b: PNG) {
  expect([a.width, a.height]).toEqual([b.width, b.height]);
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    sum += (Math.abs(a.data[i]! - b.data[i]!) + Math.abs(a.data[i + 1]! - b.data[i + 1]!) + Math.abs(a.data[i + 2]! - b.data[i + 2]!)) / 3;
  }
  return sum / (a.width * a.height);
}

test.use({ colorScheme: 'light' });

test('the runtime package contains the built runtime, the material, a manifest and an example', async ({ page }) => {
  await openLab(page, 'preset=navbar&object=navbar&scene=app&animate=0');
  const files = await downloadPackage(page, '#exportPackage');
  const paths = [...files.keys()];
  for (const p of ['material.json', 'jello-manifest.json', 'README.md', 'runtime/jello.js', 'runtime/jello.css', 'runtime/package.json', 'runtime/types/runtime/index.d.ts', 'example/index.html', 'example/main.js']) {
    expect(paths).toContain(`jello-navbar/${p}`);
  }
  expect(paths.some((p) => /^jello-navbar\/runtime\/chunks\/scene-view-.*\.js$/.test(p))).toBe(true);
  expect(paths.every((p) => !p.includes('src/') && !p.endsWith('.map'))).toBe(true);
  const manifest = JSON.parse(new TextDecoder().decode(files.get('jello-navbar/jello-manifest.json')));
  expect(manifest).toMatchObject({ format: 'jello-package', kind: 'runtime', runtime: { version: '0.2.0' }, material: { id: 'navbar' } });
  expect(manifest.backend.candidates.map((c: { backend: string }) => c.backend)).toEqual(['svg', 'css']);
  const material = JSON.parse(new TextDecoder().decode(files.get('jello-navbar/material.json')));
  expect(material).toEqual(await lab(page, `return h.material()`));
});

test('the DOM example of the package renders like the preview (same backend, source, size, DPR)', async ({ page, browserName }) => {
  await openLab(page, 'preset=navbar&object=navbar&scene=app&animate=0');
  const files = await downloadPackage(page, '#exportPackage');
  await serve(page, files);
  const example = await page.context().newPage();
  const errors: string[] = [];
  example.on('pageerror', (e) => errors.push(e.message));
  await example.goto('http://pkg.test/jello-navbar/example/index.html');
  await example.waitForFunction(() => (window as unknown as { __jelloExample?: { ready: boolean } }).__jelloExample?.ready);
  await example.waitForTimeout(300);
  expect(errors).toEqual([]);
  const status = await example.locator('#status').textContent();
  if (browserName === 'chromium') expect(status).toContain('effettivo svg');
  const fromPackage = await shot(example);

  const preview = await page.context().newPage();
  await preview.goto('./preview.html?fixture=dom&builtin=navbar');
  await preview.waitForSelector('html[data-ready=true]');
  await preview.waitForTimeout(300);
  const fromPreview = await shot(preview);
  const d = meanDiff(fromPackage, fromPreview);
  test.info().annotations.push({ type: 'meanDiff', description: String(d) });
  expect(d).toBeLessThan(0.5);
});

test('the WebGL2 example of the package renders like the preview at t = 0', async ({ page }) => {
  await page.goto('./');
  const webgl2 = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  test.skip(!webgl2, 'WebGL2 non disponibile in questo browser headless');
  await openLab(page, 'preset=navbar&mode=scene&animate=0');
  await lab(page, `h.setBackend('webgl2')`);
  const doc = await lab<{ source: unknown; target: { backend: string } }>(page, `return h.material()`);
  expect(doc.target.backend).toBe('webgl2');
  expect(doc.source).toEqual({ kind: 'texture', texture: { kind: 'pattern', pattern: 'grid', animated: false } });
  const files = await downloadPackage(page, '#exportPackage');
  const manifest = JSON.parse(new TextDecoder().decode(files.get('jello-navbar/jello-manifest.json')));
  expect(manifest.backend.candidates[0].backend).toBe('webgl2');
  expect(manifest.source.instructions).toMatch(/non legge il DOM/);
  await serve(page, files);
  const example = await page.context().newPage();
  await example.goto('http://pkg.test/jello-navbar/example/index.html');
  await example.waitForFunction(() => (window as unknown as { __jelloExample?: { ready: boolean } }).__jelloExample?.ready);
  await example.waitForTimeout(300);
  await expect(example.locator('#status')).toContainText('WebGL2: webgl2');
  const fromPackage = await shot(example);
  const preview = await page.context().newPage();
  await preview.goto('./preview.html?fixture=scene&builtin=navbar');
  await preview.waitForSelector('html[data-ready=true]');
  await preview.waitForTimeout(300);
  const fromPreview = await shot(preview);
  const d = meanDiff(fromPackage, fromPreview);
  test.info().annotations.push({ type: 'meanDiff', description: String(d) });
  expect(d).toBeLessThan(0.5);
});

test('the CSS-only package says the rendering is reduced and works without the runtime', async ({ page }) => {
  await openLab(page, 'preset=navbar&object=navbar&scene=app&animate=0');
  const files = await downloadPackage(page, '#exportCssOnly');
  const paths = [...files.keys()];
  expect(paths).toContain('jello-navbar/jello-material.css');
  expect(paths.some((p) => p.includes('/runtime/'))).toBe(false);
  const manifest = JSON.parse(new TextDecoder().decode(files.get('jello-navbar/jello-manifest.json')));
  expect(manifest.reducedRendering).toMatch(/resa ridotta/);
  await expect(page.locator('#importMessages')).toContainText('resa ridotta');
  await serve(page, files);
  const example = await page.context().newPage();
  await example.goto('http://pkg.test/jello-navbar/example/index.html');
  const filter = await example.locator('.jello-surface').evaluate((el) => getComputedStyle(el).backdropFilter || getComputedStyle(el).getPropertyValue('-webkit-backdrop-filter'));
  expect(filter).toContain('blur(4px)');
});
