import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { componentTemplate, switchMaterialFamily, type ComponentDefinition } from '../../src/components';
import type { BottomNavigation } from '../../src/runtime/bottom-navigation';
import { unzip } from '../../src/export/zip';
import { lab, openLab, showPanel } from './helpers';

const bar = (page: Page) => page.locator('#stageMain nav.jello-bnav:not(.navbar)');
const tabs = (page: Page) => bar(page).locator('.jello-bnav-tab');
async function section(page: Page, id: string) {
  await page.locator(`[data-section="b-${id}"]`).evaluateAll((elements) => elements.forEach((el) => (el as HTMLDetailsElement).open = true));
}
async function select(page: Page, id: string) { await page.locator(`#structureTree [data-node="${id}"]`).click(); }

test('canonical Builder flow: add, duplicate, reorder, remove, group, hide, switch material, save/reopen and export both formats', async ({ page }) => {
  await openLab(page, 'workspace=builder&component=mobile-navbar&scene=app&animate=0');
  await showPanel(page);
  await page.getByRole('button', { name: 'Avanzato', exact: true }).click();
  await expect(tabs(page)).toHaveText(['Home', 'Explore', 'Profile']);
  await page.locator('#tabAdd').click();
  await expect(tabs(page)).toHaveCount(4);
  await page.locator('#tab-label').fill('Nuova');
  await page.locator('#tabDuplicate').click();
  await expect(tabs(page)).toHaveText(['Home', 'Explore', 'Profile', 'Nuova', 'Nuova (copia)']);
  const copyId = await page.locator('#tab-id').inputValue();
  await page.locator('#tabUp').click();
  await expect(tabs(page).nth(3)).toHaveAttribute('data-tab', copyId);
  await page.locator('#tabRemove').click();
  await expect(tabs(page)).toHaveCount(4);
  await select(page, 'root');
  await section(page, 'groups');
  await page.locator('#navbar-group-name').fill('Secondarie');
  await page.getByRole('button', { name: 'Aggiungi gruppo', exact: true }).click();
  await select(page, 'tab');
  await page.locator('#tab-group').selectOption({ label: 'Secondarie' });
  await expect(tabs(page).last()).toHaveAttribute('data-group', 'group');
  await expect(page.locator('#tabUp')).toBeDisabled();
  await expect(page.locator('#tabDown')).toBeDisabled();
  await page.locator('#tab-visible').uncheck();
  await expect(tabs(page)).toHaveCount(3);
  await page.locator('#tab-visible').check();
  await expect(tabs(page)).toHaveCount(4);
  await section(page, 'states');
  await page.locator('#tab-action-kind').selectOption('consumer');
  await page.locator('#tab-action-destination').fill('open-settings');
  await page.locator('#tab-action-apply').click();
  await expect.poll(() => lab(page, 'return h.builder.doc.content.tab.action')).toEqual({ kind: 'consumer', name: 'open-settings' });
  await select(page, 'root');
  await section(page, 'responsive');
  await page.locator('#bpAdd').click();
  await page.locator('#bp-bp-480-layout-compact-on').check();
  await page.locator('#bp-bp-480-layout-compact').check();
  await lab(page, "h.setOption('device', 'phone')");
  await expect(bar(page)).toHaveAttribute('data-compact', 'true');
  const before = await lab<ComponentDefinition>(page, 'return h.builder.doc');
  await page.locator('#bl-material-solid').click();
  await expect(bar(page)).toHaveAttribute('data-material', 'solid');
  await page.locator('#bl-material-glass').click();
  await expect(bar(page)).toHaveAttribute('data-material', 'glass');
  const after = await lab<ComponentDefinition>(page, 'return h.builder.doc');
  for (const key of ['structure', 'content', 'layout', 'responsive', 'interactions'] as const) expect(after[key]).toEqual(before[key]);
  await page.locator('#cmpSave').click();
  await expect(page.locator('#cmpOrigin')).toContainText('salvata');
  await lab(page, 'await h.flush()');
  const saved = await lab<{ id: string; json: string }>(page, 'return { id: h.builder.state.componentId, json: h.builder.json() }');
  await page.goto(`./?workspace=builder&component=${saved.id}&scene=app&animate=0`);
  await page.waitForSelector('html[data-ready=true]');
  await expect(tabs(page)).toHaveText(['Home', 'Explore', 'Profile', 'Nuova']);
  expect(await lab(page, 'return h.builder.json()')).toBe(saved.json);
  for (const id of ['component-react', 'component-vanilla']) {
    const [download] = await Promise.all([page.waitForEvent('download'), lab(page, `return h.builder.exportWith('${id}')`)]);
    const entries = unzip(new Uint8Array(readFileSync((await download.path())!)));
    const config = new TextDecoder().decode(entries.find((entry) => entry.path.endsWith('/component.json'))!.data).trim();
    expect(config).toBe(saved.json);
    expect(entries.some((entry) => entry.path.endsWith('/runtime/jello.js'))).toBe(true);
  }
});

type RuntimeState = { nav: BottomNavigation; actions: string[]; changes: string[]; events: string[] };
for (const family of ['glass', 'solid']) test(`${family}: runtime links, consumer callbacks, focus, hidden/disabled and live updates`, async ({ page }) => {
  // Standalone host: the Studio's URL synchronizer must not overwrite native anchor navigation.
  await page.route('**/m51-runtime.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>Navbar runtime</title></head><body></body></html>' }));
  await page.goto('./m51-runtime.html');
  await page.addStyleTag({ url: '/runtime/jello.css' });
  const config = switchMaterialFamily(componentTemplate('mobile-navbar')!.create(), family).definition;
  config.content.home = { action: { kind: 'select' }, value: 'same' };
  config.content.explore = { action: { kind: 'navigate', href: '#m51-destination' }, value: 'same', accessibleLabel: 'Documentazione', iconPosition: 'end' };
  config.content.profile = { action: { kind: 'consumer', name: 'open-profile' }, value: 'same' };
  config.interactions.events.action = 'navigation-action';
  await page.evaluate(async (config) => {
    const path = '/runtime/jello.js';
    const rt = await import(path) as typeof import('../../src/runtime/index');
    const slot = document.createElement('div'); slot.id = 'm51';
    Object.assign(slot.style, { position: 'fixed', inset: '0', zIndex: '9999', background: 'white' });
    document.body.append(slot);
    const destination = document.createElement('div'); destination.id = 'm51-destination'; slot.append(destination);
    const state = { actions: [] as string[], changes: [] as string[], events: [] as string[] };
    const nav = rt.createBottomNavigation({ container: slot, config, anchor: 'container',
      onAction: (id, e) => state.actions.push(`${id}:${e.action.kind}`), onChange: (id) => state.changes.push(id),
    });
    nav.host.addEventListener('navigation-action', (e) => state.events.push((e as CustomEvent).detail.action.kind));
    (window as unknown as { m51: RuntimeState }).m51 = { ...state, nav };
  }, config);
  const root = page.locator('#m51 nav');
  const link = root.getByRole('link', { name: 'Documentazione' });
  await expect(link).toHaveAttribute('href', '#m51-destination');
  await expect(link).toHaveAttribute('data-icon-position', 'end');
  await link.click();
  await expect(page).toHaveURL(/#m51-destination$/);
  await expect(root.locator('[data-tab=home]')).toHaveAttribute('aria-current', 'page');
  await root.locator('[data-tab=profile]').click();
  expect(await page.evaluate(() => { const s = (window as unknown as { m51: RuntimeState }).m51; return { actions: s.actions, changes: s.changes, events: s.events }; })).toEqual({ actions: ['explore:navigate', 'profile:consumer'], changes: [], events: ['navigate', 'consumer'] });
  await page.evaluate(() => (window as unknown as { m51: RuntimeState }).m51.nav.setActiveTab('explore'));
  await expect(link).toHaveAttribute('aria-current', 'page');
  await page.evaluate(async () => {
    const path = '/runtime/jello.js'; const rt = await import(path) as typeof import('../../src/runtime/index');
    const { nav } = (window as unknown as { m51: RuntimeState }).m51;
    let next = rt.setNavbarItemDisabled(nav.component, 'explore', true);
    next = rt.setNavbarItemVisibility(next, 'profile', false);
    nav.update(next);
  });
  await expect(root.locator('.jello-bnav-tab')).toHaveCount(2);
  await expect(root.locator('[data-tab=explore]')).not.toHaveAttribute('href');
  await expect(root.locator('[data-tab=home]')).toHaveAttribute('aria-current', 'page');
  await root.locator('[data-tab=home]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(root.locator('[data-tab=home]')).toBeFocused();
  await page.evaluate(async () => {
    const path = '/runtime/jello.js'; const rt = await import(path) as typeof import('../../src/runtime/index');
    const { nav } = (window as unknown as { m51: RuntimeState }).m51;
    let next = rt.setNavbarItemAction(nav.component, 'explore', { kind: 'navigate', href: 'https://example.com/docs', target: '_blank' });
    next = rt.setNavbarItemDisabled(next, 'explore', false);
    nav.update(next);
  });
  await expect(root.locator('[data-tab=explore]')).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(root.locator('[data-tab=explore]')).toHaveAttribute('target', '_blank');
  const rejected = await page.evaluate(async () => {
    const path = '/runtime/jello.js'; const rt = await import(path) as typeof import('../../src/runtime/index');
    const { nav } = (window as unknown as { m51: RuntimeState }).m51;
    const bad = { ...nav.component, content: { ...nav.component.content, explore: { action: { kind: 'navigate', href: 'javascript:alert(1)' } } } } as ComponentDefinition;
    const before = document.querySelectorAll('#m51 nav').length;
    const results = [];
    try { nav.update(bad); results.push(false); } catch { results.push(true); }
    try { rt.createBottomNavigation({ container: document.getElementById('m51')!, config: bad }); results.push(false); } catch { results.push(true); }
    return { results, before, after: document.querySelectorAll('#m51 nav').length };
  });
  expect(rejected).toEqual({ results: [true, true], before: 1, after: 1 });
  await expect(root.locator('[data-tab=explore]')).toHaveAttribute('href', 'https://example.com/docs');
  await page.evaluate(() => (window as unknown as { m51: RuntimeState }).m51.nav.destroy());
  await expect(root).toHaveCount(0);
});
