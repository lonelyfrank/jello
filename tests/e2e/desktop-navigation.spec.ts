import { expect, test, type Page } from '@playwright/test';
import { componentTemplate, switchMaterialFamily, type ComponentDefinition } from '../../src/components';
import type { DesktopNavigation, DesktopNavigationOptions } from '../../src/runtime/desktop-navigation';
import type * as Runtime from '../../src/runtime/index';
import { lab, openLab, showPanel } from './helpers';

type State = { nav: DesktopNavigation; second?: DesktopNavigation; runtime: typeof Runtime; log: string[]; observers: Set<ResizeObserver>; hostStyle: string };
declare global { interface Window { desktopTest: State } }
const root = (page: Page) => page.locator('#desktop-host > nav');
const item = (page: Page, id: string) => root(page).locator(`[data-item="${id}"]`);

async function setup(page: Page, family = 'glass', controlled = false) {
  await page.route('**/desktop-runtime.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>Desktop runtime</title></head><body style="margin:0"><div id="source" style="position:absolute;inset:0;background:linear-gradient(120deg,#82c9ff,#ffe1a1);"><h1>Material source</h1></div><div id="desktop-host" style="position:relative;margin:16px"></div><button id="after">After navbar</button></body></html>' }));
  await page.goto('./desktop-runtime.html');
  await page.addStyleTag({ url: '/runtime/jello.css' });
  const config = switchMaterialFamily(componentTemplate('desktop-navbar')!.create(), family).definition;
  await page.evaluate(async ({ config, controlled }) => {
    const observers = new Set<ResizeObserver>(), Original = window.ResizeObserver;
    window.ResizeObserver = class extends Original {
      private targets = new Set<Element>();
      override observe(el: Element, options?: ResizeObserverOptions) { this.targets.add(el); observers.add(this); super.observe(el, options); }
      override unobserve(el: Element) { this.targets.delete(el); if (!this.targets.size) observers.delete(this); super.unobserve(el); }
      override disconnect() { this.targets.clear(); observers.delete(this); super.disconnect(); }
    };
    const path = '/runtime/jello.js'; const runtime = await import(path) as typeof Runtime;
    const container = document.getElementById('desktop-host')!, log: string[] = [];
    const options: DesktopNavigationOptions = { container, config: config as DesktopNavigationOptions['config'], source: document.getElementById('source'), controlled,
      onAction: (id, e) => log.push(`action:${id}:${e.action.kind}:${e.value}`), onChange: (id) => log.push(`change:${id}`),
      onReselect: (id) => log.push(`reselect:${id}`), onTabPress: (id) => log.push(`press:${id}`),
      onFocus: (id) => log.push(`focus:${id}`), onHover: (id) => log.push(`hover:${id}`),
    };
    const hostStyle = container.getAttribute('style')!;
    const nav = runtime.createComponent(options); nav.mount();
    window.desktopTest = { nav, runtime, log, observers, hostStyle };
  }, { config, controlled });
}

for (const family of ['glass', 'solid']) {
  test(`${family}: brand/regions, native actions, selection/reselect, pointer/keyboard and disabled/hidden`, async ({ page }) => {
    await setup(page, family);
    await expect(root(page)).toHaveAttribute('aria-label', 'Main navigation');
    await expect(root(page)).toHaveAttribute('data-material', family);
    await expect(root(page).locator('[data-region=start] [data-item]')).toHaveAttribute('data-item', 'brand');
    await expect(root(page).locator('[data-region=main] [data-item]')).toHaveText(['Home', 'Explore', 'Projects']);
    await expect(root(page).locator('[data-region=end] [data-item]')).toHaveText(['Settings', 'Action']);
    await expect(root(page).locator(family === 'glass' ? '.jello-surface' : '.jello-solid')).toHaveCount(1);
    await expect(item(page, 'home')).toHaveAttribute('aria-current', 'page');
    if (test.info().project.name === 'mobile-emulated') await item(page, 'explore').tap();
    else await item(page, 'explore').click();
    await expect(item(page, 'explore')).toHaveAttribute('aria-current', 'page');
    await item(page, 'explore').click();
    await item(page, 'action').click();
    await item(page, 'brand').click();
    await expect(page).toHaveURL(/#home$/);
    await expect(item(page, 'explore')).toHaveAttribute('aria-current', 'page');
    const events = await page.evaluate(() => window.desktopTest.log);
    expect(events).toContain('press:explore');
    expect(events).toContain('change:explore'); expect(events).toContain('reselect:explore');
    expect(events).toContain('action:action:consumer:action'); expect(events).toContain('action:brand:navigate:brand');
    await page.evaluate(() => {
      const { nav, runtime: r } = window.desktopTest;
      let next = r.setNavbarItemDisabled(nav.component, 'explore', true);
      next = r.setNavbarItemVisibility(next, 'projects', false);
      nav.update(next);
    });
    await expect(item(page, 'projects')).toHaveCount(0);
    await expect(item(page, 'explore')).toBeDisabled();
    await expect(item(page, 'home')).toHaveAttribute('aria-current', 'page');
    const before = await page.evaluate(() => window.desktopTest.log.length);
    await item(page, 'explore').evaluate((el: HTMLElement) => el.click());
    expect(await page.evaluate(() => window.desktopTest.log.length)).toBe(before);
    await item(page, 'home').focus(); await page.keyboard.press('ArrowRight');
    await expect(item(page, 'settings')).toBeFocused();
    await page.keyboard.press('Home'); await expect(item(page, 'brand')).toBeFocused();
    await page.keyboard.press('End'); await expect(item(page, 'action')).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(item(page, 'settings')).toBeFocused();
    await page.keyboard.press('Space'); await expect(item(page, 'settings')).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate(() => window.desktopTest.log.includes('reselect:settings'))).toBe(true);
    const focus = await item(page, 'settings').evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(focus).toBe('solid');
    await page.keyboard.press('Tab'); await expect(item(page, 'action')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.locator('#after')).toBeFocused();
  });
}

test('controlled selection, safe links, router state and atomic invalid updates', async ({ page }) => {
  await setup(page, 'solid', true);
  await page.evaluate(() => {
    const { nav, log } = window.desktopTest;
    nav.update({ ...nav.component, interactions: { ...nav.component.interactions, events: { ...nav.component.interactions.events, action: 'desktop-activate' } } });
    nav.host.addEventListener('desktop-activate', (event) => log.push(`dom:${(event as CustomEvent).detail.itemId}`));
  });
  await item(page, 'projects').click();
  expect(await page.evaluate(() => window.desktopTest.log)).toContain('dom:projects');
  await expect(item(page, 'home')).toHaveAttribute('aria-current', 'page');
  await page.evaluate(() => window.desktopTest.nav.setActiveItem('projects'));
  await expect(item(page, 'projects')).toHaveAttribute('aria-current', 'page');
  await page.evaluate(() => {
    const { nav, runtime: r } = window.desktopTest;
    nav.update(r.setNavbarItemAction(nav.component, 'explore', { kind: 'navigate', href: '/desktop-runtime.html#destination' }));
  });
  await item(page, 'explore').click(); await expect(page).toHaveURL(/#destination$/);
  await expect(item(page, 'projects')).toHaveAttribute('aria-current', 'page');
  await page.evaluate(() => {
    const { nav, runtime: r } = window.desktopTest;
    nav.setActiveItem('explore');
    let next = r.setNavbarItemAction(nav.component, 'explore', { kind: 'navigate', href: 'https://example.com/', target: '_blank' });
    nav.update(next);
  });
  await expect(item(page, 'explore')).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(item(page, 'explore')).toHaveAttribute('target', '_blank');
  await expect(item(page, 'explore')).toHaveAttribute('aria-current', 'page');
  expect(await page.evaluate(() => {
    const { nav, runtime: r } = window.desktopTest;
    const bad = { ...nav.component, content: { ...nav.component.content, explore: { action: { kind: 'navigate', href: 'javascript:alert(1)' } } } } as unknown as DesktopNavigationOptions['config'];
    const results = [];
    try { nav.update(bad); results.push(false); } catch { results.push(true); }
    try { r.createComponent({ container: document.getElementById('desktop-host')!, config: bad }); results.push(false); } catch { results.push(true); }
    return results;
  })).toEqual([true, true]);
  await expect(root(page)).toHaveCount(1); await expect(item(page, 'explore')).toHaveAttribute('href', 'https://example.com/');
  await page.evaluate(() => {
    const { nav, runtime: r } = window.desktopTest; nav.update(r.setNavbarItemDisabled(nav.component, 'explore', true));
    window.desktopTest.log.length = 0;
  });
  await expect(item(page, 'explore')).not.toHaveAttribute('href');
  await item(page, 'explore').evaluate((el: HTMLElement) => el.click());
  expect(await page.evaluate(() => window.desktopTest.log)).toEqual([]);
});

test('stable IDs, groups, focus repair, material switch, instance isolation and repeated cleanup', async ({ page }) => {
  await setup(page);
  await item(page, 'explore').focus();
  await page.evaluate(() => {
    const s = window.desktopTest, { nav, runtime: r } = s;
    const group = r.addNavbarGroup(nav.component, 'Primary');
    let next: ComponentDefinition = r.moveNavbarItemToGroup(group.definition, 'projects', group.id);
    next = r.setDesktopNavbarRegion(next, group.id, 'main')!;
    next = { ...next, content: { ...next.content, 'explore-label': { text: 'Discover' } } };
    (nav.elementFor('explore') as HTMLElement & { stable?: boolean }).stable = true;
    nav.update(next);
    const secondHost = document.createElement('div'); secondHost.id = 'second-host'; document.body.append(secondHost);
    s.second = r.mountComponent({ container: secondHost, config: r.switchMaterialFamily(nav.component, 'solid').definition as DesktopNavigationOptions['config'] });
  });
  await expect(item(page, 'explore')).toBeFocused();
  expect(await item(page, 'explore').evaluate((el) => (el as HTMLElement & { stable?: boolean }).stable)).toBe(true);
  await expect(item(page, 'projects')).toHaveAttribute('data-group', 'group');
  await item(page, 'projects').click();
  await expect(page.locator('#second-host [data-item=home]')).toHaveAttribute('aria-current', 'page');
  await page.evaluate(() => {
    const { nav, runtime: r } = window.desktopTest;
    nav.elementFor('explore')!.focus();
    nav.update(r.setNavbarItemVisibility(nav.component, 'explore', false));
    nav.update(r.switchMaterialFamily(nav.component, 'solid').definition);
  });
  await expect(item(page, 'projects')).toBeFocused();
  await expect(root(page).locator('.jello-solid')).toHaveCount(1);
  await expect(root(page).locator('.jello-surface')).toHaveCount(0);
  await page.evaluate(() => {
    const { nav, runtime: r } = window.desktopTest;
    nav.update(r.switchMaterialFamily(nav.component, 'glass').definition);
    for (let i = 0; i < 5; i++) { nav.unmount(); nav.mount(); }
  });
  await expect(root(page).locator('.jello-surface')).toHaveCount(1);
  await page.evaluate(() => {
    const s = window.desktopTest;
    const stale = s.nav.elementFor('home')!;
    const config = s.nav.component; s.nav.destroy(); s.nav.destroy(); s.second!.destroy();
    for (let i = 0; i < 5; i++) {
      const nav = s.runtime.mountComponent({ container: document.getElementById('desktop-host')!, config });
      nav.destroy();
    }
    s.log.length = 0;
    stale.click();
  });
  await expect(page.locator('.jello-dnav, .jello-surface, .jello-solid, filter')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.desktopTest.observers.size)).toBe(0);
  expect(await page.evaluate(() => window.desktopTest.log)).toEqual([]);
  expect(await page.locator('#desktop-host').getAttribute('style')).toBe(await page.evaluate(() => window.desktopTest.hostStyle));
});

test('Desktop geometry and customizable indicator/styles affect computed layout', async ({ page }) => {
  await setup(page, 'glass');
  await page.evaluate(() => {
    const { nav, runtime: r } = window.desktopTest;
    let def: ComponentDefinition = { ...nav.component, responsive: { ...nav.component.responsive, breakpoints: [] } };
    for (const [path, value] of Object.entries({ 'layout.widthMode': 'fixed', 'layout.width': 300, 'layout.align': 'end',
      'layout.radius': 12, 'layout.gap': 20, 'layout.padding': 10, 'style.typography.fontSize': 16,
      'style.icon.size': 30, 'style.appearance.indicator.color': '#123456', 'style.appearance.indicator.inset': 3 })) def = r.setDesktopNavbarField(def, path, value)!;
    nav.update(def);
  });
  await expect(root(page)).toHaveCSS('width', '300px');
  await expect(root(page)).toHaveCSS('border-radius', '12px');
  await expect(root(page)).toHaveCSS('padding-left', '10px');
  await expect(item(page, 'home')).toHaveCSS('font-size', '16px');
  await expect(item(page, 'home').locator('svg')).toHaveCSS('width', '30px');
  await expect.poll(() => item(page, 'home').evaluate((el) => {
    const style = getComputedStyle(el, '::before'); return { background: style.backgroundColor, inset: style.top };
  })).toEqual({ background: 'rgb(18, 52, 86)', inset: '3px' });
  const aligned = await root(page).evaluate((el) => Math.abs(el.getBoundingClientRect().right - el.parentElement!.getBoundingClientRect().right));
  expect(aligned).toBeLessThan(1);
  await page.evaluate(() => {
    const { nav, runtime: r } = window.desktopTest;
    let def = r.setDesktopNavbarField(nav.component, 'layout.widthMode', 'fill')!;
    def = r.setDesktopNavbarField(def, 'layout.maxWidth', 280)!;
    def = r.setDesktopNavbarField(def, 'style.appearance.indicator.style', 'none')!;
    def = r.updateNavbarItem(def, 'home', { iconPosition: 'end' });
    nav.update(def);
  });
  await expect(root(page)).toHaveCSS('width', '280px');
  await expect(item(page, 'home')).toHaveCSS('flex-direction', 'row-reverse');
  await expect.poll(() => item(page, 'home').evaluate((el) => getComputedStyle(el, '::before').backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await page.evaluate(() => {
    const { nav, runtime: r } = window.desktopTest;
    nav.update(r.setDesktopNavbarField(nav.component, 'layout.widthMode', 'hug')!);
    nav.previewState('explore', 'pressed');
  });
  await expect(item(page, 'explore')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.08)');
  await page.evaluate(() => window.desktopTest.nav.previewState('explore', 'disabled'));
  await expect(item(page, 'explore')).toBeDisabled();
  await expect(item(page, 'explore')).toHaveCSS('opacity', '0.4');
});

test('externally owned Glass group survives one navbar and releases after its owner destroys it', async ({ page }) => {
  await setup(page, 'glass');
  await page.evaluate(() => {
    const s = window.desktopTest, r = s.runtime;
    const config = s.nav.component; s.nav.destroy();
    const material = r.resolveDefinitionMaterial(config);
    if (material.family !== 'glass') throw new Error('Glass required');
    const group = r.createGlassGroup({ source: document.getElementById('source')!, material });
    const container = document.getElementById('desktop-host')!;
    s.nav = r.mountComponent({ container, config, group });
    s.second = r.mountComponent({ container, config, group });
    s.nav.destroy();
    if (s.second.materialGroup !== group) throw new Error('shared group replaced');
  });
  await expect(root(page)).toHaveCount(1);
  await item(page, 'projects').click();
  await expect(item(page, 'projects')).toHaveAttribute('aria-current', 'page');
  await page.evaluate(() => {
    const s = window.desktopTest, group = s.second!.materialGroup!;
    s.second!.destroy();
    // The group remains usable after both consumers release their surfaces.
    const extra = document.createElement('div'); extra.style.cssText = 'width:100px;height:44px'; document.body.append(extra);
    const surface = group.attach(extra, { radius: 8 }); surface.destroy(); extra.remove();
    group.destroy();
  });
  await expect(page.locator('.jello-dnav, .jello-surface, filter')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.desktopTest.observers.size)).toBe(0);
});

test('container breakpoints, geometry, label/icon placement, compress and accessible overflow', async ({ page }) => {
  await setup(page, 'solid');
  await page.evaluate(() => {
    const { nav } = window.desktopTest;
    const config = nav.component;
    nav.update({ ...config, responsive: { ...config.responsive, breakpoints: [
      { id: 'narrow', maxWidth: 700, overrides: { 'layout.labels': 'hide', 'layout.icons': 'hide', 'layout.gap': 4,
        'layout.padding': 8, 'layout.height': 60, 'layout.distribution': 'end', 'layout.compact': true } },
    ] } });
    document.getElementById('desktop-host')!.style.width = '600px';
  });
  await expect(root(page)).toHaveAttribute('data-breakpoint', 'narrow');
  await expect(root(page)).toHaveCSS('height', '60px');
  await expect(root(page)).toHaveCSS('padding-left', '8px');
  await expect(item(page, 'home').locator('svg')).toBeHidden();
  await expect(item(page, 'home')).toHaveAccessibleName('Home');
  await page.evaluate(() => {
    const { nav, runtime: r } = window.desktopTest;
    document.getElementById('desktop-host')!.style.width = '330px';
    let config = { ...nav.component, responsive: { ...nav.component.responsive, breakpoints: [], overflow: 'scroll' } };
    for (let i = 0; i < 15; i++) config = r.addNavbarItem(config, { label: `Destination ${i}` }).definition;
    nav.update(config);
  });
  await expect(root(page)).toHaveAttribute('data-overflowing');
  await expect(root(page).locator('[data-item]')).toHaveCount(21);
  await expect(item(page, 'home')).toHaveAccessibleName('Home');
  const geometry = await page.evaluate(() => {
    const { nav } = window.desktopTest;
    const controls = [...nav.host.querySelectorAll<HTMLElement>('[data-region=main] [data-item]')];
    return { noOverlap: controls.every((el, i) => !i || el.getBoundingClientRect().left >= controls[i - 1]!.getBoundingClientRect().right),
      scrollable: nav.regions.main.scrollWidth > nav.regions.main.clientWidth,
      host: nav.host.getBoundingClientRect().width };
  });
  expect(geometry.noOverlap).toBe(true); expect(geometry.scrollable).toBe(true); expect(geometry.host).toBeLessThanOrEqual(330);
  await item(page, 'home').focus(); await page.keyboard.press('End'); await expect(item(page, 'action')).toBeFocused();
  await page.evaluate(() => {
    const { nav } = window.desktopTest;
    nav.update({ ...nav.component, responsive: { ...nav.component.responsive, overflow: 'compress' } });
  });
  await expect(root(page)).toHaveAttribute('data-compressed');
  await expect(root(page).locator('[data-item]')).toHaveCount(21);
});

test('state styles, forced colors, reduced motion and per-item overrides remain observable', async ({ page }) => {
  await setup(page, 'solid');
  await page.evaluate(() => {
    const { nav, runtime: r } = window.desktopTest;
    let next = r.setDesktopNavbarField(nav.component, 'states.focus.style.color', '#123456')!;
    next = r.setDesktopNavbarField(next, 'states.focus.style.width', 4)!;
    next = { ...next, style: { ...next.style, items: { explore: { fontSize: 20, iconSize: 32 } } } };
    nav.update(next); nav.previewState('explore', 'focus');
  });
  await expect(item(page, 'explore')).toHaveCSS('outline-color', 'rgb(18, 52, 86)');
  await expect(item(page, 'explore')).toHaveCSS('outline-width', '4px');
  await expect(item(page, 'explore')).toHaveCSS('font-size', '20px');
  await expect(item(page, 'explore').locator('svg')).toHaveCSS('width', '32px');
  await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
  await page.evaluate(() => window.desktopTest.nav.previewState(null, null));
  await item(page, 'explore').focus(); await page.keyboard.press('ArrowRight');
  await expect(item(page, 'projects')).toBeFocused();
  await expect(item(page, 'projects')).toHaveCSS('outline-style', 'solid');
  await expect(item(page, 'projects')).toHaveCSS('transition-duration', '0s');
});

test('Studio technical preview uses the same runtime, switches material, updates JSON and changes viewport', async ({ page }) => {
  await openLab(page, 'workspace=builder&component=desktop-navbar&scene=app&animate=0');
  const nav = page.locator('#stageMain .jello-dnav');
  await expect(nav).toBeVisible();
  await showPanel(page);
  await expect(page.locator('#inspector')).toContainText('Anteprima tecnica Desktop');
  await page.locator('#bl-material-solid').click(); await expect(nav).toHaveAttribute('data-material', 'solid');
  await page.locator('#bl-material-glass').click(); await expect(nav).toHaveAttribute('data-material', 'glass');
  await lab(page, "h.setOption('device', 'phone')"); await expect(nav).toHaveAttribute('data-breakpoint', 'compact');
  await lab(page, "h.setOption('device', 'desktop')");
  await lab(page, "const doc = JSON.parse(h.builder.json()); doc.content['home-label'].text = 'Start here'; return h.builder.importComponent(JSON.stringify(doc))");
  await expect(nav.locator('[data-item=home]')).toHaveAccessibleName('Start here');
  await page.locator('#tb-interact').click();
  await nav.locator('[data-item=explore]').click(); await expect(nav.locator('[data-item=explore]')).toHaveAttribute('aria-current', 'page');
});
