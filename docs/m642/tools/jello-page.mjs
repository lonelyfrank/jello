// M6.4.2 exploratory probe: text of the Jello lab page
// Run from the repository root against a served build (npm run build && npx vite preview --port 4173). Its findings were turned into
// permanent tests (tests/e2e/m642-*.spec.ts); kept here as the record of HOW each defect in docs/m642/audit-baseline.md was reproduced.
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
const errs = []; page.on('console', m => m.type()==='error' && errs.push(m.text())); page.on('pageerror', e => errs.push('PAGEERROR '+e.message));
await page.goto('http://127.0.0.1:4173/'); await page.waitForSelector('#homePage');
await page.click('#startKit'); await page.waitForTimeout(1200);
await page.click('#ws-jelly'); await page.waitForSelector('#jelly-lab', { timeout: 15000 }); await page.waitForTimeout(1500);
console.log('TEXT:', (await page.locator('#jelly-lab').innerText()).replace(/\n{2,}/g, '\n').slice(0, 3500));
console.log('ERRS', JSON.stringify(errs));
await page.screenshot({ path: 'jelly-lab.png' });
await b.close();
