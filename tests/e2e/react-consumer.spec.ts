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
    __consumer: { selected: string; events: string[]; buttons: string[] };
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
  await expect(nav).toHaveAttribute('aria-label', exported.content.root.text);
  await expect(tabs(page)).toHaveText(exported.structure.children.map((n: { id: string; children: { id: string; role: string }[] }) => exported.content[n.children.find((c) => c.role === 'label')!.id].text));
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
  expect(hash('../../examples/react-consumer/vendor/jello-mobile-navbar-react/runtime/jello.js')).toBe(hash('../../dist-lib/jello.js'));
  const pkg = JSON.parse(readFileSync(new URL('../../examples/react-consumer/vendor/jello-mobile-navbar-react/package.json', import.meta.url), 'utf8'));
  expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  expect(Object.keys(pkg.peerDependencies)).toEqual(['react', 'react-dom']);
});

// The Button exported twice from the builder — a Glass action and a Solid link — used by the same app through the React package.
const buttons = (page: import('@playwright/test').Page) => page.locator('.actions .jello-btn');
const buttonLog = (page: import('@playwright/test').Page) => page.evaluate(() => window.__consumer.buttons);

test('exported buttons: one Glass action over the content, one Solid link that needs no source', async ({ page }) => {
  await expect(buttons(page)).toHaveCount(2);
  const action = buttons(page).nth(0);
  const link = buttons(page).nth(1);
  expect(await action.evaluate((el) => [el.tagName, el.getAttribute('data-material'), el.getAttribute('data-variant')])).toEqual(['BUTTON', 'glass', 'primary']);
  await expect(action.locator('> .jello-surface')).toHaveCount(1);
  await expect(action.locator('.jello-btn-label')).toHaveText('Inizia');
  expect(await link.evaluate((el) => [el.tagName, el.getAttribute('data-material'), el.getAttribute('data-variant'), el.getAttribute('href')])).toEqual(['A', 'solid', 'secondary', '/docs']);
  await expect(link.locator('> .jello-solid')).toHaveCount(1);
  await expect(link.locator('> .jello-surface')).toHaveCount(0);
  // The children of the React component replace the text of the definition.
  await expect(link.locator('.jello-btn-label')).toHaveText('Documentazione');
  // Named by their text, the icon is decorative.
  await expect(page.getByRole('button', { name: 'Inizia' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Documentazione' })).toHaveAttribute('href', '/docs');
  // The app owns where they are; the glass one has the app content behind it as its source.
  expect(await page.evaluate(() => document.getElementById('content')!.contains(document.querySelector('.actions .jello-btn')))).toBe(false);
  expect(await action.evaluate((el) => el.getAttribute('data-jello-path'))).toMatch(/refraction|satin/);
});

test('exported buttons answer through the React props: press, hover, focus, disabled, children and label', async ({ page }) => {
  const action = buttons(page).nth(0);
  await action.hover();
  await action.click();
  await expect.poll(() => buttonLog(page)).toEqual(['hover:pointer::', 'focus:pointer::', 'press:pointer::']);
  await page.mouse.move(2, 600);
  await action.focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await buttonLog(page)).filter((e) => e.startsWith('press')).length).toBe(2);
  // Focus is reported whichever way it came; the keyboard-only case is the link test below.
  expect((await buttonLog(page)).some((e) => e.startsWith('focus:'))).toBe(true);
  // Disabled by a prop: updated in place (the element stays), no press.
  const before = await action.elementHandle();
  await page.locator('#off').check();
  await expect(action).toBeDisabled();
  await expect(action).toHaveAttribute('data-disabled', '');
  expect(await action.evaluate((el, b) => el === b, before)).toBe(true);
  const presses = (await buttonLog(page)).filter((e) => e.startsWith('press')).length;
  await action.click({ force: true });
  expect((await buttonLog(page)).filter((e) => e.startsWith('press')).length).toBe(presses);
  await page.locator('#off').uncheck();
  await expect(action).toBeEnabled();
  // The label prop replaces the text, in place.
  await page.locator('#relabel').click();
  await expect(action.locator('.jello-btn-label')).toHaveText('Vai');
  expect(await action.evaluate((el, b) => el === b, before)).toBe(true);
});

test('exported link button: keyboard activation follows the browser (Enter), and the ring is the definition’s', async ({ page }) => {
  const link = buttons(page).nth(1);
  await link.focus();
  await page.keyboard.press('Shift+Tab'); // step back and Tab to it: focus-visible follows the keyboard
  for (let i = 0; i < 3 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(link).toBeFocused();
  expect(await link.evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineWidth, el.matches(':focus-visible')])).toEqual(['solid', '2px', true]);
});

test('the Button packages ship the same runtime as the lab and the same renderer for both materials', async () => {
  const hash = (p: string) => createHash('sha256').update(readFileSync(new URL(p, import.meta.url))).digest('hex');
  for (const root of ['jello-call-to-action-react', 'jello-solid-link-react']) {
    expect(hash(`../../examples/react-consumer/vendor/${root}/runtime/jello.js`)).toBe(hash('../../dist-lib/jello.js'));
    const pkg = JSON.parse(readFileSync(new URL(`../../examples/react-consumer/vendor/${root}/package.json`, import.meta.url), 'utf8'));
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    expect(Object.keys(pkg.peerDependencies)).toEqual(['react', 'react-dom']);
  }
  const link = JSON.parse(readFileSync(new URL('../../examples/react-consumer/vendor/exported-button-link.jello-component.json', import.meta.url), 'utf8'));
  expect(link).toMatchObject({ type: 'button', material: { family: 'solid' }, interactions: { behavior: { semantics: 'link' } }, content: { root: { href: '/docs' } } });
});
