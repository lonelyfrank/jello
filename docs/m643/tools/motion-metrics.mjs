#!/usr/bin/env node
/**
 * M6.4.3 motion metrics with the model's own deterministic oscillator (no browser, no clock), 1 ms grid.
 * Scenario (same as M6.4.2): press at 0 ms, hold 600 ms, release, observe 3 s.
 *   node docs/m643/tools/motion-metrics.mjs [outJson]
 * Rows for A (built-in), B2 (motion candidate) per preset, plus a stress block (repeated presses, extreme valid values).
 */
import { writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const root = new URL('../../../', import.meta.url).pathname;
const { module: variants } = await runnerImport(`${root}tests/fixtures/jelly-m643/variants.ts`);
const { module: motion } = await runnerImport(`${root}src/model/experimental/jelly-motion.ts`);

export function scenario(behavior) {
  let s = motion.pressJellyMotion(motion.initJellyMotion(behavior, 0), true, 0);
  let peak = 0, t90 = null;
  const pressTarget = behavior.pressStrength * behavior.maxDeformation;
  for (let t = 1; t <= 600; t++) { s = motion.evolveJellyMotion(s, t); peak = Math.max(peak, Math.abs(s.x)); if (t90 === null && pressTarget && Math.abs(s.x) >= 0.9 * pressTarget) t90 = t; }
  s = motion.pressJellyMotion(s, false, 600);
  let swing = 0, swingAt = null, rest = null, maxAbsV = 0, finite = true;
  for (let t = 601; t <= 3600; t++) {
    s = motion.evolveJellyMotion(s, t);
    finite &&= Number.isFinite(s.x) && Number.isFinite(s.v);
    maxAbsV = Math.max(maxAbsV, Math.abs(s.v));
    if (s.x < 0 && -s.x > swing) { swing = -s.x; swingAt = t - 600; }
    if (rest === null && motion.jellyMotionSettled(s)) rest = t - 600;
  }
  return { pressPeak: +peak.toFixed(4), pressT90Ms: t90, releaseSwing: +swing.toFixed(4), releaseSwingAtMs: swingAt, restMs: rest, finite, exactRest: s.x === 0 && s.v === 0 };
}
const ids = ['jelly-soft', 'jelly-clear', 'jelly-candy', 'jelly-dense'];
const rows = [];
for (const variant of ['A', 'B2']) for (const id of ids) {
  const b = variants.VARIANTS[variant](id).doc.behavior;
  rows.push({ variant, preset: id, responseMs: b.responseMs, dampingRatio: b.dampingRatio, maxDeformation: b.maxDeformation, releaseImpulse: b.releaseImpulse, ...scenario(b) });
}
// Stress: 40 alternating presses 30 ms apart on the most elastic valid candidate, then rest; energy must stay bounded and settle.
const stress = {};
for (const [name, b] of [['candy-A', variants.VARIANTS.A('jelly-candy').doc.behavior], ['extreme-valid', { ...variants.VARIANTS.A('jelly-candy').doc.behavior, responseMs: 80, dampingRatio: 0.15, maxDeformation: 0.15, releaseImpulse: 1 }]]) {
  let s = motion.initJellyMotion(b, 0), t = 0, maxX = 0, maxV = 0, finite = true;
  for (let i = 0; i < 40; i++) { t += 30; s = motion.pressJellyMotion(s, i % 2 === 0, t); maxX = Math.max(maxX, Math.abs(s.x)); maxV = Math.max(maxV, Math.abs(s.v)); finite &&= Number.isFinite(s.x); }
  s = motion.pressJellyMotion(s, false, t + 1);
  let rest = null;
  for (let k = 1; k <= 60000 && rest === null; k++) { s = motion.evolveJellyMotion(s, t + 1 + k); if (motion.jellyMotionSettled(s)) rest = k; }
  stress[name] = { maxAbsX: +maxX.toFixed(4), limit: b.maxDeformation, maxAbsV: +maxV.toFixed(3), velocityCeiling: +(2 * Math.PI / (b.responseMs / 1000) * b.maxDeformation * 2).toFixed(3), finite, settledAfterMs: rest };
}
console.table(rows);
console.log(stress);
if (process.argv[2]) writeFileSync(process.argv[2], `${JSON.stringify({ model: 'src/model/experimental/jelly-motion.ts', scenario: 'press 0 ms, hold 600 ms, release, observe 3 s, 1 ms grid', rows, stress }, null, 2)}\n`);
