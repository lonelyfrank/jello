/**
 * Studio shell at the viewports the redesign has to hold: the page never
 * scrolls sideways, dialogs stay inside the viewport and every control a
 * pointer or finger has to hit is at least 24 × 24 CSS px (WCAG 2.5.8).
 * Engine-independent layout rules: one engine is enough.
 */
import { expect, test, type Page } from '@playwright/test';

const VIEWPORTS: [number, number][] = [
  [320, 800],
  [390, 844],
  [844, 390],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
];

const PAGES: [name: string, rail: string, ready: string][] = [
  ['home', '#ws-home', '.home, #workspaceHome, main'],
  ['builder', '#ws-builder', '.stages'],
  ['material lab', '#ws-material', '.stages'],
  ['library', '#ws-library', '#studioLibrary'],
  ['assets', '#nav-assets', 'main'],
  ['settings', '#studioSettings', 'main'],
];

test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'layout rules are checked once, on desktop Chromium');

async function open(page: Page, width: number, height: number, query = 'workspace=builder&component=mobile-navbar&scene=grid&animate=0&theme=dark') {
  await page.setViewportSize({ width, height });
  await page.goto(`./?${query}`);
  await page.waitForSelector('html[data-ready=true]');
}

async function sideways(page: Page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    return { page: de.scrollWidth - de.clientWidth, body: document.body.scrollWidth - de.clientWidth };
  });
}

/**
 * Controls whose effective hit area is under 24 × 24. The area is measured, not
 * read from the element's box: a label around an input, or a stretched ::after
 * (the library cards), makes a small element easy to hit. Range sliders are
 * skipped (the thumb is the target, and the track is not).
 */
async function smallTargets(page: Page, root = 'body') {
  return page.evaluate((sel) => {
    const out: string[] = [];
    const scope = document.querySelector(sel);
    if (!scope) return out;
    const hits = (el: HTMLElement) => {
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      let ok = 0;
      let total = 0;
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
          const x = cx - 11.5 + i * 5.75;
          const y = cy - 11.5 + j * 5.75;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          total++;
          const hit = document.elementFromPoint(x, y);
          if (hit && (hit === el || el.contains(hit) || hit.contains(el) && hit.closest('label, button, a')?.contains(el))) ok++;
        }
      }
      return total > 0 && ok === total;
    };
    for (const el of scope.querySelectorAll<HTMLElement>('button, input:not([type=hidden]):not([type=range]), select, textarea, [role=button], [role=tab], [role=switch]')) {
      if ((el as HTMLButtonElement).disabled || el.closest('[hidden], [inert]')) continue;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width <= 1 && r.height <= 1) continue; // visually hidden control: its label is the target
      // Native checkbox/radio in a label (the Material Lab options, from before the redesign): the label text is the target. Listed as P3 in the M6.H report.
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') && el.closest('label, .check')) continue;
      if (!r.width || !r.height || style.visibility === 'hidden' || style.display === 'none') continue;
      if (r.width >= 24 && r.height >= 24) continue;
      if (hits(el)) continue;
      out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ')[0] ?? ''} ${Math.round(r.width)}×${Math.round(r.height)} «${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}»`);
    }
    return out;
  }, root);
}

for (const [width, height] of VIEWPORTS) {
  test.describe(`${width}×${height}`, () => {
    test('every page of the Studio fits the width and keeps its controls reachable', async ({ page }) => {
      await open(page, width, height);
      const problems: string[] = [];
      for (const [name, rail, ready] of PAGES) {
        await page.locator(rail).click();
        await expect(page.locator(ready).first()).toBeVisible();
        const s = await sideways(page);
        if (s.page > 1 || s.body > 1) problems.push(`${name}: scrolls sideways by ${Math.max(s.page, s.body)}px`);
        for (const t of await smallTargets(page)) problems.push(`${name}: small target ${t}`);
      }
      expect(problems).toEqual([]);
    });

    test('the Create panel stays inside the viewport, can be scrolled and closes with Escape', async ({ page }) => {
      await open(page, width, height);
      await page.locator('#headerNewProject').click();
      const dialog = page.getByRole('dialog', { name: 'Inizia a creare' });
      await expect(dialog).toBeVisible();
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.y).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
      expect((await sideways(page)).page).toBeLessThanOrEqual(1);
      expect(await smallTargets(page, '#createDialog')).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(page.locator('#headerNewProject')).toBeFocused();
    });

    test('the Export dialog stays inside the viewport', async ({ page }) => {
      await open(page, width, height);
      await page.locator('#ws-export').click();
      const dialog = page.getByRole('dialog').first();
      await expect(dialog).toBeVisible();
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
      expect((await sideways(page)).page).toBeLessThanOrEqual(1);
    });

    test('the first-launch Home (no project yet) fits the width', async ({ page }) => {
      await open(page, width, height, 'animate=0&theme=dark');
      await expect(page.locator('#ws-home')).toBeVisible();
      const s = await sideways(page);
      expect(s.page).toBeLessThanOrEqual(1);
      expect(s.body).toBeLessThanOrEqual(1);
      expect(await smallTargets(page)).toEqual([]);
    });
  });
}
