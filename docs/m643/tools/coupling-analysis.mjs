#!/usr/bin/env node
/**
 * M6.4.3 Phase D: how well do the surface layers already follow the deformation? Pure geometry, no browser.
 * The renderer (src/runtime/experimental/jelly.ts renderMotion) maps outline, rim, pool, core, gloss, gleam, caustic and the
 * inclusion centres through surfacePoint(); the soft highlight is an ellipse whose centre goes through surfacePoint() and whose
 * semi-axes are scaled analytically. This measures the residual: the ellipse extent against the exact image of the same box,
 * and what a hypothetical per-bubble Jacobian flattening would add, in CSS pixels.
 *   node docs/m643/tools/coupling-analysis.mjs [outJson]
 */
import { writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const root = new URL('../../../', import.meta.url).pathname;
const { module: v } = await runnerImport(`${root}src/model/experimental/jelly-visual.ts`);
const rows = [];
for (const [w, h] of [[80, 32], [160, 44], [320, 96]]) for (const pose of [0.0417, 0.0733, 0.15, -0.0155, -0.0067]) for (const contact of [{ x: 0.5, y: 0.5 }, { x: 0.95, y: 0.25 }]) {
  const g = { width: w, height: h, pose, contact }, short = Math.min(w, h);
  const spread = 0.13 + 0.38 * 0.55; // default roughness
  // what renderMotion draws
  const center = v.surfacePoint(g, w * 0.36, h * 0.11), dy = v.surfacePoint(g, w * 0.36, h * 0.11 + 1).y - center.y;
  const drawn = { rx: w * 0.55 * (1 + pose * 0.1), ry: h * spread * dy };
  // exact image of the rest-state box: horizontal extent at the highlight centre line, vertical extent through the map
  const left = v.surfacePoint(g, w * 0.36 - w * 0.55, h * 0.11), right = v.surfacePoint(g, w * 0.36 + w * 0.55, h * 0.11);
  const top = v.surfacePoint(g, w * 0.36, h * 0.11 - h * spread), bottom = v.surfacePoint(g, w * 0.36, h * 0.11 + h * spread);
  const exact = { rx: (right.x - left.x) / 2, ry: (bottom.y - top.y) / 2 };
  // hypothetical inclusion flattening at the label-free corners where inclusions sit (radius 6 px max)
  const k = 0.7 * pose * short / w;
  const worstScale = Math.max(...[[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.5, 0.15]].map(([fx, fy]) => {
    const sx = 1 + k * Math.sin(Math.PI * fy), comp = 2 * pose * short / h * (0.65 + 0.35 * Math.exp(-4 * (fx - contact.x) ** 2)), sy = 1 - comp;
    return Math.abs(1 - sx) > Math.abs(1 - sy) ? Math.abs(1 - sx) : Math.abs(1 - sy);
  }));
  rows.push({ size: `${w}x${h}`, pose, contact: `${contact.x},${contact.y}`, highlightRxErrPx: +Math.abs(drawn.rx - exact.rx).toFixed(3), highlightRyErrPx: +Math.abs(drawn.ry - exact.ry).toFixed(3), bubbleFlattenPx: +(worstScale * 6).toFixed(3), bubbleFlattenPct: +(worstScale * 100).toFixed(1) });
}
const rest = v.surfacePoint({ width: 160, height: 44, pose: 0, contact: { x: 0.9, y: 0.1 } }, 37.5, 12.25);
const worst = (key) => Math.max(...rows.map((r) => r[key]));
const summary = { restIsIdentity: rest.x === 37.5 && rest.y === 12.25, worstHighlightRxErrPx: worst('highlightRxErrPx'), worstHighlightRyErrPx: worst('highlightRyErrPx'), worstBubbleFlattenPx: worst('bubbleFlattenPx'),
  worstBubbleFlattenPxAtStandardPoses: Math.max(...rows.filter((r) => r.pose <= 0.0733).map((r) => r.bubbleFlattenPx)) };
console.table(rows.filter((r) => r.contact === '0.5,0.5'));
console.log(summary);
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({ summary, rows }, null, 2)}\n`);
