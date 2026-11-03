// M6.4.2 exploratory probe: Library diagnostic badge, Jello category set, Home Template list
// Run from the repository root against a served build (npm run build && npx vite preview --port 4173). Its findings were turned into
// permanent tests (tests/e2e/m642-*.spec.ts); kept here as the record of HOW each defect in docs/m642/audit-baseline.md was reproduced.
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
const errs = []; page.on('console', m => m.type()==='error' && errs.push(m.text())); page.on('pageerror', e => errs.push('PAGEERROR '+e.message));
await page.goto('http://127.0.0.1:4173/'); await page.waitForSelector('#homePage');
await page.click('#startKit'); await page.waitForTimeout(1500);

// H1: Library diagnostic badge
await page.click('#ws-library'); await page.waitForSelector('#studioLibrary');
await page.check('#showDiagnostics'); await page.waitForTimeout(300);
const cats = await page.$$eval('.lib-cats .cat', bs => bs.map(x => x.textContent.replace(/\s+/g,' ').trim()));
console.log('LIB CATS', JSON.stringify(cats));
await page.click('.lib-cats .cat:has-text("Diagnostica")'); await page.waitForTimeout(300);
console.log('DIAG shown cards', await page.$$eval('.catalog-card', c => c.map(x => x.querySelector('h2').textContent)), 'status', await page.$eval('.section-tools [role=status]', e => e.textContent));
// Library: all-materials list (names + families) with diagnostics off
await page.uncheck('#showDiagnostics'); await page.click('.lib-cats .cat:has-text("Tutti")');
console.log('ALL (diag off)', await page.$$eval('.catalog-card', c => c.map(x => x.querySelector('h2').textContent)));
// Jello family
await page.click('.pill:has-text("Jello")'); await page.waitForTimeout(800);
console.log('JELLO cats', JSON.stringify(await page.$$eval('.lib-cats .cat', bs => bs.map(x => x.textContent.replace(/\s+/g,' ').trim()))));
console.log('JELLO cards', await page.$$eval('.catalog-card', c => c.map(x => x.querySelector('h2').textContent)));
await page.click('.lib-cats .cat:has-text("Buttons")'); await page.waitForTimeout(200);
console.log('JELLO+Buttons cards', await page.$$eval('.catalog-card', c => c.length), await page.$eval('.catalog-main', e => e.textContent.slice(-120)));

// H2: Home template mode lists diagnostic
await page.click('#ws-home'); await page.waitForSelector('#homePage');
await page.click('[role=tab]:has-text("Template")'); await page.waitForTimeout(500);
console.log('TPL cards', await page.$$eval('.home-card', c => c.map(x => x.getAttribute('aria-label'))));

// H3: Builder radius px labelledby
await page.click('#ws-builder'); await page.waitForTimeout(800);
const radius = page.locator('[data-field="style.radius"], [data-field="size.radius"], select[id*="radius"]').first();
console.log('radius select count', await page.locator('select[id*="radius"]').count());
console.log('ERRS', JSON.stringify(errs));
await b.close();
