#!/usr/bin/env node
/**
 * M6.4.3 raster metrics from the real renderer. Pixel metrics support, never replace, a visual judgement.
 *   node docs/m643/tools/analyze.mjs <variant> [outJson]
 * Per preset × size × background (light, dark, gradient), DPR 1, Chromium, injected clock:
 *   bodyLum        mean relative luminance of the button interior (label hidden)
 *   bodyContrast   WCAG contrast ratio between that luminance and the cell background
 *   edgeContrast   |luminance(outer rim ring) - luminance(center)| : how much the edge reads as matter
 *   bubbleVisible  pixels where the bubbles change the render (any channel >= 6/255) and their mean luminance delta ×255
 *   textP5/median  contrast of the label colour against the pixels behind the label (worst 5 % / median): >= 4.5 is AA
 *   pressDelta     mean |Δ| of the button area between idle and hold, and number of pixels > 12/255
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { BGS, ENGINES, PAD, PRESETS, SIZES, openPage, sheet } from './lib.mjs';

const variant = process.argv[2] ?? 'A';
const outJson = process.argv[3];
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const decode = (buf) => PNG.sync.read(buf);
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor((s.length - 1) * p)]; };

const browser = await ENGINES.chromium.launch();
const { ctx, page, errors } = await openPage(browser, 1);
const states = ['idle', 'hold'];
const fg = await page.evaluate(({ variant, presets }) => Object.fromEntries(presets.map((id) => [id, window.m643.variants.VARIANTS[variant](id).doc.material.foreground])), { variant, presets: PRESETS });
const rows = [];
for (const size of Object.keys(SIZES)) for (const bg of ['light', 'dark', 'gradient']) {
  const [w, h] = SIZES[size], cw = w + 2 * PAD, ch = h + 2 * PAD;
  const shots = {};
  for (const [key, opts] of Object.entries({ plain: {}, hidden: { hideContent: true }, noBubbles: { hideContent: true, bubblesOff: true } })) {
    const stage = await sheet(page, { variant, size, bg, states, ...opts });
    shots[key] = decode(await stage.screenshot({ animations: 'disabled' }));
  }
  const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
  PRESETS.forEach((id, row) => states.forEach((state, col) => {
    if (state !== 'idle' && state !== 'hold') return;
    const ox = col * cw, oy = row * ch, x0 = ox + PAD, y0 = oy + PAD;
    const inset = Math.max(3, Math.round(Math.min(w, h) * 0.12));
    const img = shots.hidden, bgRGB = px(img, ox + 2, oy + ch - 3), bgL = lum(...bgRGB);
    let sum = 0, n = 0;
    for (let y = y0 + inset; y < y0 + h - inset; y++) for (let x = x0 + inset; x < x0 + w - inset; x++) { sum += lum(...px(img, x, y)); n++; }
    const body = sum / n;
    if (state === 'idle') {
      const ring = [], center = [];
      for (let x = x0 + Math.round(h / 2); x < x0 + w - Math.round(h / 2); x++) {
        for (const y of [y0 + 1, y0 + 2, y0 + h - 2, y0 + h - 3]) ring.push(lum(...px(img, x, y)));
        for (let y = y0 + Math.round(h * 0.4); y < y0 + Math.round(h * 0.6); y++) center.push(lum(...px(img, x, y)));
      }
      const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
      // bubbles
      let changed = 0, delta = 0;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const a = px(shots.hidden, x, y), b = px(shots.noBubbles, x, y);
        const d = Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
        if (d >= 6) { changed++; delta += Math.abs(lum(...a) - lum(...b)) * 255; }
      }
      // text legibility: pixels of the central label band, label hidden
      const f = lum(...hex(fg[id])), cs = [];
      for (let y = y0 + Math.round(h * 0.3); y < y0 + Math.round(h * 0.7); y++) for (let x = x0 + Math.round(w * 0.25); x < x0 + Math.round(w * 0.75); x++) cs.push(ratio(f, lum(...px(img, x, y))));
      rows.push({ preset: id, size, bg, state, bodyLum: +body.toFixed(4), bodyContrast: +ratio(body, bgL).toFixed(3), edgeContrast: +Math.abs(avg(ring) - avg(center)).toFixed(4),
        bubblePixels: changed, bubbleDeltaMean: changed ? +(delta / changed).toFixed(2) : 0, textP5: +pct(cs, 0.05).toFixed(2), textMedian: +pct(cs, 0.5).toFixed(2) });
    } else {
      const idle = rows.find((r) => r.preset === id && r.size === size && r.bg === bg && r.state === 'idle');
      let d = 0, big = 0, m = 0;
      const idleX = 0 * cw + PAD, idleY = row * ch + PAD;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const a = px(img, idleX + x, idleY + y), b = px(img, x0 + x, y0 + y);
        const dd = (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3; d += dd; m++; if (dd > 12) big++;
      }
      idle.pressMeanDelta = +(d / m).toFixed(2); idle.pressPixels12 = big;
    }
  }));
}
await ctx.close(); await browser.close();
const result = { variant, engine: 'chromium', dpr: 1, errors, rows };
if (outJson) writeFileSync(outJson, `${JSON.stringify(result, null, 1)}\n`);
console.table(rows.filter((r) => r.bg === 'light').map(({ preset, size, bodyLum, bodyContrast, edgeContrast, bubblePixels, bubbleDeltaMean, textP5, pressMeanDelta }) => ({ preset, size, bodyLum, bodyContrast, edgeContrast, bubblePixels, bubbleDeltaMean, textP5, pressMeanDelta })));
