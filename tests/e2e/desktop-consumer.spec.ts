/** Installed React and HTTP-only Vanilla packages, compared with the shared Studio Stage. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { ComponentDefinition } from '../../src/components';
import { lab } from './helpers';

const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
function signature(page: Page, selector = '.jello-dnav') {
  return page.locator(selector).evaluate((nav: HTMLElement) => {
    const measure = (el: HTMLElement) => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return { width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10,
        padding: s.padding, radius: s.borderRadius, gap: s.gap, color: s.color, fontSize: s.fontSize,
        fontWeight: s.fontWeight, direction: s.flexDirection, justify: s.justifyContent, background: s.backgroundColor };
    };
    return { root: measure(nav), region: [...nav.querySelectorAll<HTMLElement>('.jello-dnav-region')].map(measure),
      items: [...nav.querySelectorAll<HTMLElement>('[data-item]')].map((el) => ({ id: el.dataset.item, group: el.dataset.group,
        role: el.dataset.role, label: el.textContent, aria: el.getAttribute('aria-label'), href: el.getAttribute('href'),
        icon: el.querySelector('svg')?.innerHTML, style: measure(el) })),
      material: nav.querySelector<HTMLElement>('.jello-solid, .jello-surface')?.style.cssText.replace(/--jello-(px|py|press|hover)[^;]*;/g, '') };
  });
}

for (const format of ['react', 'vanilla'] as const) for (const family of ['glass', 'solid']) {
  test(`${format} ${family}: independent package, Stage parity, actions, keyboard, responsive, config update and cleanup`, async ({ page, context }) => {
    const root = `jello-desktop-${family}-${format}`;
    const folder = format === 'react' ? `examples/react-consumer/vendor/${root}` : `examples/vanilla-consumer/${root}`;
    const config = JSON.parse(readFileSync(`${folder}/component.json`, 'utf8')) as ComponentDefinition;
    for (const asset of ['jello.js', 'jello.css', 'types/runtime/index.d.ts']) expect(hash(`${folder}/runtime/${asset}`)).toBe(hash(`dist-lib/${asset}`));
    await page.goto('./?workspace=builder&component=desktop-navbar&scene=app&animate=0');
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    expect(await lab(page, `return h.builder.importComponent(${JSON.stringify(JSON.stringify(config))})`)).toBe(true);
    const studio = page.locator('#stageMain .jello-dnav');
    await expect(studio).toBeVisible();
    const consumer = await context.newPage();
    const errors: string[] = [], requests: string[] = [];
    consumer.on('pageerror', (e) => errors.push(e.message));
    consumer.on('request', (request) => requests.push(request.url()));
    await consumer.goto(format === 'react' ? `http://127.0.0.1:4176/?desktop=${family}` : `http://127.0.0.1:4177/${root}/example/`);
    const nav = consumer.locator('.jello-dnav');
    await expect(nav).toHaveCount(1);
    const width = (await studio.boundingBox())!.width;
    const fontSize = await studio.evaluate((el) => getComputedStyle(el).fontSize);
    await consumer.evaluate(({ width, format, fontSize }) => {
      const el = document.getElementById(format === 'react' ? 'desktop-slot' : 'jello-example')!;
      el.style.width = `${width}px`; el.style.maxWidth = 'none'; el.style.padding = '0'; el.style.fontSize = fontSize;
    }, { width, format, fontSize });
    await expect.poll(async () => {
      const actual = await signature(consumer), expected = await signature(page, '#stageMain .jello-dnav');
      return JSON.stringify(actual) === JSON.stringify(expected) ? { same: true } : { actual, expected };
    }).toEqual({ same: true });
    await expect(nav.locator('[data-role=brand]')).toHaveAccessibleName('Studio home');
    await expect(nav.locator('[data-item=projects]')).toHaveAttribute('data-group', 'group');
    await nav.locator('[data-item=home]').focus();
    await consumer.keyboard.press('ArrowRight');
    await expect(nav.locator('[data-item=projects]')).toBeFocused();
    await consumer.keyboard.press('Enter');
    await expect(nav.locator('[data-item=projects]')).toHaveAttribute('aria-current', 'page');
    await expect(nav.locator('[data-item=projects]')).toHaveCSS('outline-style', 'solid');
    await nav.locator('[data-item=action]').click();
    await expect(consumer.locator(format === 'react' ? '#desktop-events' : '#jello-output')).toContainText('create-project');
    await expect(nav.locator('[data-item=projects]')).toHaveAttribute('aria-current', 'page');
    await nav.locator('[data-item=settings]').click();
    await expect(consumer).toHaveURL(/#settings$/);
    await expect(nav.locator('[data-item=projects]')).toHaveAttribute('aria-current', 'page');
    if (format === 'react') {
      await consumer.locator('#desktop-active-api').click();
      await expect(nav.locator('[data-item=settings]')).toHaveAttribute('aria-current', 'page');
      await consumer.locator('#desktop-callback').click();
      await nav.locator('[data-item=action]').click();
      await expect(consumer.locator('#desktop-events')).toContainText('new:action:consumer:create-project');
      await consumer.locator('#desktop-update').click();
      await expect(nav.locator('[data-item=brand]')).toHaveText('Updated studio');
    } else {
      await consumer.evaluate(async () => {
        const path = '../index.js'; const pkg = await import(path);
        const host = document.createElement('div'); host.id = 'api-slot'; document.body.append(host);
        const instance = pkg.mount({ container: host });
        instance.setActiveItem('settings');
        instance.update({ ...pkg.config, content: { ...pkg.config.content, 'brand-label': { text: 'Updated studio' } } });
        instance.unmount(); instance.mount();
        (window as unknown as { desktopInstance: typeof instance }).desktopInstance = instance;
      });
      await expect(consumer.locator('#api-slot [data-item=brand]')).toHaveText('Updated studio');
      await expect(consumer.locator('#api-slot [data-item=settings]')).toHaveAttribute('aria-current', 'page');
      await consumer.evaluate(() => (window as unknown as { desktopInstance: { destroy(): void } }).desktopInstance.destroy());
      await expect(consumer.locator('#api-slot nav')).toHaveCount(0);
    }
    // Container-driven breakpoint, without a separate media query or a Mobile conversion.
    await consumer.evaluate((format) => {
      const el = document.getElementById(format === 'react' ? 'desktop-slot' : 'jello-example')!;
      el.style.width = '330px';
    }, format);
    await expect(nav).toHaveAttribute('data-breakpoint', 'compact');
    await expect(nav).toHaveAttribute('data-overflowing');
    await expect(consumer.locator('.jello-bnav')).toHaveCount(0);
    for (let i = 0; i < 3; i++) {
      await consumer.locator(format === 'react' ? '#desktop-toggle' : '#jello-destroy').click();
      await expect(nav).toHaveCount(0);
      await expect(consumer.locator('[data-jello-filters], .jello-surface, .jello-solid')).toHaveCount(0);
      await consumer.locator(format === 'react' ? '#desktop-toggle' : '#jello-mount').click();
      await expect(nav).toHaveCount(1);
      await expect(nav.locator(':scope > .jello-surface, :scope > .jello-solid')).toHaveCount(1);
    }
    if (format === 'vanilla') expect(requests.some((url) => /react|\/src\//.test(url))).toBe(false);
    expect(errors).toEqual([]);
    await consumer.close();
  });
}
