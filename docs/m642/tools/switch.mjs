// M6.4.2 exploratory probe: Glass ↔ Solid keeps component content
// Run from the repository root against a served build (npm run build && npx vite preview --port 4173). Its findings were turned into
// permanent tests (tests/e2e/m642-*.spec.ts); kept here as the record of HOW each defect in docs/m642/audit-baseline.md was reproduced.
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
const errs = []; page.on('console', m => m.type()==='error' && errs.push(m.text())); page.on('pageerror', e => errs.push('PAGEERROR '+e.message));
await page.goto('http://127.0.0.1:4173/'); await page.waitForSelector('#homePage'); await page.click('#startKit'); await page.waitForTimeout(1200);
await page.click('#ws-builder'); await page.waitForTimeout(600);
const strip = (d) => { const c = JSON.parse(JSON.stringify(d)); delete c.material; delete c.meta; delete c.id; return c; };
for (const id of ['button', 'mobile-navbar', 'desktop-navbar']) {
  await page.evaluate((i) => window.__jello.builder.open(i), id); await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.__jello.builder.doc);
  const fam0 = before.material.family;
  const res = [];
  for (const fam of [fam0 === 'glass' ? 'solid' : 'glass', fam0, fam0 === 'glass' ? 'solid' : 'glass', fam0]) {
    await page.evaluate((f) => window.__jello.builder.setFamily(f), fam); await page.waitForTimeout(300);
    const now = await page.evaluate(() => window.__jello.builder.doc);
    const same = JSON.stringify(strip(now)) === JSON.stringify(strip(before));
    res.push(`${now.material.family}:${same ? 'content-identical' : 'CONTENT-DIFFERS'}`);
    if (!same) { const a = strip(before), c = strip(now); for (const k of new Set([...Object.keys(a), ...Object.keys(c)])) if (JSON.stringify(a[k]) !== JSON.stringify(c[k])) res.push(`   diff@${k}: ${JSON.stringify(a[k])?.slice(0,160)} -> ${JSON.stringify(c[k])?.slice(0,160)}`); }
  }
  const nav = await page.evaluate(() => { const n = window.__jello.builder.nav; return n ? { type: n.type, family: n.family, mounted: n.mounted } : null; });
  console.log(id, fam0, res.join(' | '), JSON.stringify(nav));
}
console.log('ERRS', JSON.stringify(errs));
await b.close();
