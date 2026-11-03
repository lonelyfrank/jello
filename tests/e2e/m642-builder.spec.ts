/**
 * M6.4.2 §9: the Builder keeps a component's content when its material family changes, and the three components stay usable
 * from a wide desktop down to 320 px: nothing clipped by the Stage, no truncated target, no page-level horizontal scroll.
 */
import { expect, test, type Page } from '@playwright/test';

test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'viewport matrix is driven explicitly, once, on desktop Chromium');

const COMPONENTS = ['button', 'mobile-navbar', 'desktop-navbar'] as const;
const hook = <T>(page: Page, body: string) => page.evaluate(`(() => { const h = window.__jello; return (${body})(h); })()`) as Promise<T>;

async function startInBuilder(page: Page) {
  await page.goto('./');
  await page.waitForSelector('html[data-ready=true]');
  await page.locator('#startKit').click();
  await expect(page.locator('#lab')).toBeVisible();
  await page.locator('#ws-builder').click();
}

test.describe('Glass ↔ Solid keeps the component (§9.4)', () => {
  for (const id of COMPONENTS) {
    test(`${id}: content, labels, icons, structure and responsive rules are identical after Glass → Solid → Glass`, async ({ page }) => {
      await startInBuilder(page);
      await hook(page, `(h) => h.builder.open('${id}')`);
      await page.waitForTimeout(400);
      // Everything except the material binding, the id and the metadata: that is what a family change must not touch.
      const content = () => hook<string>(page, `(h) => { const d = JSON.parse(JSON.stringify(h.builder.doc)); delete d.material; delete d.meta; delete d.id; return JSON.stringify(d); }`);
      const family = () => hook<string>(page, `(h) => h.builder.doc.material.family`);
      const before = await content();
      const start = await family();
      const other = start === 'glass' ? 'solid' : 'glass';
      for (const target of [other, start, other, start]) {
        await hook(page, `(h) => h.builder.setFamily('${target}')`);
        await page.waitForTimeout(250);
        expect(await family()).toBe(target);
        expect(await content(), `content after switching to ${target}`).toBe(before);
        // The mounted component is the same type, re-rendered by the other family — not a second renderer left behind.
        expect(await hook(page, `(h) => { const n = h.builder.nav; return n && { type: n.type, family: n.family, mounted: n.mounted }; }`)).toEqual({ type: id, family: target, mounted: true });
      }
    });
  }
});

test.describe('responsive components (§9.5)', () => {
  const SIZES = [
    { name: 'desktop wide', w: 1440, h: 900 },
    { name: 'desktop compact', w: 1024, h: 768 },
    { name: 'tablet portrait', w: 768, h: 1024 },
    { name: 'mobile 390', w: 390, h: 844 },
    { name: 'mobile 320', w: 320, h: 640 },
  ] as const;
  for (const size of SIZES) {
    test(`${size.name} (${size.w}×${size.h}): no overflow, clipped, truncated or undersized target`, async ({ page }) => {
      await page.setViewportSize({ width: size.w, height: size.h });
      await startInBuilder(page);
      for (const id of COMPONENTS) {
        await hook(page, `(h) => h.builder.open('${id}')`);
        await page.waitForTimeout(500);
        const r = await page.evaluate(() => {
          const de = document.documentElement;
          const stage = document.querySelector('#stageMain')!.getBoundingClientRect();
          const targets = [...document.querySelectorAll<HTMLElement>('#stageMain button, #stageMain a, #stageMain [role=tab], #stageMain [role=link], #stageMain [role=menuitem]')].filter((e) => {
            const b = e.getBoundingClientRect();
            return b.width > 0 && b.height > 0;
          });
          const name = (e: HTMLElement) => (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 16);
          return {
            pageOverflow: de.scrollWidth - de.clientWidth,
            targets: targets.length,
            small: targets.filter((e) => e.getBoundingClientRect().width < 24 || e.getBoundingClientRect().height < 24).map(name), // WCAG 2.2 · 2.5.8 minimum
            clipped: targets.filter((e) => e.getBoundingClientRect().right > stage.right + 1 || e.getBoundingClientRect().left < stage.left - 1).map(name),
            truncated: targets.filter((e) => e.scrollWidth > e.clientWidth + 1).map(name),
          };
        });
        expect(r.targets, `${id} renders interactive targets`).toBeGreaterThan(0);
        expect({ id, ...r, targets: 0 }, id).toEqual({ id, pageOverflow: 0, targets: 0, small: [], clipped: [], truncated: [] });
      }
    });
  }
});
