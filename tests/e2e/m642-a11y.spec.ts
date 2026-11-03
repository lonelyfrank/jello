/**
 * M6.4.2 §10.5–10.6: every area of the Studio, at every required viewport, has no console error, no horizontal scroll,
 * one visible h1, no duplicated id and no control without an accessible name; keyboard focus is always visible.
 *
 * Automated checks are a floor, not an audit: docs/m642/accessibility.md lists what only a person (screen reader, zoom,
 * contrast tooling) can establish, and what was not done.
 */
import { expect, test, type Page } from '@playwright/test';

test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'viewport matrix is driven explicitly below, once, on desktop Chromium');

const VIEWPORTS = [
  { w: 320, h: 640 },
  { w: 390, h: 844 },
  { w: 768, h: 1024 },
  { w: 844, h: 390 }, // landscape phone: low height
  { w: 1024, h: 768 },
  { w: 1440, h: 900 },
] as const;
const AREAS = [
  ['ws-home', 'Home'],
  ['ws-builder', 'Builder'],
  ['ws-material', 'Material Lab'],
  ['ws-library', 'Library'],
  ['ws-preview', 'Preview & Test'],
  ['ws-jelly', 'Jello β'],
  ['nav-assets', 'Asset'],
  ['studioSettings', 'Impostazioni'],
] as const;

/** In-page audit: returns human-readable problems (empty = clean). */
const audit = (page: Page) =>
  page.evaluate(() => {
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden],[inert]');
    };
    const text = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim();
    const nameOf = (e: Element): { name: string; dangling: string[] } => {
      const by = e.getAttribute('aria-labelledby');
      if (by) {
        const ids = by.split(/\s+/);
        const found = ids.map((i) => document.getElementById(i));
        return { name: found.map((f) => (f ? text(f) : '')).join(' ').trim(), dangling: ids.filter((_, k) => !found[k]) };
      }
      const label = e.getAttribute('aria-label');
      if (label) return { name: label, dangling: [] };
      const labels = (e as HTMLInputElement).labels;
      if (labels?.length) return { name: [...labels].map(text).join(' ').trim(), dangling: [] };
      return { name: text(e) || e.getAttribute('title') || '', dangling: [] };
    };
    const problems: string[] = [];
    const where = (e: Element) => `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''}${typeof e.className === 'string' && e.className ? `.${e.className.split(' ')[0]}` : ''}`;
    for (const e of document.querySelectorAll('button,input:not([type=hidden]),select,textarea,a[href],[role=button],[role=tab],[role=switch],[role=slider],[role=menuitem]')) {
      if (!visible(e)) continue;
      const n = nameOf(e);
      if (n.dangling.length) problems.push(`${where(e)}: aria-labelledby → missing ${n.dangling.join(',')}`);
      else if (!n.name) problems.push(`${where(e)}: no accessible name`);
    }
    const seen = new Map<string, number>();
    document.querySelectorAll('[id]').forEach((e) => seen.set(e.id, (seen.get(e.id) ?? 0) + 1));
    for (const [id, n] of seen) if (n > 1) problems.push(`duplicate id #${id} ×${n}`);
    const h1 = [...document.querySelectorAll('h1')].filter(visible);
    if (h1.length !== 1) problems.push(`${h1.length} visible h1 (${h1.map(text).join(' | ')})`);
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth) problems.push(`horizontal overflow ${de.scrollWidth - de.clientWidth}px`);
    return problems;
  });

for (const vp of VIEWPORTS) {
  test(`every area at ${vp.w}×${vp.h}: no console error, overflow, unnamed control, duplicate id or second h1`, async ({ page }) => {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
    await page.goto('./');
    await page.waitForSelector('html[data-ready=true]');
    expect(await audit(page), 'first launch').toEqual([]);
    await page.locator('#startKit').click();
    await expect(page.locator('#lab')).toBeVisible();
    const found: string[] = [];
    for (const [id, label] of AREAS) {
      await page.locator(`#${id}`).click();
      await page.waitForTimeout(label === 'Jello β' ? 1500 : 500);
      for (const p of await audit(page)) found.push(`${label}: ${p}`);
    }
    expect(found).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('keyboard: every tab stop of the Home and of the Library shows a focus indicator', async ({ page }) => {
  await page.goto('./');
  await page.waitForSelector('html[data-ready=true]');
  await page.locator('#startKit').click();
  await expect(page.locator('#lab')).toBeVisible();
  const lacking: string[] = [];
  for (const area of ['ws-home', 'ws-library']) {
    await page.locator(`#${area}`).click();
    await page.waitForTimeout(500);
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const e = document.activeElement as HTMLElement | null;
        if (!e || e === document.body) return null;
        const s = getComputedStyle(e);
        const outline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
        const ring = s.boxShadow !== 'none';
        // A stretched hit-area button (Library card) or a bare input inside a styled field shows its ring on the container (:focus-within).
        const card = e.closest('article, label');
        const cs = card ? getComputedStyle(card) : null;
        const cardRing = !!cs && ((cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== 'none');
        return { who: `${e.tagName.toLowerCase()}${e.id ? `#${e.id}` : ''} ${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 28)}`, shown: outline || ring || cardRing };
      });
      if (state && !state.shown) lacking.push(`${area}: ${state.who}`);
    }
  }
  expect(lacking).toEqual([]);
});

/** WCAG relative luminance contrast of two sRGB colours given as `rgb(r, g, b)` / `rgba(...)` strings. */
function contrast(a: string, b: string): number {
  const lum = (css: string) => {
    const [r, g, bl] = (css.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number).map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} theme: every area is clean and text keeps ≥ 4.5:1 against its surface (§10.2, §10.6)`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto('./');
    await page.waitForSelector('html[data-ready=true]');
    await page.locator('#startKit').click();
    await expect(page.locator('#lab')).toBeVisible();
    // The theme of the interface (Impostazioni → «Tema dell'interfaccia di prova»), set through the same option the control writes.
    await page.evaluate((t) => (window as unknown as { __jello: { setOption(k: string, v: unknown): void } }).__jello.setOption('theme', t), theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const found: string[] = [];
    const ratios: Record<string, number> = {};
    for (const [id, label] of AREAS) {
      await page.locator(`#${id}`).click();
      await page.waitForTimeout(label === 'Jello β' ? 1500 : 500);
      for (const p of await audit(page)) found.push(`${label}: ${p}`);
      // The tokens the Studio's own text uses, against the surfaces it is drawn on.
      const t = await page.evaluate(() => {
        const s = getComputedStyle(document.querySelector('#app')!);
        const colour = (token: string) => { const probe = document.createElement('span'); probe.style.color = `var(${token})`; document.querySelector('#app')!.append(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; };
        return Object.fromEntries(['--text', '--muted', '--surface', '--surface-raised'].map((k) => [k, s.getPropertyValue(k) ? colour(k) : '']));
      });
      for (const fg of ['--text', '--muted']) for (const bg of ['--surface', '--surface-raised']) if (t[fg] && t[bg]) ratios[`${label} ${fg} on ${bg}`] = Math.round(contrast(t[fg]!, t[bg]!) * 100) / 100;
    }
    expect(found).toEqual([]);
    const low = Object.entries(ratios).filter(([, r]) => r < 4.5);
    expect(low, `contrast under 4.5:1 (${Object.keys(ratios).length} pairs measured)`).toEqual([]);
    expect(Object.keys(ratios).length).toBeGreaterThan(0);
  });
}
