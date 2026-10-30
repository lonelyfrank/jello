import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { lab, openLab } from './helpers';

const origin = 'http://127.0.0.1:4177/';
const root = (type: string, family: string) => `jello-${type}-${family}-vanilla`;
const selector = (type: string) => type === 'button' ? '.jello-btn' : 'nav.jello-bnav:not(.navbar)';
const look = (page: Page, sel: string) => page.locator(sel).evaluate((el) => {
  const css = getComputedStyle(el);
  const content = getComputedStyle(el.querySelector('.jello-bnav-tab:not([data-active])') ?? el);
  const layer = el.querySelector('.jello-solid, .jello-surface')!;
  const surface = getComputedStyle(layer);
  return { tag: el.tagName, family: el.getAttribute('data-material'), text: el.textContent, color: content.color, font: content.font, padding: css.padding, radius: css.borderRadius, background: surface.backgroundColor, border: surface.border, shadow: surface.boxShadow, blur: layer.getAttribute('style')?.match(/--jello-blur:[^;]+/)?.[0] ?? null };
});

for (const type of ['button', 'mobile-navbar']) for (const family of ['glass', 'solid']) {
  test(`${type}/${family}: independent HTML keeps Studio rendering, events, keyboard and lifecycle`, async ({ page, context }) => {
    const errors: string[] = [];
    const consumer = await context.newPage();
    consumer.on('pageerror', (e) => errors.push(e.message));
    const pkg = root(type, family);
    const requests: string[] = [];
    consumer.on('request', (r) => requests.push(r.url()));
    await consumer.goto(`${origin}${pkg}/example/`);
    const sel = selector(type);
    await expect(consumer.locator(sel)).toBeVisible();
    // Imported from the exported JSON; no Studio source paths are used in the HTML consumer.
    const config = await consumer.evaluate(async (url) => (await fetch(url)).json(), `${origin}${pkg}/component.json`);
    await openLab(page, `workspace=builder&component=${type}&scene=app&animate=0`);
    await lab(page, `h.builder.importComponent(${JSON.stringify(JSON.stringify(config))})`);
    const studio = `#stageMain ${sel}`;
    await expect(page.locator(studio)).toHaveAttribute('data-material', family);
    await expect.poll(async () => JSON.stringify(await look(consumer, sel)) === JSON.stringify(await look(page, studio))).toBe(true);
    if (type === 'button') {
      await consumer.locator(sel).focus();
      await consumer.keyboard.press('Enter');
      await expect(consumer.locator('#jello-output')).toContainText('Press:');
      await page.locator(studio).focus();
      await page.keyboard.press('Enter');
      await expect.poll(async () => JSON.stringify(await look(consumer, sel)) === JSON.stringify(await look(page, studio))).toBe(true);
      // Runtime update: a disabled button retains native semantics and stops emitting presses.
      await consumer.evaluate(async ({ url, definition }) => {
        const rt = await import(url);
        const container = document.createElement('div'); document.body.append(container);
        const off = rt.mount({ container, config: { ...definition, content: { ...definition.content, root: { ...definition.content.root, disabled: true } } } });
        (window as unknown as Record<string, unknown>).__off = off;
      }, { url: `${origin}${pkg}/index.js`, definition: config });
      // Disabled is stored in content.root by the canonical schema.
      await expect(consumer.locator(sel).last()).toBeDisabled();
      await consumer.evaluate(() => ((window as unknown as { __off: { destroy(): void } }).__off).destroy());
    } else {
      const tabs = consumer.locator(`${sel} .jello-bnav-tab`);
      await tabs.first().focus();
      await consumer.keyboard.press('ArrowRight');
      await expect(tabs.nth(1)).toBeFocused();
      expect(await tabs.nth(1).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
      await consumer.keyboard.press('Enter');
      await expect(tabs.nth(1)).toHaveAttribute('aria-current', 'page');
      await expect(consumer.locator('#jello-output')).toContainText('Selected: explore');
      await page.locator(`${studio} .jello-bnav-tab`).nth(1).focus();
      await page.keyboard.press('Enter');
      await expect.poll(async () => JSON.stringify(await look(consumer, sel)) === JSON.stringify(await look(page, studio))).toBe(true);
    }
    for (const width of [320, 390, 768, 1280]) {
      await consumer.setViewportSize({ width, height: 860 });
      await expect.poll(async () => (await consumer.locator(sel).boundingBox())!.width).toBeLessThanOrEqual(width);
    }
    for (let i = 0; i < 3; i++) {
      await consumer.locator('#jello-destroy').click();
      await expect(consumer.locator(sel)).toHaveCount(0);
      await expect(consumer.locator('[data-jello-filters]')).toHaveCount(0);
      await consumer.locator('#jello-mount').click();
      await expect(consumer.locator(sel)).toHaveCount(1);
      await expect(consumer.locator(`${sel} > .jello-solid, ${sel} > .jello-surface`)).toHaveCount(1);
    }
    expect(requests.some((url) => /react|\/src\//.test(url))).toBe(false);
    expect(errors).toEqual([]);
    await consumer.close();
  });
}

test('the Vanilla consumers ship byte-identical runtime files and no React dependencies', async () => {
  const hash = (path: string) => createHash('sha256').update(readFileSync(new URL(path, import.meta.url))).digest('hex');
  for (const type of ['button', 'mobile-navbar']) for (const family of ['glass', 'solid']) {
    const base = `../../examples/vanilla-consumer/${root(type, family)}`;
    expect(hash(`${base}/runtime/jello.js`)).toBe(hash('../../dist-lib/jello.js'));
    expect(hash(`${base}/runtime/jello.css`)).toBe(hash('../../dist-lib/jello.css'));
    const pkg = JSON.parse(readFileSync(new URL(`${base}/package.json`, import.meta.url), 'utf8'));
    expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
    expect(Object.keys(pkg.peerDependencies ?? {})).toEqual([]);
  }
});

test('standalone Solid preserves material states and frees its layers on destroy', async ({ page }) => {
  await page.goto(`${origin}jello-solid-neutral-material/example/`);
  const host = page.locator('#jello-slot button');
  await expect(host.locator('.jello-solid')).toHaveCount(1);
  await host.hover();
  await expect(host).toHaveAttribute('data-jello-state', 'hover');
  await host.focus();
  await page.keyboard.down(' ');
  await expect(host).toHaveAttribute('data-jello-state', 'pressed');
  await page.keyboard.up(' ');
  await page.locator('#jello-destroy').click();
  await expect(host.locator('.jello-solid')).toHaveCount(0);
  await page.locator('#jello-mount').click();
  await expect(host.locator('.jello-solid')).toHaveCount(1);
});

test('Vanilla follows reduced motion and Glass transparency preferences', async ({ page, browserName }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${origin}jello-button-solid-vanilla/example/`);
  await expect(page.locator('.jello-btn')).toHaveAttribute('data-motion-reduced', '');
  if (browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    await page.goto(`${origin}jello-button-glass-vanilla/example/`);
    await expect(page.locator('.jello-btn')).toHaveAttribute('data-jello-path', 'opaque');
  }
});
