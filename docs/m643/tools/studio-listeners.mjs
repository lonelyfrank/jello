#!/usr/bin/env node
/**
 * Attributes the "+12 listeners per motion phase" seen in the Studio by M6.4.2 (performance.md §1, undiagnosed).
 * Wraps add/removeEventListener (with the calling source file) while the pointer is held and released on the Jello lab's
 * primary Button, and reads CDP DOM counters around the window. Needs a built Studio on http://127.0.0.1:4173/ (vite preview).
 *   node docs/m643/tools/studio-listeners.mjs [outJson]
 */
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const BASE = process.env.STUDIO ?? 'http://127.0.0.1:4173/';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  const log = (window.__ll = { on: false, added: {}, removed: {} });
  const where = () => ((new Error().stack ?? '').split('\n').slice(3, 6).map((l) => (l.match(/\/([^/\s)]+?\.(?:ts|tsx|js)):/) ?? [])[1]).filter(Boolean)[0] ?? '?');
  const tag = (t) => (t instanceof Element ? t.tagName.toLowerCase() : t === document ? 'document' : t === window ? 'window' : t?.constructor?.name ?? 'other');
  const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (type, ...a) { if (log.on) { const k = `${tag(this)}:${type} @ ${where()}`; log.added[k] = (log.added[k] ?? 0) + 1; } return add.call(this, type, ...a); };
  EventTarget.prototype.removeEventListener = function (type, ...a) { if (log.on) { const k = `${tag(this)}:${type} @ ${where()}`; log.removed[k] = (log.removed[k] ?? 0) + 1; } return rem.call(this, type, ...a); };
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const dom = async () => { await cdp.send('HeapProfiler.collectGarbage'); const c = await cdp.send('Memory.getDOMCounters'); return { nodes: c.nodes, listeners: c.jsEventListeners }; };
await page.goto(`${BASE}?studio=jelly&animate=0`);
await page.waitForSelector('#jelly-lab:not([hidden]) #jl-primary .jelly-decoration', { timeout: 20000 });
await page.waitForTimeout(800);
const box = await page.locator('#jl-primary').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
const phases = {};
for (const [name, act] of [['hold', async () => { await page.mouse.move(cx, cy); await page.mouse.down(); await page.waitForTimeout(3000); }], ['release', async () => { await page.mouse.up(); await page.waitForTimeout(1500); }], ['second-cycle', async () => { await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up(); await page.waitForTimeout(1500); }]]) {
  const before = await dom();
  await page.evaluate(() => { window.__ll.on = true; window.__ll.added = {}; window.__ll.removed = {}; });
  await act();
  const log = await page.evaluate(() => { window.__ll.on = false; return { added: window.__ll.added, removed: window.__ll.removed }; });
  const after = await dom();
  phases[name] = { before, after, delta: after.listeners - before.listeners, ...log };
}
await browser.close();
console.log(JSON.stringify(phases, null, 2));
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({ build: 'dist (vite preview)', phases }, null, 2)}\n`);
