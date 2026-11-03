// M6.4.2 exploratory probe: Builder components at five widths
// Run from the repository root against a served build (npm run build && npx vite preview --port 4173). Its findings were turned into
// permanent tests (tests/e2e/m642-*.spec.ts); kept here as the record of HOW each defect in docs/m642/audit-baseline.md was reproduced.
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const out = [];
for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024], [390, 844], [320, 640]]) {
  const page = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  await page.goto('http://127.0.0.1:4173/'); await page.waitForSelector('#homePage'); await page.click('#startKit'); await page.waitForTimeout(1000);
  await page.click('#ws-builder'); await page.waitForTimeout(500);
  for (const id of ['button', 'mobile-navbar', 'desktop-navbar']) {
    await page.evaluate((i) => window.__jello.builder.open(i), id); await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      const host = document.querySelector('#stageMain');
      const kids = [...document.querySelectorAll('#stageMain button, #stageMain a, #stageMain [role=tab], #stageMain [role=link], #stageMain [role=menuitem]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const small = kids.filter(e => { const r = e.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).map(e => `${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 14)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
      const sr = host.getBoundingClientRect();
      const clipped = kids.filter(e => { const r = e.getBoundingClientRect(); return r.right > sr.right + 1 || r.left < sr.left - 1; }).map(e => (e.textContent || e.tagName).trim().slice(0, 14));
      const trunc = kids.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => (e.textContent || e.tagName).trim().slice(0, 14));
      return { hOverflow: de.scrollWidth - de.clientWidth, targets: kids.length, small, clipped, trunc, stageW: Math.round(sr.width) };
    });
    out.push(`${w}x${h} ${id.padEnd(14)} ${JSON.stringify(r)}`);
  }
  await page.context().close();
}
console.log(out.join('\n'));
await b.close();
