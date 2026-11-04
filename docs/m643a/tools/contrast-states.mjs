#!/usr/bin/env node
/**
 * M6.4.3.A §10 — label contrast per interaction state, closing the gap M6.4.3 left (it measured idle only).
 *   node docs/m643a/tools/contrast-states.mjs [outJson]      (dev server on 4178: npm run dev -- --host 127.0.0.1 --port 4178)
 * For A and B3 of every preset, sizes 80×32 and 160×44, backgrounds light / dark / gradient, states idle · hover · hold (pressed, motion
 * settled at the press) · disabled: the WCAG contrast ratio of the state's own label colour (resolved from the document, so the disabled
 * override and any pressed override apply) against the pixels BEHIND the label (label hidden, central band), 5th percentile and median.
 * This is a raster ESTIMATE of text/background contrast, not a WCAG conformance statement: anti-aliasing, text weight, the real background
 * under a translucent Button and the «text»/«structured» backgrounds are not covered. Disabled text is exempt from WCAG 1.4.3 and is reported for information.
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { runnerImport } from 'vite';
import { ENGINES, PAD, PRESETS, SIZES, openPage, sheet } from '../../m643/tools/lib.mjs';

const root = new URL('../../../', import.meta.url).pathname;
const { module: model } = await runnerImport(`${root}src/model/experimental/jelly.ts`);
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor((s.length - 1) * p)]; };
const flags = { idle: {}, hover: { hover: true }, hold: { pressed: true }, disabled: { disabled: true } };

const browser = await ENGINES.chromium.launch();
const { ctx, page, errors } = await openPage(browser, 1);
const rows = [];
for (const variant of ['A', 'B3']) for (const size of ['80x32', '160x44']) for (const bg of ['light', 'dark', 'gradient']) {
  const [w, h] = SIZES[size], cw = w + 2 * PAD, ch = h + 2 * PAD;
  const states = Object.keys(flags);
  const img = PNG.sync.read(await (await sheet(page, { variant, size, bg, states, hideContent: true })).screenshot({ animations: 'disabled' }));
  const docs = await page.evaluate(({ variant, presets }) => Object.fromEntries(presets.map((id) => [id, window.m643.variants.VARIANTS[variant](id).doc])), { variant, presets: PRESETS });
  PRESETS.forEach((id, row) => states.forEach((state, col) => {
    const fg = lum(...hex(model.resolveExperimentalJelly(docs[id], flags[state]).foreground));
    const cs = [];
    for (let y = Math.round(h * 0.3); y < Math.round(h * 0.7); y++) for (let x = Math.round(w * 0.25); x < Math.round(w * 0.75); x++) {
      const i = ((row * ch + PAD + y) * img.width + col * cw + PAD + x) * 4;
      cs.push(ratio(fg, lum(img.data[i], img.data[i + 1], img.data[i + 2])));
    }
    rows.push({ variant, preset: id, size, bg, state, labelColor: model.resolveExperimentalJelly(docs[id], flags[state]).foreground, p5: +pct(cs, 0.05).toFixed(2), median: +pct(cs, 0.5).toFixed(2) });
  }));
}
await ctx.close(); await browser.close();
const min = (sel) => Math.min(...rows.filter(sel).map((r) => r.p5));
const summary = {};
for (const variant of ['A', 'B3']) for (const state of Object.keys(flags)) summary[`${variant} ${state}`] = { minP5: +min((r) => r.variant === variant && r.state === state).toFixed(2), below45: rows.filter((r) => r.variant === variant && r.state === state && r.p5 < 4.5).length, of: rows.filter((r) => r.variant === variant && r.state === state).length };
const out = { tool: 'docs/m643a/tools/contrast-states.mjs', engine: 'chromium', dpr: 1, errors, summary, rows };
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify(out, null, 1)}\n`);
console.table(summary);
