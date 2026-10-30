/**
 * Component Engine in the browser (M2): the Button and the Mobile Navbar with
 * Glass and Solid, driven the way a person drives the builder.
 *
 *   - rendering of both materials, and switching between them without losing
 *     content, structure, layout, states or interactions;
 *   - semantic elements (button / link), disabled, hover, pressed, focus, ghost;
 *   - keyboard and accessible names;
 *   - responsive breakpoints against the container width;
 *   - the shared inspector (same panel for Glass and Solid) and the report of
 *     properties a material cannot render;
 *   - the mobile navbar on Solid: tabs, active, disabled, keyboard, responsive.
 *
 * Waits are on conditions (auto-retrying expectations, polls), never on time.
 */
import { expect, test, type Page } from '@playwright/test';
import { addBreakpoint, addButtonBreakpoint, applyNavbarView, componentTemplate, navbarView, serializeDefinition, setButtonField, switchMaterialFamily, updateBreakpoint, updateButtonBreakpoint } from '../../src/components';
import { lab, openLab } from './helpers';

const BUTTON = 'workspace=builder&component=button&scene=app&animate=0';
const NAVBAR = 'workspace=builder&component=mobile-navbar&scene=app&animate=0';
const btn = (page: Page) => page.locator('#stageMain .jello-btn');
const bar = (page: Page) => page.locator('#stageMain nav.jello-bnav:not(.navbar)');
const tabs = (page: Page) => bar(page).locator('.jello-bnav-tab');

async function controls(page: Page) {
  const toggle = page.locator('#panelToggle');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  const advanced = page.getByRole('button', { name: 'Avanzato', exact: true });
  if (await advanced.isVisible()) await advanced.click();
}
async function openSection(page: Page, id: string) {
  await page.evaluate((s) => document.querySelectorAll<HTMLDetailsElement>(`[data-section="${s}"]`).forEach((d) => (d.open = true)), id);
}
const family = (page: Page) => lab<string>(page, 'return h.builder.doc.material.family');
async function useFamily(page: Page, f: 'glass' | 'solid') {
  await lab(page, `h.builder.setFamily('${f}')`);
  await expect.poll(() => family(page)).toBe(f);
}
/** Waits until the preview shows the family (surface layer of that family, none of the other). */
async function shows(page: Page, f: 'glass' | 'solid', host: 'btn' | 'bar' = 'btn') {
  const root = host === 'btn' ? btn(page) : bar(page);
  await expect(root).toHaveAttribute('data-material', f);
  await expect(root.locator(f === 'glass' ? '> .jello-surface' : '> .jello-solid')).toHaveCount(1);
  await expect(root.locator(f === 'glass' ? '> .jello-solid' : '> .jello-surface')).toHaveCount(0);
}
/** What a person sees of the button, as values the browser computed. */
const look = (page: Page) =>
  btn(page).evaluate((el) => {
    const cs = getComputedStyle(el);
    const label = el.querySelector('.jello-btn-label')!;
    const icon = el.querySelector('.jello-btn-icon');
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      text: label.textContent,
      icon: icon ? (icon.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING ? 'start' : 'end') : 'none',
      minHeight: cs.minHeight,
      paddingX: cs.paddingLeft,
      paddingY: cs.paddingTop,
      radius: cs.borderTopLeftRadius,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      gap: cs.columnGap,
      justify: cs.justifyContent,
      width: Math.round(r.width),
      height: Math.round(r.height),
      disabled: el.hasAttribute('data-disabled'),
      variant: el.getAttribute('data-variant'),
    };
  });

test.describe('button', () => {
  test.beforeEach(async ({ page }) => {
    await openLab(page, BUTTON);
    await controls(page);
  });

  test('renders on Glass and on Solid: one surface of the family, the same content, nothing of the other', async ({ page }) => {
    await expect(btn(page)).toBeVisible();
    await shows(page, 'glass');
    await expect(btn(page).locator('.jello-btn-label')).toHaveText('Inizia');
    await expect(btn(page).locator('svg.jello-btn-icon')).toHaveAttribute('aria-hidden', 'true');
    expect(await btn(page).evaluate((el) => el.tagName)).toBe('BUTTON');
    await useFamily(page, 'solid');
    await shows(page, 'solid');
    await expect(btn(page).locator('.jello-btn-label')).toHaveText('Inizia');
    await expect(btn(page).locator('svg.jello-btn-icon')).toHaveCount(1);
    // Solid is not Glass without refraction: no filter, no backdrop, nothing left on the host from the lens.
    const layer = btn(page).locator('> .jello-solid');
    expect(await layer.evaluate((el) => [getComputedStyle(el).filter, getComputedStyle(el).backdropFilter])).toEqual(['none', 'none']);
    expect(await btn(page).evaluate((el) => [el.hasAttribute('data-jello-path'), el.classList.contains('jello-host'), el.style.getPropertyValue('--jello-host-radius')])).toEqual([false, false, '']);
    expect(await layer.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(37, 99, 235)');
    // And back: Glass again, with its lens, and no layer of Solid.
    await useFamily(page, 'glass');
    await shows(page, 'glass');
    await expect(btn(page).locator('> .jello-surface')).toHaveCount(1);
    expect(await lab<number>(page, 'return h.stats().surfaces')).toBe(1);
  });

  test('changing the material keeps content, structure, layout, states and interactions', async ({ page }) => {
    // Edit through the inspector, as a person would.
    await page.locator('#btn-text').fill('Conferma ordine');
    await openSection(page, 'b-layout');
    await page.locator('#bf-layout-size').selectOption('lg');
    await page.locator('#bf-layout-radius').selectOption('px');
    await page.locator('#bf-layout-radius-px-num').fill('10');
    await page.locator('#bf-layout-iconPosition').selectOption('end');
    await page.locator('#bf-layout-widthMode').selectOption('fixed');
    await page.locator('#bf-layout-width-num').fill('260');
    await page.locator('#bf-layout-align').selectOption('start');
    await openSection(page, 'b-appearance');
    await page.locator('#bf-style-variant').selectOption('secondary');
    await page.locator('#btn-disabled').check();
    await expect(btn(page).locator('.jello-btn-label')).toHaveText('Conferma ordine');
    await expect.poll(() => look(page).then((l) => l.minHeight)).toBe('52px');
    const glass = await look(page);
    expect(glass).toMatchObject({ icon: 'end', radius: '10px', width: 260, justify: 'flex-start', disabled: true, variant: 'secondary', tag: 'BUTTON' });
    const docGlass = JSON.parse(await lab<string>(page, 'return h.builder.json()'));

    await useFamily(page, 'solid');
    await shows(page, 'solid');
    expect(await look(page)).toEqual(glass);
    const docSolid = JSON.parse(await lab<string>(page, 'return h.builder.json()'));
    for (const key of ['structure', 'content', 'layout', 'responsive', 'style', 'interactions', 'name']) expect(docSolid[key], key).toEqual(docGlass[key]);
    expect(docSolid.states.hover.style).toEqual(docGlass.states.hover.style);
    expect(docSolid.material.family).toBe('solid');

    await useFamily(page, 'glass');
    await shows(page, 'glass');
    expect(await look(page)).toEqual(glass);
    // The panel follows: the same family selector, whichever family is in use.
    await expect(page.locator('#cmpFamily')).toHaveValue('glass');
  });

  test('the element follows the semantics: an action is a button, a link is an a with its address and never navigates in the editor', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as unknown as { __presses: unknown[] };
      w.__presses = [];
      document.addEventListener('jello-press', (e) => w.__presses.push((e as CustomEvent).detail));
    });
    // The lab rewrites its own query string as the state changes; what must not happen is leaving the page.
    await page.evaluate(() => ((window as unknown as { __stays: boolean }).__stays = true));
    const path = new URL(page.url()).pathname;
    await page.locator('#btn-semantics').selectOption('link');
    await expect(btn(page)).toHaveJSProperty('tagName', 'A');
    await expect(btn(page)).toHaveAttribute('href', '/');
    await page.locator('#btn-href').fill('/prezzi');
    await expect(btn(page)).toHaveAttribute('href', '/prezzi');
    await shows(page, 'glass');
    await btn(page).click();
    // The press is reported, with the destination; the editor stays where it is.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __presses: unknown[] }).__presses.length)).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { __presses: unknown[] }).__presses[0])).toMatchObject({ href: '/prezzi', trigger: 'pointer' });
    expect(await page.evaluate(() => (window as unknown as { __stays?: boolean }).__stays)).toBe(true);
    expect(new URL(page.url()).pathname).toBe(path);
    // Disabled link: no href, still a link for assistive technology, cannot be focused or followed.
    await page.locator('#btn-disabled').check();
    await expect(btn(page)).not.toHaveAttribute('href', /.*/);
    await expect(btn(page)).toHaveAttribute('role', 'link');
    await expect(btn(page)).toHaveAttribute('aria-disabled', 'true');
    await expect(btn(page)).toHaveAttribute('tabindex', '-1');
    await btn(page).click({ force: true });
    expect(await page.evaluate(() => (window as unknown as { __presses: unknown[] }).__presses.length)).toBe(1);
    // Back to an action: a real disabled button.
    await page.locator('#btn-semantics').selectOption('action');
    await expect(btn(page)).toHaveJSProperty('tagName', 'BUTTON');
    await expect(btn(page)).toBeDisabled();
    await expect(btn(page)).not.toHaveAttribute('href', /.*/);
    await page.locator('#btn-disabled').uncheck();
    await expect(btn(page)).toBeEnabled();
  });

  for (const f of ['glass', 'solid'] as const) {
    test(`states and accessibility on ${f}: keyboard, focus ring, hover, pressed, disabled`, async ({ page }) => {
      if (f === 'solid') await useFamily(page, 'solid');
      await shows(page, f);
      await page.evaluate(() => {
        const w = window as unknown as { __presses: string[] };
        w.__presses = [];
        document.addEventListener('jello-press', (e) => w.__presses.push((e as CustomEvent).detail.trigger));
      });
      const presses = () => page.evaluate(() => (window as unknown as { __presses: string[] }).__presses);
      // Named by its text, icon decorative.
      await expect(page.locator('#stageMain').getByRole('button', { name: 'Inizia' })).toBeVisible();

      // Keyboard: reachable with Tab, a visible ring from the definition, Enter and Space activate.
      // Land on it the way a keyboard does (focus-visible follows the last input): step back, then Tab to it.
      await btn(page).focus();
      await page.keyboard.press('Shift+Tab');
      for (let i = 0; i < 3 && !(await btn(page).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
      await expect(btn(page)).toBeFocused();
      const ring = await btn(page).evaluate((el) => {
        const cs = getComputedStyle(el);
        return [cs.outlineStyle, cs.outlineWidth, cs.outlineColor, cs.outlineOffset, el.matches(':focus-visible')];
      });
      expect(ring).toEqual(['solid', '2px', 'rgb(122, 47, 184)', '2px', true]);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');
      await expect.poll(presses).toEqual(['keyboard', 'keyboard']);

      // Hover and press are the material's state on Solid, the component's veil (and the surface's press) on Glass.
      await btn(page).hover();
      if (f === 'solid') await expect(btn(page)).toHaveAttribute('data-jello-state', 'hover');
      await expect(btn(page)).toHaveAttribute('data-hover', '');
      const box = (await btn(page).boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await expect(btn(page)).toHaveAttribute('data-pressed', '');
      if (f === 'solid') await expect(btn(page)).toHaveAttribute('data-jello-state', 'pressed');
      await page.mouse.up();
      await expect(btn(page)).not.toHaveAttribute('data-pressed', '');
      await expect.poll(presses).toEqual(['keyboard', 'keyboard', 'pointer']);
      await page.mouse.move(2, 2);
      await expect(btn(page)).not.toHaveAttribute('data-hover', '');

      // The editor's «anteprima stato» shows the state without input.
      await openSection(page, 'b-states');
      await page.locator('#btn-preview-state').selectOption('hover');
      await expect(btn(page)).toHaveAttribute('data-preview-state', 'hover');
      await expect(btn(page)).toHaveAttribute('data-hover', '');
      await page.locator('#btn-preview-state').selectOption('focus');
      expect(await btn(page).evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
      await page.locator('#btn-preview-state').selectOption('');
      await expect(btn(page)).not.toHaveAttribute('data-preview-state', /.*/);

      // Disabled: not focusable, no activation, the family's disabled look.
      await page.locator('#btn-disabled').check();
      await expect(btn(page)).toBeDisabled();
      await btn(page).click({ force: true });
      expect((await presses()).length).toBe(3);
      // The opacity transitions: wait for the value it settles on.
      await expect.poll(() => btn(page).evaluate((el) => getComputedStyle(el).opacity)).toBe(f === 'glass' ? '0.4' : '0.45');
      if (f === 'solid') await expect(btn(page)).toHaveAttribute('data-jello-state', 'disabled');
    });
  }

  test('ghost shows its surface only with interaction, on both materials', async ({ page }) => {
    await openSection(page, 'b-appearance');
    await page.locator('#bf-style-variant').selectOption('ghost');
    for (const f of ['glass', 'solid'] as const) {
      await useFamily(page, f);
      await shows(page, f);
      const layer = btn(page).locator(f === 'glass' ? '> .jello-surface' : '> .jello-solid');
      await expect(btn(page)).toHaveAttribute('data-surface', 'rest');
      await expect.poll(() => layer.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
      // At rest the content reads on the page: the component's ghost color.
      expect(await btn(page).evaluate((el) => getComputedStyle(el).color)).toBe('rgb(12, 12, 16)');
      await btn(page).hover();
      await expect(btn(page)).toHaveAttribute('data-surface', 'shown');
      await expect.poll(() => layer.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
      await page.mouse.move(2, 2);
      await expect(btn(page)).toHaveAttribute('data-surface', 'rest');
    }
  });

  test('primary asks the material for its accent; the component’s own edits stay on top of it', async ({ page }) => {
    await expect(btn(page)).toHaveAttribute('data-variant', 'primary');
    const tint = () => lab<string>(page, 'return h.builder.material().material.tint');
    expect(await tint()).toBe('#1d4ed8');
    await openSection(page, 'b-appearance');
    await page.locator('#bf-style-variant').selectOption('secondary');
    await expect.poll(tint).toBe('#ffffff');
    await page.locator('#bf-style-variant').selectOption('primary');
    await expect.poll(tint).toBe('#1d4ed8');
    // A value edited in the material panel is the component's and survives the variant.
    await lab(page, `h.builder.setControl('tintOpacity', 0.5)`);
    await expect.poll(() => lab<number>(page, 'return h.builder.material().material.tintOpacity')).toBe(0.5);
    expect(await tint()).toBe('#1d4ed8');
    await useFamily(page, 'solid');
    await shows(page, 'solid');
    await expect.poll(() => btn(page).locator('> .jello-solid').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(37, 99, 235)');
    await openSection(page, 'b-material');
    await expect(page.locator('#cmpAccentNote')).toBeVisible();
  });

  test('responsive: breakpoints follow the width of the container, whatever the viewport', async ({ page }) => {
    const slotWidth = () => page.locator('#stageMain .component-slot').evaluate((el) => el.clientWidth);
    const definition = (name: string, maxWidth: number) => {
      let d = componentTemplate('button')!.create();
      d = addButtonBreakpoint(d, maxWidth).def;
      const id = `bp-${maxWidth}`;
      d = updateButtonBreakpoint(d, id, { set: ['layout.size', 'sm'] });
      d = updateButtonBreakpoint(d, id, { set: ['layout.widthMode', 'fill'] });
      d = updateButtonBreakpoint(d, id, { set: ['style.typography.fontSize', 18] });
      return { ...d, name };
    };
    const load = async (d: ReturnType<typeof definition>) => {
      expect(await lab(page, `return h.builder.importComponent(${JSON.stringify(serializeDefinition(d))})`)).toBe(true);
      await expect.poll(() => lab(page, 'return h.builder.doc.name')).toBe(d.name);
    };
    await lab(page, `h.setOption('device', 'desktop')`);
    const w = await slotWidth();
    expect(w).toBeGreaterThan(300);

    // A threshold above the container: it applies. The button fills the container and takes the overrides.
    await load(definition('Applies', Math.min(2000, w + 40)));
    await expect(btn(page)).toHaveAttribute('data-breakpoint', `bp-${Math.min(2000, w + 40)}`);
    await expect(btn(page)).toHaveAttribute('data-width', 'fill');
    await expect.poll(() => look(page).then((l) => l.minHeight)).toBe('36px');
    const applied = await look(page);
    expect(applied.fontSize).toBe('18px');
    expect(applied.width).toBeGreaterThan(w - 60);
    expect(applied.width).toBeLessThanOrEqual(w);

    // A threshold below it: it does not.
    await load(definition('Does not apply', Math.max(100, w - 40)));
    await expect(btn(page)).not.toHaveAttribute('data-breakpoint', /.*/);
    await expect(btn(page)).toHaveAttribute('data-width', 'hug');
    expect(await look(page)).toMatchObject({ minHeight: '44px', fontSize: '15px' });

    // Where the preview formats differ (a wide window), the format decides.
    await lab(page, `h.setOption('device', 'phone')`);
    const phone = await slotWidth();
    if (phone < w - 20) {
      await load(definition('Formats', Math.min(2000, phone + 40)));
      await lab(page, `h.setOption('device', 'phone')`);
      await expect(btn(page)).toHaveAttribute('data-breakpoint', `bp-${Math.min(2000, phone + 40)}`);
      await lab(page, `h.setOption('device', 'desktop')`);
      await expect(btn(page)).not.toHaveAttribute('data-breakpoint', /.*/);
    }
  });

  test('the inspector is one panel for every family, built from the registry; what a family cannot render is said', async ({ page }) => {
    await openSection(page, 'b-material');
    await openSection(page, 'b-states');
    const panel = page.locator('#cmpMaterialPanel');
    await expect(panel).toHaveAttribute('data-family', 'glass');
    // Glass: the controls of its descriptors; the group of the lens shape belongs to the layout, not to the material.
    await expect(panel.locator('#param-blur')).toBeAttached();
    await expect(panel.locator('#param-tint')).toBeAttached();
    await expect(panel.locator('#param-pressScale')).toBeAttached();
    await expect(panel.locator('#param-width')).toHaveCount(0);
    await expect(panel.locator('#param-fill')).toHaveCount(0);
    await expect(page.locator('#cmpUnsupportedList')).toContainText('Ogni proprietà descritta ha effetto con Glass');
    await expect(page.locator('[data-unsupported]')).toHaveCount(0);

    await page.locator('#cmpFamily').selectOption('solid');
    await expect(panel).toHaveAttribute('data-family', 'solid');
    await expect(panel.locator('#param-fill')).toBeAttached();
    await expect(panel.locator('#param-elevation')).toBeAttached();
    await expect(panel.locator('#param-hover-fill')).toBeAttached(); // per-state override, same control, own id
    await expect(panel.locator('#param-pressed-scale')).toBeAttached();
    await expect(panel.locator('#param-blur')).toHaveCount(0);
    await expect(panel.locator('#param-radius')).toHaveCount(0);
    // The unsupported ones are listed in the material panel and noted at the property, each with its reason.
    const listed = await page.locator('#cmpUnsupportedList [data-unsupported]').evaluateAll((els) => els.map((e) => e.getAttribute('data-unsupported')));
    expect(listed).toEqual(['style.colors.primary', 'style.colors.secondary', 'states.hover.style.background', 'states.pressed.style.background', 'states.disabled.style.opacity']);
    await expect(page.locator('p[data-unsupported="states.hover.style.background"]')).toContainText('Solid rende da sé lo stato hover');
    await expect(page.locator('p[data-unsupported="style.colors.primary"]')).toBeAttached();

    // Editing a Solid control goes through the same path as Glass's, validated, and reaches the surface.
    await page.locator('#num-elevation').fill('4');
    await expect.poll(() => lab<number>(page, 'return h.builder.material().material.elevation')).toBe(4);
    await expect(page.locator('#cmpMaterialNote')).toHaveAttribute('data-link', 'modified');
    await page.locator('#num-hover-elevation').fill('5');
    await expect.poll(() => lab<number>(page, 'return h.builder.material().states.hover.elevation')).toBe(5);
    // An invalid value is refused and never applied.
    await page.locator('#num-borderWidth').fill('99');
    await expect(page.locator('#err-borderWidth')).toBeVisible();
    expect(await lab<number>(page, 'return h.builder.material().material.borderWidth')).toBe(1);
    // The overrides are the component's: «Ripristina» gives the preset back.
    await page.locator('#cmpResetMaterial').click();
    await expect.poll(() => lab<number>(page, 'return h.builder.material().material.elevation')).toBe(1);
    await expect(page.locator('#cmpMaterialNote')).toHaveAttribute('data-link', 'linked');
  });
});

test.describe('mobile navbar on Solid', () => {
  test.beforeEach(async ({ page }) => {
    await openLab(page, NAVBAR);
    await controls(page);
    await page.locator('#bl-material-solid').click();
    await expect.poll(() => family(page)).toBe('solid');
    await shows(page, 'solid', 'bar');
  });

  test('draws a Solid surface behind the same tabs, with the material’s content color and a visible active indicator', async ({ page }) => {
    await expect(tabs(page)).toHaveText(['Home', 'Explore', 'Profile']);
    await expect(bar(page).locator('> .jello-solid')).toHaveCount(1);
    expect(await bar(page).locator('> .jello-solid').evaluate((el) => [getComputedStyle(el).filter, getComputedStyle(el).backdropFilter, getComputedStyle(el).backgroundColor])).toEqual(['none', 'none', 'rgb(241, 243, 245)']);
    // Content color: Solid's (#111827), not the Glass one; the active tab keeps its own color.
    const color = (i: number) => tabs(page).nth(i).evaluate((el) => getComputedStyle(el).color);
    await expect.poll(() => color(1)).toBe('rgb(17, 24, 39)');
    await expect.poll(() => color(0)).toBe('rgb(10, 84, 189)');
    // The indicator is tinted with the active color: visible on a light fill.
    const indicator = await bar(page).locator('.jello-bnav-indicator').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(indicator).not.toBe('rgba(0, 0, 0, 0)');
    expect(await tabs(page).first().evaluate((el) => getComputedStyle(el).textShadow)).toBe('none');
    // Same bar: a tab is 44 px at least, the bar keeps its height.
    expect(Math.round((await bar(page).boundingBox())!.height)).toBe(64);
    for (const t of await tabs(page).all()) expect((await t.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  });

  test('active state, selection and reselection report as with Glass', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as unknown as { __events: string[] };
      w.__events = [];
      for (const name of ['jello-change', 'jello-press', 'jello-reselect']) document.addEventListener(name, (e) => w.__events.push(`${name}:${(e as CustomEvent).detail.tabId}`));
    });
    await expect(tabs(page).nth(0)).toHaveAttribute('aria-current', 'page');
    await tabs(page).nth(1).click();
    await expect(tabs(page).nth(1)).toHaveAttribute('aria-current', 'page');
    await expect(tabs(page).nth(0)).not.toHaveAttribute('aria-current', /.*/);
    await tabs(page).nth(1).click();
    expect(await page.evaluate(() => (window as unknown as { __events: string[] }).__events)).toEqual(['jello-press:explore', 'jello-change:explore', 'jello-press:explore', 'jello-reselect:explore']);
    // A Solid bar does not dip under a press (reported as unsupported), the tab shows the press.
    const box = (await tabs(page).nth(2).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(tabs(page).nth(2)).toHaveAttribute('data-pressed', '');
    await expect(bar(page)).toHaveAttribute('data-jello-state', /^(default|hover)$/);
    await page.mouse.up();
  });

  test('tabs can be added and removed; the last one stays', async ({ page }) => {
    await page.locator('#tabAdd').click();
    await expect(tabs(page)).toHaveCount(4);
    await shows(page, 'solid', 'bar');
    await page.locator('#tabRemove').click();
    await expect(tabs(page)).toHaveCount(3);
    await page.locator('#structureTree [data-node="explore"]').click();
    await page.locator('#tabRemove').click();
    await page.locator('#structureTree [data-node="profile"]').click();
    await page.locator('#tabRemove').click();
    await expect(tabs(page)).toHaveCount(1);
    await expect(page.locator('#tabRemove')).toBeDisabled();
    await expect(tabs(page).first()).toHaveText('Home');
    expect(await bar(page).locator('> .jello-solid').count()).toBe(1);
  });

  test('icons and texts come from the definition; a disabled tab does not select and is dimmed', async ({ page }) => {
    await page.locator('#structureTree [data-node="explore"]').click();
    await openSection(page, 'b-structure');
    await page.locator('#tab-label').fill('Scopri');
    await expect(tabs(page).nth(1)).toHaveText('Scopri');
    await page.locator('label[for="tab-icon-star"]').click();
    await expect(tabs(page).nth(1).locator('svg.jello-bnav-icon')).toHaveCount(1);
    await openSection(page, 'b-states');
    await page.locator('#tab-disabled').check();
    await expect(tabs(page).nth(1)).toHaveAttribute('aria-disabled', 'true');
    await expect.poll(() => tabs(page).nth(1).evaluate((el) => getComputedStyle(el).opacity)).toBe('0.4');
    await tabs(page).nth(1).click({ force: true });
    await expect(tabs(page).nth(0)).toHaveAttribute('aria-current', 'page');
    // Labels hidden stay the accessible name.
    await expect(page.getByRole('link', { name: 'Scopri' })).toHaveCount(0); // tabs are buttons in a nav, not links
    await expect(bar(page).getByRole('button', { name: 'Scopri' })).toHaveCount(1);
  });

  test('keyboard: arrows, Home and End move the focus, Enter selects, the ring is visible', async ({ page }) => {
    await tabs(page).first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs(page).nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(tabs(page).nth(2)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tabs(page).nth(0)).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(tabs(page).nth(2)).toHaveAttribute('aria-current', 'page');
    const ring = await tabs(page).nth(2).evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineWidth, el.matches(':focus-visible')]);
    expect(ring).toEqual(['solid', '2px', true]);
  });

  test('responsive: a breakpoint hides the labels when the container is narrower than it, and not otherwise', async ({ page }) => {
    const overlayWidth = () => page.locator('#stageMain .overlay').evaluate((el) => el.clientWidth);
    const definition = (name: string, maxWidth: number) => {
      let d = switchMaterialFamily(componentTemplate('mobile-navbar')!.create(), 'solid').definition;
      const added = addBreakpoint(navbarView(d), maxWidth);
      d = applyNavbarView(d, updateBreakpoint(added.root, added.id, { set: ['layout.labels', 'hide'] }));
      return { ...d, name };
    };
    const load = async (d: ReturnType<typeof definition>) => {
      expect(await lab(page, `return h.builder.importComponent(${JSON.stringify(serializeDefinition(d))})`)).toBe(true);
      await expect.poll(() => lab(page, 'return h.builder.doc.name')).toBe(d.name);
      await shows(page, 'solid', 'bar');
    };
    await lab(page, `h.setOption('device', 'desktop')`);
    const w = await overlayWidth();
    expect(w).toBeGreaterThan(300);
    await load(definition('Narrower', Math.min(2000, w + 40)));
    await expect(bar(page)).toHaveAttribute('data-labels', 'hide');
    await expect(bar(page)).toHaveAttribute('data-breakpoint', `bp-${Math.min(2000, w + 40)}`);
    // The names stay accessible.
    await expect(bar(page).getByRole('button', { name: 'Explore' })).toHaveCount(1);
    await load(definition('Wider', Math.max(200, w - 40)));
    await expect(bar(page)).toHaveAttribute('data-labels', 'show');
    await expect(bar(page)).not.toHaveAttribute('data-breakpoint', /.*/);
    // Where the preview formats differ (a wide window), the format decides.
    await lab(page, `h.setOption('device', 'phone')`);
    const phone = await overlayWidth();
    if (phone < w - 20) {
      await load(definition('Formats', Math.min(2000, phone + 40)));
      await lab(page, `h.setOption('device', 'phone')`);
      await expect(bar(page)).toHaveAttribute('data-labels', 'hide');
      await lab(page, `h.setOption('device', 'desktop')`);
      await expect(bar(page)).toHaveAttribute('data-labels', 'show');
    }
  });

  test('switching the material both ways keeps the tabs, the active one and the disabled one', async ({ page }) => {
    await page.locator('#structureTree [data-node="profile"]').click();
    await openSection(page, 'b-states');
    await page.locator('#tab-disabled').check();
    await tabs(page).nth(1).click();
    const before = JSON.parse(await lab<string>(page, 'return h.builder.json()'));
    await useFamily(page, 'glass');
    await shows(page, 'glass', 'bar');
    await expect(tabs(page)).toHaveText(['Home', 'Explore', 'Profile']);
    await expect(tabs(page).nth(1)).toHaveAttribute('aria-current', 'page');
    await expect(tabs(page).nth(2)).toHaveAttribute('aria-disabled', 'true');
    const after = JSON.parse(await lab<string>(page, 'return h.builder.json()'));
    for (const key of ['structure', 'content', 'layout', 'responsive', 'style', 'interactions']) expect(after[key], key).toEqual(before[key]);
    // The bar's Solid residue is gone: no variable of the Solid group on the host.
    expect(await bar(page).evaluate((el) => [...el.style].filter((p) => p.startsWith('--jsolid-')))).toEqual([]);
    expect(await bar(page).evaluate((el) => el.classList.contains('jello-solid-host'))).toBe(false);
  });
});

test.describe('definitions in the editor: serialization and import', () => {
  test('a Solid button written by the editor imports back into the same component', async ({ page }) => {
    await openLab(page, BUTTON);
    await controls(page);
    await useFamily(page, 'solid');
    await shows(page, 'solid');
    await page.locator('#btn-text').fill('Salva e chiudi');
    await lab(page, `h.builder.setControl('elevation', 3)`);
    await expect.poll(() => lab<number>(page, 'return h.builder.material().material.elevation')).toBe(3);
    const json = await lab<string>(page, 'return h.builder.json()');
    const doc = JSON.parse(json);
    expect(doc).toMatchObject({ format: 'jello-component-definition', type: 'button', material: { family: 'solid', params: { elevation: 3 } } });
    // Open another component, import the text: it comes back as it was.
    await lab(page, `h.builder.open('mobile-navbar')`);
    await expect.poll(() => lab(page, 'return h.builder.doc.type')).toBe('mobile-navbar');
    await shows(page, 'glass', 'bar');
    expect(await lab(page, `return h.builder.importComponent(${JSON.stringify(json)})`)).toBe(true);
    await expect.poll(() => lab(page, 'return h.builder.doc.type')).toBe('button');
    await shows(page, 'solid');
    await expect(btn(page).locator('.jello-btn-label')).toHaveText('Salva e chiudi');
    expect(await lab<number>(page, 'return h.builder.material().material.elevation')).toBe(3);
    const again = JSON.parse(await lab<string>(page, 'return h.builder.json()'));
    for (const key of ['structure', 'content', 'layout', 'style', 'material', 'states', 'interactions']) expect(again[key], key).toEqual(doc[key]);
  });

  test('a definition with a property the renderer cannot honour is imported with a visible notice, not silently', async ({ page }) => {
    await openLab(page, BUTTON);
    await controls(page);
    const d = JSON.parse(serializeDefinition(setButtonField(componentTemplate('button')!.create(), 'layout.size', 'lg')!));
    d.layout.glow = 4;
    d.style.shadowless = true;
    d.id = 'cmp-with-extras';
    expect(await lab(page, `return h.builder.importComponent(${JSON.stringify(JSON.stringify(d))})`)).toBe(true);
    await expect(page.locator('#builderMessages').first()).toContainText('layout.glow: proprietà sconosciuta, ignorata');
    await expect(page.locator('#builderMessages').first()).toContainText('style.shadowless: proprietà sconosciuta, ignorata');
    // And the renderer applied what it understands.
    await expect.poll(() => look(page).then((l) => l.minHeight)).toBe('52px');
  });

  test('definitions of a type that has no implementation are refused to render, never shown as working', async ({ page }) => {
    await openLab(page, BUTTON);
    await controls(page);
    await expect(page.locator('[data-planned]')).toHaveText([/Desktop Navbar/, /Input/]);
    for (const id of ['desktop-navbar', 'input']) await expect(page.locator(`[data-template="${id}"]`)).toHaveCount(0);
  });
});
