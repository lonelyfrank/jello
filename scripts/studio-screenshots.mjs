/** UI verification on an isolated browser profile; never touches the user's projects. */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const url = process.env.JELLO_STUDIO_URL ?? 'http://127.0.0.1:5173/';
const out = 'docs/screenshots/studio';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark', reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
const layouts = [];
const contrast = [];
const ratio = (foreground, background) => {
  const luminance = (hex) => {
    hex = hex.trim().slice(1);
    if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
    const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
};
const checkContrast = async (theme) => {
  const tokens = await page.locator('#app').evaluate((el) => {
    const style = getComputedStyle(el);
    return Object.fromEntries(['--text', '--muted', '--surface', '--surface-raised'].map((key) => [key, style.getPropertyValue(key)]));
  });
  for (const foreground of ['--text', '--muted']) for (const background of ['--surface', '--surface-raised']) {
    const value = ratio(tokens[foreground], tokens[background]);
    expect(value, `${theme}: ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5);
    contrast.push({ theme, foreground, background, ratio: Math.round(value * 100) / 100 });
  }
};
page.on('pageerror', (e) => errors.push(e.message));
const ready = () => page.waitForSelector('html[data-ready=true]');
const capture = async (name) => {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: innerHeight }));
  layouts.push({ name, ...layout });
  if (layout.scrollWidth > layout.width) console.log(await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > innerWidth + 1 && el.getBoundingClientRect().width > 0).slice(0, 20).map((el) => ({tag: el.tagName, id: el.id, cls: el.className, width: el.getBoundingClientRect().width, right: el.getBoundingClientRect().right}))));
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  expect(layout.scrollWidth, `overflow: ${name}`).toBeLessThanOrEqual(layout.width);
};
try {
  await page.goto(url);
  await ready();
  await checkContrast('dark');
  await capture('workspace-first-launch-desktop');
  await page.locator('#startKit').click();
  await expect(page.locator('#lab')).toBeVisible();
  await expect(page.locator('#saveStatus')).toHaveAttribute('data-kind', 'saved');
  await capture('material-lab-desktop');
  await page.locator('#ws-home').click();
  await capture('workspace-desktop');
  await page.locator('#ws-builder').click();
  await page.getByRole('button', { name: 'Layers', exact: true }).click();
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.locator('#tb-pick').click();
  await capture('component-builder-desktop');
  await page.locator('#ws-library').click();
  await expect(page.locator('.runtime-container .jello-bnav').first()).toBeAttached();
  await capture('library-desktop');
  await page.locator('#ws-preview').click();
  await capture('preview-test-desktop');
  await page.locator('#ws-export').click();
  await page.getByRole('button', { name: '1 Elemento', exact: true }).click();
  await page.getByRole('button', { name: 'Continua', exact: true }).click();
  await capture('export-desktop');
  await page.locator('#exportClose').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#ws-home').click();
  await capture('workspace-mobile');
  await page.locator('#ws-builder').click();
  await capture('component-builder-mobile');
  await page.locator('#panelToggle').click();
  await page.locator('#controls a[href="#panel"]').click();
  await page.locator('.preview').evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await capture('inspector-mobile');
  await page.locator('#panelClose').click();
  await page.locator('#ws-material').click();
  await capture('material-lab-mobile');
  await page.locator('#ws-library').click();
  await capture('library-mobile');
  // Zoom/reflow and landscape are additional layout checks, not physical-device verification.
  for (const size of [{ width: 320, height: 800 }, { width: 768, height: 1024 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(size);
    await page.locator('#ws-builder').click();
    await capture(`builder-${size.width}x${size.height}`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#studioSettings').click();
  await page.getByRole('button', { name: 'Chiaro', exact: true }).click();
  await checkContrast('light');
  await page.locator('#ws-home').click();
  await capture('workspace-light-desktop');
  await page.locator('#ws-builder').click();
  await capture('builder-light-desktop');
  expect(errors).toEqual([]);
  await writeFile(`${out}/verification.json`, JSON.stringify({ browser: await browser.version(), layouts, contrast, errors }, null, 2) + '\n');
  console.log(`Saved ${layouts.length} screenshots; no horizontal overflow or page errors.`);
} finally {
  await browser.close();
}
