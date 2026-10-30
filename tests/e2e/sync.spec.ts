/**
 * Lab → relay → phone preview. The relay runs on 127.0.0.1:5174 during the
 * suite (scripts/e2e-servers.mjs). A real phone on the LAN is not part of
 * this test.
 */
import { expect, test, type Page } from '@playwright/test';
import { lab, openLab, showPanel } from './helpers';

interface PreviewInfo {
  received: number;
  rejected: number;
  errors: string[];
  connected: boolean;
}

const info = (p: Page) => p.evaluate(() => (window.__jelloPreview as { info: PreviewInfo }).info);
const previewParams = (p: Page) =>
  p.evaluate(() => {
    const c = (window.__jelloPreview as { controller: { material: { material: Record<string, unknown> }; options: Record<string, unknown> } }).controller;
    return { material: c.material.material, options: c.options };
  });

async function startSync(page: Page) {
  await openLab(page, 'preset=navbar&object=navbar&scene=app&animate=0');
  await showPanel(page);
  await page.locator('#syncStart').click();
  await expect(page.locator('#syncStatus')).toHaveAttribute('data-kind', 'live');
  return (await page.locator('#syncPreviewUrl').textContent())!;
}

test('the phone preview follows the lab and recovers the full state on reconnection', async ({ page, context }) => {
  const url = await startSync(page);
  expect(url).toMatch(/preview\.html\?relay=.*&token=[A-Za-z0-9_-]{16,}/);
  const phone = await context.newPage();
  await phone.goto(url);
  await phone.waitForSelector('html[data-ready=true]');
  await expect.poll(async () => (await info(phone)).received).toBeGreaterThan(0);
  expect((await previewParams(phone)).options.object).toBe('navbar');

  await lab(page, `h.setParams({ refraction: 31 })`);
  await lab(page, `h.setOption('nav', 'profile')`);
  await expect.poll(async () => (await previewParams(phone)).material.refraction).toBe(31);
  await expect.poll(async () => (await previewParams(phone)).options.nav).toBe('profile');
  await expect(page.locator('#syncStatus')).toContainText('anteprime collegate: 1');

  // A preview that (re)connects later gets the last full state immediately.
  await phone.close();
  await lab(page, `h.setParams({ blur: 7 })`);
  const again = await context.newPage();
  await again.goto(url);
  await again.waitForSelector('html[data-ready=true]');
  await expect.poll(async () => (await previewParams(again)).material.blur).toBe(7);
  expect((await previewParams(again)).material.refraction).toBe(31);
});

test('an invalid message is rejected as a whole and the preview keeps its state', async ({ page, context, request }) => {
  const url = await startSync(page);
  const phone = await context.newPage();
  await phone.goto(url);
  await phone.waitForSelector('html[data-ready=true]');
  await expect.poll(async () => (await info(phone)).received).toBeGreaterThan(0);
  const before = await previewParams(phone);
  const u = new URL(url);
  const relay = u.searchParams.get('relay')!;
  const token = u.searchParams.get('token')!;
  const material = JSON.parse(await lab<string>(page, `return h.exportJson()`));
  material.material.refraction = 1e6;
  const res = await request.post(`${relay}/state?token=${token}`, {
    data: { type: 'state', protocol: 1, seq: 999, sentAt: 0, material, view: await lab(page, `return h.options()`), image: null },
  });
  expect(res.ok()).toBe(true);
  await expect.poll(async () => (await info(phone)).rejected).toBe(1);
  expect((await info(phone)).errors[0]).toMatch(/material/);
  expect(await previewParams(phone)).toEqual(before);
  await expect(phone.locator('#pvStatus')).toContainText('nulla applicato');
});

test('a local image reaches the preview through the relay, not as a blob URL', async ({ page, context }) => {
  const url = await startSync(page);
  await page.locator('#localImage').setInputFiles({
    name: 'p.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64'),
  });
  const phone = await context.newPage();
  await phone.goto(url);
  await phone.waitForSelector('html[data-ready=true]');
  await expect.poll(async () => (await previewParams(phone)).options.scene).toBe('photo');
  const src = await phone.locator('#stageMain .scene-photo img').first().getAttribute('src');
  expect(src).toMatch(/^http:\/\/127\.0\.0\.1:5174\/assets\/[0-9a-f]{64}\?token=/);
});

test('without a token the preview refuses to connect and says so', async ({ page }) => {
  await page.goto('./preview.html?relay=http://127.0.0.1:5174&token=bad');
  await page.waitForSelector('html[data-ready=true]');
  await expect(page.locator('#pvStatus')).toHaveAttribute('data-kind', 'error');
});
