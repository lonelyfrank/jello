// M6.4.2 exploratory probe: first launch: rail/tiles state, h1 count, Material Gallery
// Run from the repository root against a served build (npm run build && npx vite preview --port 4173). Its findings were turned into
// permanent tests (tests/e2e/m642-*.spec.ts); kept here as the record of HOW each defect in docs/m642/audit-baseline.md was reproduced.
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errs = []; page.on('console', m => m.type()==='error' && errs.push(m.text())); page.on('pageerror', e => errs.push('PAGEERROR '+e.message)); page.on('requestfailed', r => errs.push('REQFAIL '+r.url()));
await page.goto('http://127.0.0.1:4173/');
await page.waitForSelector('#homePage');
const rail = await page.$$eval('.studio-rail button', bs => bs.map(x => ({ id: x.id, label: x.getAttribute('aria-label'), disabled: x.disabled, title: x.title })));
console.log('RAIL', JSON.stringify(rail));
const cats = await page.$$eval('.home-cats .cat', bs => bs.map(x => ({ t: x.textContent.trim(), aria: x.getAttribute('aria-disabled'), title: x.title })));
console.log('CATS', JSON.stringify(cats));
console.log('H1s', await page.$$eval('h1', hs => hs.map(h => h.textContent)));
console.log('GALLERY', JSON.stringify(await page.$$eval('.mat-tile', ts => ts.map(t => t.textContent.trim()))));
console.log('GALLERYTEXT', await page.$eval('.demo-gallery > p', p => p.textContent));
console.log('PROJECTS in IDB?', await page.evaluate(async () => (await indexedDB.databases()).map(d => d.name)));
console.log('ERRS', errs);
await b.close();
