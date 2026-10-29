import { expect, test, type Page } from '@playwright/test';
import { lab, openLab } from './helpers';

interface Status {
  effective: string;
  reasons: string[];
  looping: boolean;
  suspended: boolean;
  source: { ready: boolean; error: string | null; dynamic: boolean };
  counters: { programBuilds: number; uniformUpdates: number; mapUploads: number; mapCacheHits: number; frames: number; contextLosses: number; contextRestores: number; texturesAlive: number };
  canvas: { pixelWidth: number; pixelHeight: number; cssWidth: number; dpr: number; scale: number };
}

const status = (page: Page) => lab<Status | null>(page, `return h.scene.status`);

async function openScene(page: Page, query = '') {
  await openLab(page, `preset=jello&mode=scene&animate=0${query}`);
  await expect.poll(async () => (await status(page))?.counters.frames ?? 0).toBeGreaterThan(0);
}

/** Skips when this engine/environment has no WebGL2 (reported, not faked). */
async function requireWebGL2(page: Page) {
  const ok = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
  test.skip(!ok, 'WebGL2 non disponibile in questo browser headless');
}

test('the WebGL2 backend is loaded only when the controlled scene is shown', async ({ page }) => {
  await openLab(page, 'preset=jello&scene=grid&animate=0');
  const chunks = () => page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /scene-view-.*\.js/.test(e.name)).length);
  expect(await lab<boolean>(page, `return h.scene.loaded`)).toBe(false);
  expect(await chunks()).toBe(0);
  await page.locator('#tb-mode-scene').click();
  await expect.poll(() => lab<boolean>(page, `return h.scene.loaded`)).toBe(true);
  await expect.poll(chunks).toBe(1);
});

test.describe('controlled scene', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('./');
    await requireWebGL2(page);
  });

  test('renders on WebGL2 and nothing runs at rest', async ({ page }) => {
    await openScene(page);
    const s = (await status(page))!;
    expect(s.effective).toBe('webgl2');
    expect(s.counters.programBuilds).toBe(1);
    expect(s.looping).toBe(false);
    const frames = s.counters.frames;
    await page.waitForTimeout(500);
    expect((await status(page))!.counters.frames).toBe(frames);
    await expect(page.locator('#metrics [data-metric=loops]')).toHaveText('nessuno a riposo');
  });

  test('sliders update uniforms only; geometry uploads a map; the program is never rebuilt', async ({ page }) => {
    await openScene(page);
    const before = (await status(page))!.counters;
    for (const v of [5, 10, 20, 30]) await lab(page, `h.setParams({ refraction: ${v}, tintOpacity: ${v / 100} })`);
    await page.waitForTimeout(100);
    let after = (await status(page))!.counters;
    expect(after.programBuilds).toBe(1);
    expect(after.mapUploads).toBe(before.mapUploads);
    expect(after.uniformUpdates).toBeGreaterThanOrEqual(before.uniformUpdates + 4);
    await lab(page, `h.setParams({ band: 40 })`);
    await page.waitForTimeout(100);
    after = (await status(page))!.counters;
    expect(after.mapUploads).toBe(before.mapUploads + 1);
    await lab(page, `h.setParams({ band: ${26} })`);
    await page.waitForTimeout(100);
    expect((await status(page))!.counters.mapCacheHits).toBeGreaterThan(before.mapCacheHits);
    expect((await status(page))!.counters.programBuilds).toBe(1);
  });

  test('an animated pattern loops at its budget and stops when paused or hidden', async ({ page }) => {
    await openScene(page);
    await page.locator('#tb-pause').click(); // animate on
    await expect.poll(async () => (await status(page))!.looping).toBe(true);
    const f0 = (await status(page))!.counters.frames;
    await page.waitForTimeout(600);
    expect((await status(page))!.counters.frames).toBeGreaterThan(f0 + 5);
    await page.locator('#tb-pause').click(); // animate off
    await expect.poll(async () => (await status(page))!.looping).toBe(false);
    // Preview off-screen: suspended.
    await lab(page, `h.setOption('animate', true)`);
    await expect.poll(async () => (await status(page))!.looping).toBe(true);
    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('.preview-host')!;
      el.style.transform = 'translateY(-200vh)';
    });
    await expect.poll(async () => (await status(page))!.suspended).toBe(true);
    const f1 = (await status(page))!.counters.frames;
    await page.waitForTimeout(400);
    expect((await status(page))!.counters.frames).toBe(f1);
  });

  test('economy caps the device pixel ratio and the internal resolution', async ({ page }) => {
    await openScene(page, '&quality=economy');
    const s = (await status(page))!;
    expect(s.canvas.scale).toBe(0.5);
    expect(s.canvas.pixelWidth).toBe(Math.round(s.canvas.cssWidth * Math.min(s.canvas.dpr, 1) * 0.5));
    await lab(page, `h.setQuality({ profile: 'quality' })`);
    await expect.poll(async () => (await status(page))!.canvas.scale).toBe(1);
    expect((await status(page))!.counters.programBuilds).toBe(1);
  });

  test('context loss is survived: resources are recreated and rendering resumes', async ({ page }) => {
    await openScene(page);
    const lost = await lab<boolean>(page, `return h.scene.view.debugLoseContext()`);
    test.skip(!lost, 'WEBGL_lose_context non disponibile');
    await expect.poll(async () => (await status(page))!.effective).toBe('lost');
    await expect(page.locator('#stageSceneLabel')).toContainText('contesto perso');
    await lab(page, `h.scene.view.debugRestoreContext()`);
    await expect.poll(async () => (await status(page))!.effective).toBe('webgl2');
    const s = (await status(page))!;
    expect(s.counters.contextLosses).toBe(1);
    expect(s.counters.contextRestores).toBe(1);
    expect(s.counters.programBuilds).toBe(2);
    const frames = s.counters.frames;
    await lab(page, `h.setParams({ refraction: 33 })`);
    await expect.poll(async () => (await status(page))!.counters.frames).toBeGreaterThan(frames);
  });

  test('an image WebGL2 may not read (other origin, no CORS) is refused with a reason', async ({ page }) => {
    await page.route('http://other-origin.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64') }),
    );
    await openScene(page);
    // Loaded without a CORS request, the image would taint WebGL: the upload must be refused.
    await lab(page, `await h.scene.view.setSource({ kind: 'image', url: 'http://other-origin.test/x.png', crossOrigin: null })`);
    const s = (await status(page))!;
    expect(s.source.ready).toBe(false);
    expect(s.source.error).toMatch(/CORS/);
    expect(s.reasons.join()).toMatch(/CORS/);
  });

  test('a same-origin image loads; destroying the view releases every texture', async ({ page }) => {
    await openScene(page, '&texture=image');
    await expect.poll(async () => (await status(page))!.source.ready).toBe(true);
    const r = await lab<{ alive: number; after: number }>(page, `
      const c = document.createElement('canvas');
      c.style.cssText = 'width:200px;height:120px;position:fixed;left:0;top:0';
      document.body.append(c);
      const v = await h.createSceneView({ canvas: c, material: h.material(), source: { kind: 'pattern', pattern: 'blocks', animated: false } });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const alive = v.status.counters.texturesAlive;
      v.destroy();
      const after = v.status.counters.texturesAlive;
      c.remove();
      return { alive, after };
    `);
    expect(r.alive).toBeGreaterThan(0);
    expect(r.after).toBe(0);
  });

  test('a shader compilation error is reported, not hidden', async ({ page }) => {
    await openScene(page);
    const s = await lab<{ effective: string; reasons: string[] }>(page, `
      const c = document.createElement('canvas');
      document.body.append(c);
      const v = await h.createSceneView({ canvas: c, material: h.material(), source: { kind: 'pattern', pattern: 'grid', animated: false }, debugBreakShader: true });
      const s = v.status;
      v.destroy();
      c.remove();
      return s;
    `);
    expect(s.effective).toBe('unavailable');
    expect(s.reasons.join()).toMatch(/compilazione degli shader/);
  });
});

test('without WebGL2 the scene falls back to CSS on the same texture and says why', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      if (type === 'webgl2') return null;
      return (get as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof get;
  });
  await openLab(page, 'preset=jello&mode=scene&animate=0');
  await expect.poll(() => lab<boolean>(page, `return h.scene.fallback`)).toBe(true);
  await expect(page.locator('#stageSceneLabel')).toContainText('WebGL2 non disponibile');
  expect((await status(page))!.reasons.join()).toMatch(/WebGL2 non disponibile/);
  await expect(page.locator('#stageScene .scene-fallback')).toBeVisible();
  await expect(page.locator('#stageScene .jello-surface')).toHaveAttribute('data-jello-path', /satin|opaque/);
});
