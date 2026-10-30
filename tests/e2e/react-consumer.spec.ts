/**
 * The exported React package inside an independent project
 * (examples/react-consumer: own package.json, npm install of the export,
 * own typecheck and Vite build, served from another origin). Nothing from
 * the lab is loaded: only what the export contains.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __consumer: { selected: string; events: string[] };
  }
}

const URL_ = 'http://127.0.0.1:4176/';
const exported = JSON.parse(readFileSync(new URL('../../examples/react-consumer/vendor/exported.jello-component.json', import.meta.url), 'utf8'));
const tabs = (page: import('@playwright/test').Page) => page.locator('nav.jello-bnav .jello-bnav-tab');

test.beforeEach(async ({ page }) => {
  await page.goto(URL_);
  await page.waitForSelector('nav.jello-bnav .jello-surface');
});

test('renders the exported structure with one material surface over the app content', async ({ page }) => {
  const nav = page.locator('nav.jello-bnav');
  await expect(nav).toHaveAttribute('aria-label', exported.root.label);
  await expect(tabs(page)).toHaveText(exported.root.children.map((t: { label: string }) => t.label));
  await expect(tabs(page).nth(3)).toHaveAttribute('data-value', '/settings');
  expect(await page.locator('nav.jello-bnav .jello-surface').count()).toBe(1);
  // Layout from the configuration: 66 px tall, fixed to the viewport, at most 440 px wide.
  const box = (await nav.boundingBox())!;
  expect(Math.round(box.height)).toBe(66);
  expect(box.width).toBeLessThanOrEqual(440.5);
  expect(await nav.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
  // Material from the export (navbar preset: blur 4px), applied by the bundled runtime.
  expect(await page.locator('nav.jello-bnav .jello-surface').evaluate((el) => el.style.getPropertyValue('--jello-blur'))).toBe('4px');
  // The custom SVG icon arrived sanitized, as filled shapes.
  await expect(tabs(page).nth(1).locator('svg')).toHaveAttribute('data-paint', 'fill');
  // The app content is the GlassSource; the bar is not inside it.
  expect(await page.evaluate(() => document.getElementById('content')!.classList.contains('jello-source'))).toBe(true);
  expect(await page.evaluate(() => document.getElementById('content')!.contains(document.querySelector('nav.jello-bnav')))).toBe(false);
});

test('uses refraction where the engine supports SVG filters on HTML, CSS elsewhere', async ({ page, browserName }) => {
  const path = await page.locator('nav.jello-bnav').getAttribute('data-jello-path');
  if (browserName === 'chromium') expect(path).toBe('refraction');
  else expect(['refraction', 'satin']).toContain(path);
});

test('controlled mode: the app owns the selection; events carry stable ids and values', async ({ page }) => {
  await expect(page.locator('#title')).toHaveText('Home');
  await tabs(page).filter({ hasText: 'Settings' }).click();
  await expect(page.locator('#title')).toHaveText('Settings');
  await expect(tabs(page).filter({ hasText: 'Settings' })).toHaveAttribute('aria-current', 'page');
  await expect(tabs(page).filter({ hasText: 'Home' })).not.toHaveAttribute('aria-current', 'page');
  const events = await page.evaluate(() => window.__consumer.events);
  expect(events).toContain('press:tab:/settings');
  expect(events).toContain('change:tab:/settings');
  // Same tab again: reselect, no change.
  await page.locator('#content').evaluate((el) => (el.scrollTop = 400));
  await tabs(page).filter({ hasText: 'Settings' }).click();
  await expect.poll(() => page.evaluate(() => window.__consumer.events.filter((e) => e.startsWith('reselect')).length)).toBe(1);
  await expect.poll(() => page.locator('#content').evaluate((el) => el.scrollTop)).toBe(0);
});

test('keyboard: arrows move focus, Enter selects, focus is visible', async ({ page }) => {
  await tabs(page).first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs(page).nth(1)).toBeFocused();
  await expect(page.locator('#title')).toHaveText('Home');
  expect(await tabs(page).nth(1).evaluate((el) => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.locator('#title')).toHaveText('Explore');
});

test('the project ships the same runtime the lab previews with', async () => {
  const hash = (p: string) => createHash('sha256').update(readFileSync(new URL(p, import.meta.url))).digest('hex');
  expect(hash('../../examples/react-consumer/vendor/jello-bottom-navigation-react/runtime/jello.js')).toBe(hash('../../dist-lib/jello.js'));
  const pkg = JSON.parse(readFileSync(new URL('../../examples/react-consumer/vendor/jello-bottom-navigation-react/package.json', import.meta.url), 'utf8'));
  expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  expect(Object.keys(pkg.peerDependencies)).toEqual(['react', 'react-dom']);
});
