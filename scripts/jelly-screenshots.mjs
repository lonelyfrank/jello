/** Actual browser captures only. Run against the private Vite server on 4178. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, firefox } from '@playwright/test';
import { PNG } from 'pngjs';

const directory = new URL('../docs/screenshots/jelly-m62/', import.meta.url);
mkdirSync(directory, { recursive: true });
const results = [];
for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]]) {
  const browser = await engine.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 1100 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (e) => { if (e.type() === 'error') errors.push(e.text()); });
  await page.goto('http://127.0.0.1:4178/tests/fixtures/jelly/');
  await page.waitForFunction(() => !!window.jellyFixture);
  await page.mouse.move(0, 0);
  for (const matrix of ['preset', 'variant', 'state']) {
    if (matrix === 'state') { await page.locator('#focus-sample').focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); }
    await page.locator(`#${matrix}-matrix`).screenshot({ path: new URL(`${name}-${matrix}.png`, directory).pathname });
  }
  // Screenshot-based diagnostics, not runtime background sampling or a general accessibility certification.
  const contrasts = [];
  const luminance = (rgb) => rgb.map((v) => { const c = v/255; return c <= 0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4; }).reduce((s, v, i) => s+v*[0.2126, 0.7152, 0.0722][i], 0);
  for (const host of await page.locator('#preset-matrix .test-button, #variant-matrix .test-button, #state-matrix .test-button').all()) {
    const info = await host.evaluate((e) => {
      const content = e.querySelector('.button-content');
      const box = e.getBoundingClientRect();
      const rect = content.getBoundingClientRect();
      content.style.visibility = 'hidden';
      return { color: getComputedStyle(e).color, x: rect.x-box.x, y: rect.y-box.y, width: rect.width, height: rect.height, label: e.parentElement.querySelector('.caption').textContent };
    });
    const bitmap = PNG.sync.read(await host.screenshot());
    await host.locator('.button-content').evaluate((e) => { e.style.visibility = ''; });
    const fg = luminance(info.color.match(/[\d.]+/g).slice(0, 3).map(Number));
    let minimum = Infinity;
    for (let y = Math.ceil(info.y); y < Math.floor(info.y+info.height); y++) for (let x = Math.ceil(info.x); x < Math.floor(info.x+info.width); x++) {
      const offset = (y*bitmap.width+x)*4;
      const bg = luminance([...bitmap.data.slice(offset, offset+3)]);
      minimum = Math.min(minimum, (Math.max(fg, bg)+0.05)/(Math.min(fg, bg)+0.05));
    }
    contrasts.push({ label: info.label, foreground: info.color, minContentBoxRatio: +minimum.toFixed(2) });
  }
  await page.locator('#optical-comparison').evaluate((e) => { e.open = true; });
  await page.locator('#optical-matrix .sample').last().waitFor();
  await page.locator('#optical-matrix').screenshot({ path: new URL(`${name}-optical.png`, directory).pathname });
  await page.emulateMedia({ forcedColors: 'active' });
  await page.locator('#state-matrix').screenshot({ path: new URL(`${name}-forced.png`, directory).pathname });
  results.push({ engine: name, version: browser.version(), viewport: '1400×1100', dpr: 1, errors, contrasts });
  await browser.close();
}
writeFileSync(new URL('capture-environment.json', directory), JSON.stringify(results, null, 2)+'\n');
