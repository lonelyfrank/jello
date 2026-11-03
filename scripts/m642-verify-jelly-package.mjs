#!/usr/bin/env node
/**
 * M6.4.2 §12.7: independent verification of the experimental Jello packages (examples/jelly-consumer/*),
 * as a consumer would meet them: files and sha256 against the manifest, then each example served over plain HTTP and driven in
 * Chromium and Firefox (render, idle RAF, native click, keyboard, pointer press/release/rebound, disabled, reduced motion, destroy).
 *
 *   npm run jelly-consumer:prepare && node scripts/m642-verify-jelly-package.mjs   → docs/m642/package-verification.json
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium, firefox } from '@playwright/test';

const ROOT = new URL('../examples/jelly-consumer/', import.meta.url).pathname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/markdown' };
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const packages = readdirSync(ROOT).filter((d) => statSync(join(ROOT, d)).isDirectory() && existsSync(join(ROOT, d, 'manifest.json'))).sort();
const results = { date: new Date().toISOString(), packages: [] };

// 1. Integrity: every listed file exists with the listed size and hash; no file is unlisted (except the manifest itself).
for (const name of packages) {
  const dir = join(ROOT, name);
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  const problems = [];
  const listed = new Set();
  for (const f of manifest.files) {
    listed.add(f.path);
    const p = join(dir, f.path);
    if (!existsSync(p)) { problems.push(`missing ${f.path}`); continue; }
    const buf = readFileSync(p);
    if (buf.length !== f.bytes) problems.push(`${f.path}: ${buf.length} bytes, manifest says ${f.bytes}`);
    if (sha(buf) !== f.sha256) problems.push(`${f.path}: sha256 differs from the manifest`);
  }
  const all = [];
  const walk = (d, rel = '') => { for (const e of readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? walk(join(d, e.name), `${rel}${e.name}/`) : all.push(`${rel}${e.name}`)); };
  walk(dir);
  // manifest.json cannot hash itself, and README.md is generated FROM the manifest (it quotes its backends, limits and files): both are
  // outside the hash list by construction (src/lab/experimental/jelly/package.ts). Anything else unlisted is a finding.
  for (const f of all) if (f !== 'manifest.json' && f !== 'README.md' && !listed.has(f)) problems.push(`unlisted file ${f}`);
  results.packages.push({ name, material: manifest.material.id, experimental: manifest.experimental === true, declaresUnsupported: manifest.backends.unsupported, declaresLimits: manifest.limits.length, integrity: problems.length ? { ok: false, problems } : { ok: true, files: manifest.files.length } });
}

// 2. Behaviour in a browser, over HTTP.
const server = createServer((req, res) => {
  const p = normalize(join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)));
  const file = existsSync(p) && statSync(p).isDirectory() ? join(p, 'index.html') : p;
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});
await new Promise((r) => server.listen(4179, '127.0.0.1', r));

const INIT = () => { const w = window; w.__raf = 0; const raf = w.requestAnimationFrame.bind(w); w.requestAnimationFrame = (cb) => { w.__raf++; return raf(cb); }; };
async function drive(engine, name, reduced) {
  const browser = await engine.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 600 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(INIT);
  const out = [];
  for (const pkg of packages) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
    await page.goto(`http://127.0.0.1:4179/${pkg}/example/`);
    await page.waitForFunction(() => !!window.__jellyExample, null, { timeout: 8000 }).catch(() => undefined);
    const r = { package: pkg, engine: name, reducedMotion: reduced };
    r.mounted = await page.evaluate(() => !!window.__jellyExample && !!document.querySelector('#jelly-button .jelly-decoration'));
    if (!r.mounted) { r.errors = errors; out.push(r); await page.close(); continue; }
    r.status = await page.evaluate(() => document.getElementById('state').textContent);
    const raf = () => page.evaluate(() => window.__raf);
    await page.waitForTimeout(600);
    const idleA = await raf(); await page.waitForTimeout(1500); r.idleRafIn1500ms = (await raf()) - idleA;
    const host = page.locator('#jelly-button');
    // Keyboard: the host is a native button, so Space/Enter produce a native click.
    await host.focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    r.nativeClicksAfterKeyboard = Number(await page.locator('#clicks').textContent());
    // Pointer press → hold → release → rebound → rest (RAF must stop).
    const box = await host.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(250);
    r.pressedWhileHeld = await page.evaluate(() => window.__jellyExample.surface.motion.pressed);
    await page.mouse.up();
    r.nativeClicksAfterPointer = Number(await page.locator('#clicks').textContent());
    await page.waitForTimeout(2200);
    const restA = await raf(); await page.waitForTimeout(1200); r.restRafIn1200ms = (await raf()) - restA;
    r.pressedAfterRelease = await page.evaluate(() => window.__jellyExample.surface.motion.pressed);
    // Disabled: no deformation, no press.
    await page.evaluate(() => { document.getElementById('jelly-button').disabled = true; });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.waitForTimeout(150);
    r.pressedWhileDisabled = await page.evaluate(() => window.__jellyExample.surface.motion.pressed);
    await page.mouse.up();
    await page.evaluate(() => { document.getElementById('jelly-button').disabled = false; });
    // Destroy: decoration gone, class gone, no more RAF, no reaction to the pointer.
    await page.evaluate(() => window.__jellyExample.destroy());
    r.afterDestroy = await page.evaluate(() => ({ decoration: !!document.querySelector('.jelly-decoration'), surfaceClass: document.getElementById('jelly-button').classList.contains('jelly-surface') }));
    const dA = await raf(); await page.mouse.down(); await page.waitForTimeout(500); await page.mouse.up(); r.rafAfterDestroyAndPress = (await raf()) - dA;
    r.errors = errors;
    out.push(r);
    await page.close();
  }
  await browser.close();
  return out;
}
results.runs = [];
for (const [n, e] of [['chromium', chromium], ['firefox', firefox]]) for (const reduced of [false, true]) results.runs.push(...(await drive(e, n, reduced)));
server.close();

const bad = [];
for (const p of results.packages) if (!p.integrity.ok) bad.push(`${p.name}: ${p.integrity.problems.join('; ')}`);
for (const r of results.runs) {
  const at = `${r.engine}${r.reducedMotion ? '+reduced' : ''}/${r.package}`;
  if (!r.mounted) { bad.push(`${at}: not mounted ${r.errors?.join('|')}`); continue; }
  if (r.errors.length) bad.push(`${at}: console errors ${r.errors.join('|')}`);
  if (r.idleRafIn1500ms !== 0) bad.push(`${at}: ${r.idleRafIn1500ms} RAF at idle`);
  if (r.restRafIn1200ms !== 0) bad.push(`${at}: ${r.restRafIn1200ms} RAF after the rebound`);
  if (r.nativeClicksAfterKeyboard !== 2) bad.push(`${at}: keyboard produced ${r.nativeClicksAfterKeyboard} native clicks, expected 2`);
  if (r.pressedWhileDisabled) bad.push(`${at}: pressed while disabled`);
  if (r.afterDestroy.decoration || r.afterDestroy.surfaceClass) bad.push(`${at}: destroy left DOM behind`);
  if (r.rafAfterDestroyAndPress !== 0) bad.push(`${at}: RAF after destroy`);
  if (!r.reducedMotion && !r.pressedWhileHeld) bad.push(`${at}: pointer press not registered`);
}
results.verdict = bad.length ? { ok: false, problems: bad } : { ok: true, packages: packages.length, runs: results.runs.length };
writeFileSync(new URL('../docs/m642/package-verification.json', import.meta.url), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results.verdict, null, 2));
process.exit(bad.length ? 1 : 0);
