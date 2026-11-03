// M6.4.2 exploratory probe: every Studio area at a given viewport: accessible names, duplicate ids, overflow, console
// Run from the repository root against a served build (npm run build && npx vite preview --port 4173). Its findings were turned into
// permanent tests (tests/e2e/m642-*.spec.ts); kept here as the record of HOW each defect in docs/m642/audit-baseline.md was reproduced.
import { chromium } from '@playwright/test';
const W = Number(process.argv[2] ?? 1280), H = Number(process.argv[3] ?? 860);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
const errs = []; page.on('console', m => m.type()==='error' && errs.push(m.text())); page.on('pageerror', e => errs.push('PAGEERROR '+e.message)); page.on('requestfailed', r => errs.push('REQFAIL '+r.url()));
await page.goto('http://127.0.0.1:4173/'); await page.waitForSelector('#homePage');
await page.click('#startKit'); await page.waitForTimeout(1500);
const probe = () => page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden],[inert]'); };
  const txt = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
  const name = (e) => {
    const lb = e.getAttribute('aria-labelledby');
    if (lb) { const ids = lb.split(/\s+/); const parts = ids.map(i => document.getElementById(i)); if (parts.some(p => !p)) return { dangling: ids.filter((i,k)=>!parts[k]) }; return { v: parts.map(txt).join(' ').trim() }; }
    const al = e.getAttribute('aria-label'); if (al) return { v: al };
    if (e.labels && e.labels.length) return { v: [...e.labels].map(txt).join(' ').trim() };
    if (e.tagName === 'INPUT' && ['button','submit'].includes(e.type)) return { v: e.value };
    const t = txt(e); if (t) return { v: t };
    return { v: e.getAttribute('title') || '' };
  };
  const bad = [];
  for (const e of document.querySelectorAll('button,input:not([type=hidden]),select,textarea,a[href],[role=button],[role=tab],[role=switch],[role=slider],[role=checkbox],[role=menuitem]')) {
    if (!vis(e)) continue; const n = name(e);
    if (n.dangling) bad.push({ el: e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.split(' ')[0]:''), issue: 'aria-labelledby dangling: '+n.dangling.join(',') });
    else if (!n.v) bad.push({ el: e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.split(' ')[0]:''), issue: 'no accessible name' });
  }
  const ids = {}; document.querySelectorAll('[id]').forEach(e => ids[e.id] = (ids[e.id]||0)+1);
  const dupIds = Object.entries(ids).filter(([,n])=>n>1).map(([i,n])=>i+'×'+n);
  const small = [...document.querySelectorAll('button,a[href],input:not([type=hidden]),select,[role=button]')].filter(vis).filter(e => { const r = e.getBoundingClientRect(); return (r.width < 24 || r.height < 24) && e.type !== 'range' && e.type !== 'checkbox' && e.type !== 'radio'; }).map(e => (e.id || e.getAttribute('aria-label') || txt(e).slice(0,20) || e.tagName) + ` ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`);
  const de = document.documentElement;
  return { h1: [...document.querySelectorAll('h1')].filter(vis).map(txt), badNames: bad, dupIds, hOverflow: de.scrollWidth - de.clientWidth, bodyOverflow: document.body.scrollWidth - de.clientWidth, small24: small.slice(0, 12), smallCount: small.length };
});
const areas = [['ws-home','home'],['ws-builder','builder'],['ws-material','material'],['ws-library','library'],['ws-preview','preview'],['ws-jelly','jelly'],['nav-assets','assets'],['studioSettings','settings']];
const out = {};
for (const [id, label] of areas) {
  const el = page.locator('#'+id);
  const rail = await el.isVisible().catch(()=>false);
  if (!rail) { out[label] = { railButtonVisible: false }; continue; }
  await el.click({ trial: false, timeout: 3000 }).catch(e => out[label] = { clickError: String(e).slice(0,100) });
  await page.waitForTimeout(label === 'jelly' ? 2500 : 1000);
  out[label] = await probe();
}
console.log(`VIEWPORT ${W}x${H}`);
console.log(JSON.stringify(out, null, 1));
console.log('ERRS', JSON.stringify(errs));
await b.close();
