#!/usr/bin/env node
/**
 * M6.4.3.A §9 — 4×4 preset distinguishability at one tint, from the real renderer (M6.4.3 fixture harness, injected clock).
 *   node docs/m643a/tools/comparison-matrix.mjs [outJson]      (dev server on 4178: npm run dev -- --host 127.0.0.1 --port 4178)
 * Same tint (#b8a2e8), same content colour, same background, label hidden, Chromium, DPR 1. For every pair of presets and every
 * variant set (N = normalised baseline, NB3 = normalised B3), per size and background, six channels — not only the mean pixel distance:
 *   raster       mean |Δ| over the Button area (0-255) and share of pixels differing by > 12/255
 *   luminance    |Δ mean relative luminance| of the interior
 *   edge         |Δ (rim luminance − centre luminance)|
 *   highlight    |Δ (95th percentile of the upper band − interior median)|
 *   inclusions   relative difference of the pixels the bubbles change (bubbles on vs off)
 *   motion       |Δ press peak|, |Δ release swing|, |Δ rest time| of the model oscillator (pure, no browser)
 * «Class» is a TRIAGE heuristic over those channels (thresholds below), not a perceptual measure: human judgement is still pending.
 */
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { runnerImport } from 'vite';
import { ENGINES, PAD, PRESETS, SIZES, openPage, sheet } from '../../m643/tools/lib.mjs';

const root = new URL('../../../', import.meta.url).pathname;
const { module: review } = await runnerImport(`${root}src/lab/experimental/jelly/review/review-model.ts`);
const { module: variants } = await runnerImport(`${root}tests/fixtures/jelly-m643/variants.ts`);

export const THRESHOLDS = { rasterMean: 8, luminance: 0.03, edge: 0.02, highlight: 0.04, inclusions: 0.3, motion: { peak: 0.01, swing: 0.003, restMs: 150 } };
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor((s.length - 1) * p)]; };

const browser = await ENGINES.chromium.launch();
const { ctx, page, errors } = await openPage(browser, 1);
const px = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };

const results = [];
for (const variant of ['N', 'NB3']) for (const size of ['80x32', '160x44']) for (const bg of ['light', 'dark', 'gradient']) {
  const [w, h] = SIZES[size], cw = w + 2 * PAD, ch = h + 2 * PAD;
  const states = ['idle', 'hold'];
  const shot = async (opts) => PNG.sync.read(await (await sheet(page, { variant, size, bg, states, hideContent: true, ...opts })).screenshot({ animations: 'disabled' }));
  const withBubbles = await shot({}), without = await shot({ bubblesOff: true });
  const per = PRESETS.map((id, row) => {
    const o = (col) => ({ x: col * cw + PAD, y: row * ch + PAD });
    const { x: x0, y: y0 } = o(0);
    const inset = Math.max(3, Math.round(Math.min(w, h) * 0.12));
    const interior = [];
    for (let y = y0 + inset; y < y0 + h - inset; y++) for (let x = x0 + inset; x < x0 + w - inset; x++) interior.push(lum(...px(withBubbles, x, y)));
    const ring = [], centre = [];
    for (let x = x0 + Math.round(h / 2); x < x0 + w - Math.round(h / 2); x++) {
      for (const y of [y0 + 1, y0 + 2, y0 + h - 2, y0 + h - 3]) ring.push(lum(...px(withBubbles, x, y)));
      for (let y = y0 + Math.round(h * 0.4); y < y0 + Math.round(h * 0.6); y++) centre.push(lum(...px(withBubbles, x, y)));
    }
    const upper = [];
    for (let y = y0 + Math.round(h * 0.08); y < y0 + Math.round(h * 0.35); y++) for (let x = x0 + inset; x < x0 + w - inset; x++) upper.push(lum(...px(without, x, y)));
    const lower = [];
    for (let y = y0 + inset; y < y0 + h - inset; y++) for (let x = x0 + inset; x < x0 + w - inset; x++) lower.push(lum(...px(without, x, y)));
    let bubblePixels = 0;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const a = px(withBubbles, x, y), b = px(without, x, y);
      if (Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) >= 6) bubblePixels++;
    }
    return { id, x0, y0, bodyLum: avg(interior), edge: Math.abs(avg(ring) - avg(centre)), highlight: pct(upper, 0.95) - pct(lower, 0.5), bubblePixels };
  });
  const diff = (a, b, col) => {
    const A = PRESETS.indexOf(a), B = PRESETS.indexOf(b);
    let d = 0, big = 0, n = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = px(withBubbles, col * cw + PAD + x, A * ch + PAD + y), q = px(withBubbles, col * cw + PAD + x, B * ch + PAD + y);
      const dd = (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2])) / 3;
      d += dd; n++; if (dd > 12) big++;
    }
    return { mean: d / n, share: big / n };
  };
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const a = per[i], b = per[j], idle = diff(a.id, b.id, 0), hold = diff(a.id, b.id, 1);
    results.push({
      set: variant, size, bg, pair: `${a.id.slice(6)}/${b.id.slice(6)}`,
      rasterMeanIdle: +idle.mean.toFixed(2), rasterShareIdle: +idle.share.toFixed(3), rasterMeanHold: +hold.mean.toFixed(2),
      luminance: +Math.abs(a.bodyLum - b.bodyLum).toFixed(4), edge: +Math.abs(a.edge - b.edge).toFixed(4), highlight: +Math.abs(a.highlight - b.highlight).toFixed(4),
      inclusions: +(Math.max(a.bubblePixels, b.bubblePixels) ? Math.abs(a.bubblePixels - b.bubblePixels) / Math.max(a.bubblePixels, b.bubblePixels) : 0).toFixed(3),
    });
  }
}
await ctx.close(); await browser.close();

// Motion channel: pure oscillator, per variant set (N = A's motion, NB3 = B3's motion).
const motion = {};
for (const [set, name] of [['N', 'A'], ['NB3', 'B3']]) motion[set] = Object.fromEntries(PRESETS.map((id) => [id.slice(6), review.motionMetrics(variants.VARIANTS[name](id).doc.behavior)]));

const T = THRESHOLDS;
const rows = [];
for (const set of ['N', 'NB3']) for (const size of ['80x32', '160x44']) for (const pair of new Set(results.map((r) => r.pair))) {
  const sel = results.filter((r) => r.set === set && r.size === size && r.pair === pair);
  const m = (k) => +(sel.reduce((s, r) => s + r[k], 0) / sel.length).toFixed(4);
  const [a, b] = pair.split('/'), ma = motion[set][a], mb = motion[set][b];
  const channels = {
    raster: m('rasterMeanIdle'), rasterShare: m('rasterShareIdle'), rasterHold: m('rasterMeanHold'), luminance: m('luminance'), edge: m('edge'), highlight: m('highlight'), inclusions: m('inclusions'),
    motionPeak: +Math.abs(ma.pressPeak - mb.pressPeak).toFixed(4), motionSwing: +Math.abs(ma.releaseSwing - mb.releaseSwing).toFixed(4), motionRestMs: Math.abs((ma.restMs ?? 0) - (mb.restMs ?? 0)),
  };
  const hits = {
    raster: channels.raster >= T.rasterMean, luminance: channels.luminance >= T.luminance, edge: channels.edge >= T.edge, highlight: channels.highlight >= T.highlight, inclusions: channels.inclusions >= T.inclusions,
    motion: channels.motionPeak >= T.motion.peak || channels.motionSwing >= T.motion.swing || channels.motionRestMs >= T.motion.restMs,
  };
  const n = Object.values(hits).filter(Boolean).length;
  rows.push({ set, size, pair, ...channels, channelsDiffering: Object.entries(hits).filter(([, v]) => v).map(([k]) => k), class: n >= 4 ? 'distinct' : n >= 2 ? 'partly distinct' : 'similar (review by eye)' });
}
const out = { tool: 'docs/m643a/tools/comparison-matrix.mjs', engine: 'chromium', dpr: 1, tint: '#b8a2e8', thresholds: T, errors, motion, rows, raw: results };
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify(out, null, 1)}\n`);
console.table(rows.filter((r) => r.size === '160x44').map(({ set, pair, raster, luminance, edge, highlight, inclusions, motionSwing, motionRestMs, class: c }) => ({ set, pair, raster, luminance, edge, highlight, inclusions, motionSwing, motionRestMs, class: c })));
