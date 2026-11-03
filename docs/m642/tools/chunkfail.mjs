// M6.4.2 exploratory probe: behaviour when the lazy Jello chunks fail to load
// Run from the repository root against a served build (npm run build && npx vite preview --port 4173). Its findings were turned into
// permanent tests (tests/e2e/m642-*.spec.ts); kept here as the record of HOW each defect in docs/m642/audit-baseline.md was reproduced.
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
const errs = []; page.on('console', m => m.type()==='error' && errs.push(m.text().slice(0,140))); page.on('pageerror', e => errs.push('PAGEERROR '+e.message.slice(0,140)));
await page.route(/JellyMain|jelly-lab|JellyCatalogPreview|BuilderTrial/, r => r.abort());
await page.goto('http://127.0.0.1:4173/'); await page.waitForSelector('#homePage'); await page.click('#startKit'); await page.waitForTimeout(1200);
await page.click('#ws-jelly'); await page.waitForTimeout(2500);
const body = await page.evaluate(() => ({ app: document.querySelector('#app')?.innerText.replace(/\s+/g,' ').slice(0, 300), rail: !!document.querySelector('.studio-rail'), jelly: !!document.querySelector('#jelly-lab:not([hidden])'), alerts: [...document.querySelectorAll('[role=alert]')].map(a => a.textContent.slice(0,120)) }));
console.log(JSON.stringify(body));
// can the user get out?
const home = page.locator('#ws-home');
console.log('home clickable', await home.count());
await home.click({ timeout: 3000 }).catch(e => console.log('home click failed', String(e).slice(0, 80)));
await page.waitForTimeout(800);
console.log('after home', await page.evaluate(() => ({ home: !!document.querySelector('#homePage'), app: document.querySelector('#app')?.innerText.replace(/\s+/g,' ').slice(0, 120) })));
// Library Jello family with the preview chunk failing
await page.click('#ws-library').catch(() => {}); await page.waitForTimeout(500);
await page.locator('.home-tabs .pill', { hasText: 'Jello' }).click().catch(e => console.log('pill failed', String(e).slice(0, 80))); await page.waitForTimeout(1500);
console.log('library jello', await page.evaluate(() => ({ cards: document.querySelectorAll('.catalog-card').length, text: document.querySelector('.catalog-main')?.innerText.replace(/\s+/g,' ').slice(0, 200) })));
console.log('ERRS', JSON.stringify(errs.slice(0, 5)));
await b.close();
