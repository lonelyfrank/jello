/**
 * Solid in the browser, through the built runtime package the consumer
 * example loads (never the lab sources): no filters, five states, light
 * transitions, reduced motion, lifecycle.
 */
import { expect, test, type Page } from '@playwright/test';

const EXAMPLE = 'http://127.0.0.1:4175/';

const rgb = (hex: string, alpha?: number) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return alpha === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

async function open(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(EXAMPLE);
  await page.waitForSelector('html[data-ready=true]');
  const filters = await page.locator('svg filter').count();
  // A Solid host of its own, away from the example's Glass navbar.
  await page.evaluate(async () => {
    const rt = await import(new URL('./jello/runtime/jello.js', location.href).href);
    const host = document.createElement('button');
    host.id = 'solid-host';
    host.type = 'button';
    host.textContent = 'Salva';
    host.style.cssText = 'position:fixed;left:24px;top:24px;width:160px;height:48px;border:0;padding:0;font:600 15px system-ui;cursor:pointer';
    document.body.append(host);
    const group = rt.createMaterialGroup({ material: rt.SOLID_PRESETS[0].doc });
    (window as unknown as Record<string, unknown>).__solid = { rt, host, group, surface: group.attach(host, { interaction: 'none' }) };
  });
  return { errors, filters };
}

const solid = <T>(page: Page, body: string) => page.evaluate(`(() => { const s = window.__solid; ${body} })()`) as Promise<T>;
const layerStyle = (page: Page, prop: string) => page.locator('#solid-host > .jello-solid').evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
const hostStyle = (page: Page, prop: string) => page.locator('#solid-host').evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test('draws a plain surface: fill, border, shadow, radius — no filter, no extra SVG, aria-hidden layer', async ({ page }) => {
  const { errors, filters } = await open(page);
  expect(errors).toEqual([]);
  // Whatever filters the page's Glass navbar owns, Solid adds none.
  expect(await page.locator('svg filter').count()).toBe(filters);
  const layer = page.locator('#solid-host > .jello-solid');
  await expect(layer).toHaveCount(1);
  await expect(layer).toHaveAttribute('aria-hidden', 'true');
  expect(await layerStyle(page, 'background-color')).toBe(rgb('#f1f3f5'));
  expect(await layerStyle(page, 'border-top-width')).toBe('1px');
  expect(await layerStyle(page, 'border-top-color')).toBe(rgb('#d0d5dd'));
  expect(await layerStyle(page, 'box-shadow')).not.toBe('none');
  expect(await layerStyle(page, 'border-top-left-radius')).toBe('12px');
  expect(await layerStyle(page, 'filter')).toBe('none');
  expect(await layerStyle(page, 'backdrop-filter')).toBe('none');
  expect(await hostStyle(page, 'color')).toBe(rgb('#111827'));
  await expect(page.locator('#solid-host')).toHaveAttribute('data-jello-state', 'default');
  // The layer sits behind the foreground and takes no pointer events.
  expect(await layerStyle(page, 'pointer-events')).toBe('none');
  expect(await layerStyle(page, 'position')).toBe('absolute');
});

test('the five states change fill, content color, elevation, scale and opacity', async ({ page }) => {
  await open(page);
  const host = page.locator('#solid-host');
  const bg = () => layerStyle(page, 'background-color');

  await solid(page, 's.surface.setHovered(true)');
  await expect(host).toHaveAttribute('data-jello-state', 'hover');
  await expect.poll(bg).toBe(rgb('#e7eaee'));

  await solid(page, 's.surface.setPressed(true)');
  await expect(host).toHaveAttribute('data-jello-state', 'pressed');
  await expect.poll(bg).toBe(rgb('#dce0e5'));
  // Scale applies to the surface only; the text is not scaled.
  await expect.poll(() => layerStyle(page, 'transform')).toBe('matrix(0.98, 0, 0, 0.98, 0, 0)');
  expect(await host.evaluate((el) => getComputedStyle(el).transform)).toBe('none');

  await solid(page, 's.surface.setPressed(false); s.surface.setHovered(false); s.surface.setActive(true)');
  await expect(host).toHaveAttribute('data-jello-state', 'active');
  await expect.poll(bg).toBe(rgb('#111827'));
  await expect.poll(() => hostStyle(page, 'color')).toBe(rgb('#ffffff'));

  await solid(page, 's.surface.setDisabled(true)');
  await expect(host).toHaveAttribute('data-jello-state', 'disabled');
  await expect.poll(() => hostStyle(page, 'opacity')).toBe('0.45');
  // Disabled ignores a press.
  await solid(page, 's.surface.setPressed(true)');
  await expect(host).toHaveAttribute('data-jello-state', 'disabled');
  expect(await layerStyle(page, 'transform')).toBe('matrix(1, 0, 0, 1, 0, 0)');

  await solid(page, 's.surface.setPressed(false); s.surface.setDisabled(false); s.surface.setActive(false)');
  await expect(host).toHaveAttribute('data-jello-state', 'default');
  await expect.poll(bg).toBe(rgb('#f1f3f5'));
  await expect.poll(() => hostStyle(page, 'opacity')).toBe('1');
});

test('transitions are CSS, short, and touch only color, border, shadow, opacity and transform', async ({ page }) => {
  await open(page);
  expect(await layerStyle(page, 'transition-duration')).toBe('0.14s');
  const props = (await layerStyle(page, 'transition-property')).split(',').map((p) => p.trim());
  expect(props.sort()).toEqual(['background-color', 'border-color', 'box-shadow', 'transform']);
  expect((await hostStyle(page, 'transition-property')).split(',').map((p) => p.trim()).sort()).toEqual(['color', 'opacity']);
  // No layout property is ever transitioned or written.
  for (const bad of ['width', 'height', 'margin', 'top', 'left', 'padding', 'all']) expect(props).not.toContain(bad);
  // It really interpolates: shortly after a change the fill is neither the old nor the new color.
  await solid(page, `s.group.setMaterial(s.rt.createSolidDocument({ id: 'slow', name: 'Slow', params: { duration: 600 } })); s.surface.setHovered(true)`);
  await page.waitForTimeout(120);
  const mid = await layerStyle(page, 'background-color');
  expect([rgb('#f1f3f5'), rgb('#e7eaee')]).not.toContain(mid);
  await expect.poll(() => layerStyle(page, 'background-color'), { timeout: 3000 }).toBe(rgb('#e7eaee'));
});

test('reduced motion: no scale, brief color changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  expect(await solid(page, 'return s.group.status.motionReduced')).toBe(true);
  await solid(page, 's.surface.setPressed(true)');
  await expect.poll(() => layerStyle(page, 'background-color')).toBe(rgb('#dce0e5'));
  expect(await layerStyle(page, 'transform')).toBe('none');
  expect(parseFloat(await layerStyle(page, 'transition-duration'))).toBeLessThanOrEqual(0.08);
  expect(await layerStyle(page, 'transition-property')).not.toContain('transform');
});

test('interactive surfaces follow the pointer and the keyboard', async ({ page }) => {
  await open(page);
  await solid(page, 's.group.detach(s.surface); s.surface = s.group.attach(s.host, { interaction: "interactive" })');
  const host = page.locator('#solid-host');
  await page.mouse.move(100, 48);
  await expect(host).toHaveAttribute('data-jello-state', 'hover');
  await page.mouse.down();
  await expect(host).toHaveAttribute('data-jello-state', 'pressed');
  await page.mouse.up();
  await expect(host).toHaveAttribute('data-jello-state', 'hover');
  await page.mouse.move(600, 400);
  await expect(host).toHaveAttribute('data-jello-state', 'default');
  await host.focus();
  await page.keyboard.down('Enter');
  await expect(host).toHaveAttribute('data-jello-state', 'pressed');
  await page.keyboard.up('Enter');
  await expect(host).toHaveAttribute('data-jello-state', 'default');
});

test('updating the material rewrites variables only when something changed; destroy leaves nothing behind', async ({ page }) => {
  await open(page);
  const result = await solid<{ same: unknown; changed: unknown; writes: number[]; mode: string }>(page, `
    const w0 = s.surface.writes;
    const same = s.group.setMaterial(s.rt.SOLID_PRESETS[0].doc);
    const w1 = s.surface.writes;
    const changed = s.group.setMaterial(s.rt.SOLID_PRESETS[1].doc);
    const w2 = s.surface.writes;
    return { same, changed, writes: [w1 - w0, w2 - w1], mode: s.surface.state };`);
  expect(result.same).toEqual({ changed: [], stages: [], surfaces: 0 });
  expect((result.changed as { changed: string[] }).changed).toContain('material.fill');
  expect(result.writes[0]).toBe(0);
  expect(result.writes[1]).toBeGreaterThan(0);
  await expect.poll(() => layerStyle(page, 'background-color')).toBe(rgb('#1d2433'));

  await solid(page, 's.group.destroy()');
  await expect(page.locator('#solid-host > .jello-solid')).toHaveCount(0);
  const left = await page.locator('#solid-host').evaluate((el) => ({ cls: el.className, style: el.getAttribute('style') ?? '', state: el.getAttribute('data-jello-state') }));
  expect(left.cls).not.toContain('jello-solid-host');
  expect(left.style).not.toContain('--jsolid');
  expect(left.state).toBeNull();
});

test('Solid and Glass share a page: the Glass navbar keeps working', async ({ page }) => {
  await open(page);
  const tab = page.locator('.tab[data-tab=explore]');
  await tab.click();
  await expect(tab).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#status')).toHaveAttribute('data-effective', /svg|css/);
  await solid(page, 's.surface.setActive(true)');
  await expect(page.locator('#solid-host')).toHaveAttribute('data-jello-state', 'active');
});

// ---------------------------------------------------------------------------
// Accessibility: forced colors, color-mix fallback, focus, contrast
// ---------------------------------------------------------------------------

/** WCAG relative luminance and contrast ratio of two `rgb()/rgba()` strings. */
const channels = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const luminance = (c: string) => {
  const [r, g, b] = channels(c).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

test.describe('forced colors', () => {
  test('the edge stays visible, the disabled look is distinct, the text is the system color', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page);
    const active = await page.evaluate(() => matchMedia('(forced-colors: active)').matches);
    test.skip(!active, 'Questo motore non emula forced-colors');
    // A material with no border at all: forced colors must still draw one.
    await solid(page, `s.group.setMaterial(s.rt.createSolidDocument({ id: 'flat', name: 'Flat', params: { borderWidth: 0, elevation: 0 } }))`);
    await expect.poll(() => layerStyle(page, 'border-top-width')).not.toBe('0px');
    expect(parseFloat(await layerStyle(page, 'border-top-width'))).toBeGreaterThanOrEqual(1);
    const edge = await layerStyle(page, 'border-top-color');
    const text = await hostStyle(page, 'color');
    // The author's fill and shadow are replaced by system colors: the page keeps the user's contrast.
    expect(await layerStyle(page, 'background-color')).not.toBe(rgb('#f1f3f5'));
    expect(await layerStyle(page, 'box-shadow')).toBe('none');
    expect(edge).toBe(text);
    await solid(page, 's.surface.setDisabled(true)');
    await expect(page.locator('#solid-host')).toHaveAttribute('data-jello-state', 'disabled');
    await expect.poll(() => hostStyle(page, 'color')).not.toBe(text);
  });

  test('without forced colors the same material keeps its author colors', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'none' });
    await open(page);
    expect(await layerStyle(page, 'background-color')).toBe(rgb('#f1f3f5'));
    expect(await layerStyle(page, 'border-top-width')).toBe('1px');
  });
});

test.describe('color-mix fallback', () => {
  const NO_MIX = `(() => { const orig = CSS.supports.bind(CSS); CSS.supports = (a, b) => (/color-mix/.test(String(b ?? a)) ? false : orig(a, b)); })();`;

  test('a browser without color-mix gets rgba() shadows that still draw, level for level', async ({ page }) => {
    await page.addInitScript(NO_MIX);
    await open(page);
    expect(await solid(page, 'return s.group.colorMix')).toBe(false);
    await solid(page, `s.group.setMaterial(s.rt.createSolidDocument({ id: 'lift', name: 'Lift', params: { elevation: 3 } }))`);
    const written = await page.locator('#solid-host').evaluate((el) => el.style.getPropertyValue('--jsolid-shadow'));
    expect(written).not.toContain('color-mix');
    expect(written).toMatch(/rgba\(16, 24, 40, 0\.\d+\)/);
    const computed = await layerStyle(page, 'box-shadow');
    expect(computed).not.toBe('none');
    expect((computed.match(/rgba?\(/g) ?? []).length).toBe(2);
  });

  test('an engine that has color-mix is detected and uses it', async ({ page }) => {
    await open(page);
    const supported = await page.evaluate(() => CSS.supports('color', 'color-mix(in srgb, red 50%, transparent)'));
    expect(await solid(page, 'return s.group.colorMix')).toBe(supported);
    const written = await page.locator('#solid-host').evaluate((el) => el.style.getPropertyValue('--jsolid-shadow'));
    expect(written.includes('color-mix')).toBe(supported);
    expect(await layerStyle(page, 'box-shadow')).not.toBe('none');
  });

  test('the option overrides detection, and both notations paint the same shadow', async ({ page }) => {
    await open(page);
    const read = async (mix: boolean) => {
      await solid(page, `s.group.destroy(); const g = s.rt.createSolidGroup({ material: s.rt.SOLID_PRESETS[1].doc, colorMix: ${mix} }); s.group = g; s.surface = g.attach(s.host, { interaction: 'none' })`);
      return layerStyle(page, 'box-shadow');
    };
    const mixed = await read(true);
    const plain = await read(false);
    // Computed values are resolved colors, but a browser may print a mixed one as color(srgb 0..1 …) and a plain one as
    // rgba(0..255 …): bring both to 0..255 and allow a rounding step per channel/alpha.
    const nums = (v: string) =>
      v
        .split(/,\s*(?=color\(|rgba?\()/)
        .flatMap((layer) => {
          const n = (layer.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number);
          return /color\(srgb/.test(layer) ? [n[0]! * 255, n[1]! * 255, n[2]! * 255, ...n.slice(3)] : n;
        });
    const a = nums(mixed);
    const b = nums(plain);
    expect(b).toHaveLength(a.length);
    a.forEach((n, i) => expect(Math.abs(n - b[i]!), `${mixed} vs ${plain}`).toBeLessThan(1.5));
  });
});

/** Tab until the element is focused: it is the last control on the page, behind the example's own. */
async function tabTo(page: Page, el: ReturnType<Page['locator']>) {
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (await el.evaluate((n) => n === document.activeElement)) return;
  }
  throw new Error('Il focus da tastiera non ha raggiunto l’elemento');
}

test.describe('focus and contrast', () => {
  test('keyboard focus draws a visible ring that mouse focus does not, and the host can still override it', async ({ page }) => {
    await open(page);
    const host = page.locator('#solid-host');
    await tabTo(page, host);
    expect(await hostStyle(page, 'outline-style')).toBe('solid');
    expect(parseFloat(await hostStyle(page, 'outline-width'))).toBeGreaterThanOrEqual(2);
    expect(parseFloat(await hostStyle(page, 'outline-offset'))).toBeGreaterThanOrEqual(1);
    // The ring is the content color, which is readable on the fill by construction.
    expect(await hostStyle(page, 'outline-color')).toBe(await hostStyle(page, 'color'));
    expect(contrast(await hostStyle(page, 'outline-color'), await layerStyle(page, 'background-color'))).toBeGreaterThanOrEqual(3);
    // The ring is not painted over by the surface: the layer is inside the host and stays within its box.
    const boxes = await page.evaluate(() => {
      const h = document.querySelector('#solid-host')!.getBoundingClientRect();
      const l = document.querySelector('#solid-host > .jello-solid')!.getBoundingClientRect();
      return { dx: Math.abs(h.x - l.x), dy: Math.abs(h.y - l.y), dw: Math.abs(h.width - l.width), dh: Math.abs(h.height - l.height) };
    });
    expect(Math.max(boxes.dx, boxes.dy, boxes.dw, boxes.dh)).toBeLessThan(1);
    // A host that styles its own focus wins (zero specificity of the default).
    await page.addStyleTag({ content: '#solid-host:focus-visible { outline: 5px dashed rgb(255, 0, 0); }' });
    expect(await hostStyle(page, 'outline-color')).toBe('rgb(255, 0, 0)');
    // A pointer click does not show it.
    await page.evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.mouse.click(100, 48);
    await expect(host).toBeFocused();
    expect(await hostStyle(page, 'outline-style')).toBe('none');
  });

  test('the ring follows --jsolid-focus where the page behind needs another color', async ({ page }) => {
    await open(page);
    await page.locator('#solid-host').evaluate((el) => el.style.setProperty('--jsolid-focus', 'rgb(0, 120, 255)'));
    await tabTo(page, page.locator('#solid-host'));
    expect(await hostStyle(page, 'outline-color')).toBe('rgb(0, 120, 255)');
  });

  test('the official presets keep 4.5:1 between content and surface in every state, measured on the computed styles', async ({ page }) => {
    await open(page);
    const count = await solid<number>(page, 'return s.rt.SOLID_PRESETS.length');
    for (let i = 0; i < count; i++) {
      await solid(page, `s.group.destroy(); const g = s.rt.createSolidGroup({ material: s.rt.SOLID_PRESETS[${i}].doc }); s.group = g; s.surface = g.attach(s.host, { interaction: 'none' })`);
      const id = await solid<string>(page, `return s.rt.SOLID_PRESETS[${i}].doc.id`);
      for (const [label, setup] of [
        ['default', ''],
        ['hover', 's.surface.setHovered(true)'],
        ['pressed', 's.surface.setPressed(true)'],
        ['active', 's.surface.setActive(true)'],
      ] as const) {
        await solid(page, `s.surface.setHovered(false); s.surface.setPressed(false); s.surface.setActive(false); ${setup}`);
        // Wait out the transition so the computed colors are the final ones.
        await page.waitForTimeout(260);
        const fill = await layerStyle(page, 'background-color');
        const text = await hostStyle(page, 'color');
        expect(contrast(fill, text), `${id} · ${label}: ${text} on ${fill}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
