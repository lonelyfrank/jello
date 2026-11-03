// M6.4.2 exploratory probe: Material Lab numeric input validation and reset
// Run from the repository root against a served build (npm run build && npx vite preview --port 4173). Its findings were turned into
// permanent tests (tests/e2e/m642-*.spec.ts); kept here as the record of HOW each defect in docs/m642/audit-baseline.md was reproduced.
import { chromium } from '@playwright/test';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
const errs = []; page.on('console', m => m.type()==='error' && errs.push(m.text())); page.on('pageerror', e => errs.push('PAGEERROR '+e.message));
await page.goto('http://127.0.0.1:4173/?preset=satin&scene=grid&animate=0'); await page.waitForSelector('html[data-ready=true]'); await page.waitForTimeout(600);
await page.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true));
const blur = () => page.evaluate(() => window.__jello.params.blur);
const num = page.locator('#num-blur'); const msg = page.locator('#err-blur');
const log = [];
const step = async (label, fn) => { await fn(); await page.waitForTimeout(150); log.push(`${label.padEnd(26)} blur=${await blur()} text="${await num.inputValue()}" invalid=${await num.getAttribute('aria-invalid')} msg="${(await msg.textContent()).trim()}" msgHidden=${await msg.isHidden()}`); };
log.push('initial blur=' + await blur());
await step('valid 12.5', () => num.fill('12.5'));
await step('valid 7,5 (comma)', () => num.fill('7,5'));
await step('below min -5', () => num.fill('-5'));
await step('above max 999', () => num.fill('999'));
await step('empty', () => num.fill(''));
await step('non numeric abc', () => num.fill('abc'));
await step('1e2', () => num.fill('1e2'));
await step('blur after invalid', async () => { await num.fill('abc'); await num.blur(); });
await step('valid then arrow up', async () => { await num.fill('10'); await num.press('ArrowUp'); });
await step('shift+arrow down', async () => { await num.press('Shift+ArrowDown'); });
await step('reset single', async () => { await page.locator('[data-param-field="blur"] .control-reset').click(); });
// rapid changes of several params
const t0 = Date.now();
for (let i = 0; i < 30; i++) { await page.locator('#num-refraction').fill(String(i)); await page.locator('#num-saturation').fill(String(100 + i)); }
log.push(`rapid 60 edits ${Date.now() - t0}ms refraction=${await page.evaluate(() => window.__jello.params.refraction)} sat=${await page.evaluate(() => window.__jello.params.saturation)}`);
// serialized document validity
const json = await page.evaluate(() => window.__jello.exportJson());
log.push('exported doc bytes ' + json.length + ' parses=' + !!JSON.parse(json).material);
// full reset
const resetAll = page.getByRole('button', { name: /Ripristina.*preset|Ripristina tutto|Ripristina/i }).first();
log.push('reset buttons: ' + (await page.locator('button', { hasText: /Ripristina/ }).allTextContents()).join(' | '));
console.log(log.join('\n')); console.log('ERRS', JSON.stringify(errs));
await b.close();
