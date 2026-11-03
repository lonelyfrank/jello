// M6.4.2 exploratory probe: Builder px radius field accessible name
// Run from the repository root against a served build (npm run build && npx vite preview --port 4173). Its findings were turned into
// permanent tests (tests/e2e/m642-*.spec.ts); kept here as the record of HOW each defect in docs/m642/audit-baseline.md was reproduced.
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
await page.goto('http://127.0.0.1:4173/'); await page.waitForSelector('#homePage');
await page.click('#startKit'); await page.waitForTimeout(1200);
await page.click('#ws-builder'); await page.waitForTimeout(800);
// open a Button
await page.evaluate(() => window.__jello.builder.open('button'));
await page.waitForTimeout(800);
await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
const sel = page.locator('select[id*="radius"]').first();
console.log('radius select', await sel.count(), await sel.getAttribute('id'));
await sel.selectOption('px'); await page.waitForTimeout(300);
const info = await page.evaluate(() => { const i = document.querySelector('input[id$="-px-num"]'); if (!i) return null; const ids = i.getAttribute('aria-labelledby').split(' '); return { id: i.id, labelledby: ids.map(x => [x, !!document.getElementById(x)]), labels: [...i.labels].map(l => l.textContent) }; });
console.log(JSON.stringify(info));
await b.close();
