#!/usr/bin/env node
/**
 * M6.4.2 §7.3/7.5: the mechanical difference between the four Jello candidate presets, computed with the model's own
 * deterministic oscillator (src/model/experimental/jelly-motion.ts, 1 ms canonical grid): no browser, no clock.
 * Scenario: press at t=0, hold 600 ms, release, observe 3 s.
 *   pressPeak      deepest deformation while held (fraction of the short side)
 *   releaseSwing   largest excursion on the OPPOSITE side after release (the "rebound")
 *   restMs         time after release until the oscillator is settled (|x-target|<1e-4, |v|<1e-3)
 */
import { writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const root = new URL('..', import.meta.url).pathname;
const { module: presets } = await runnerImport(`${root}src/model/experimental/jelly-presets.ts`);
const { module: motion } = await runnerImport(`${root}src/model/experimental/jelly-motion.ts`);
const rows = [];
for (const p of presets.JELLY_CANDIDATE_PRESETS) {
  const b = p.doc.behavior;
  let s = motion.initJellyMotion(b, 0);
  s = motion.pressJellyMotion(s, true, 0);
  let peak = 0;
  for (let t = 1; t <= 600; t++) { s = motion.evolveJellyMotion(s, t); peak = Math.max(peak, Math.abs(s.x)); }
  s = motion.pressJellyMotion(s, false, 600);
  let swing = 0, rest = null;
  for (let t = 601; t <= 3600; t++) {
    s = motion.evolveJellyMotion(s, t);
    if (s.x < 0) swing = Math.max(swing, -s.x);
    if (rest === null && motion.jellyMotionSettled(s)) rest = t - 600;
  }
  rows.push({ preset: p.doc.id, responseMs: b.responseMs, dampingRatio: b.dampingRatio, maxDeformation: b.maxDeformation, pressStrength: b.pressStrength, releaseImpulse: b.releaseImpulse, pressPeak: +peak.toFixed(4), releaseSwing: +swing.toFixed(4), restMs: rest });
}
console.table(rows);
writeFileSync(new URL('../docs/m642/jello-motion-metrics.json', import.meta.url), `${JSON.stringify({ model: 'src/model/experimental/jelly-motion.ts', scenario: 'press 0 ms, hold 600 ms, release, observe 3 s, 1 ms grid', rows }, null, 2)}\n`);
