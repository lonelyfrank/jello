#!/usr/bin/env node
/**
 * Writes docs/m643a/review-decisions.json: the decision record as the workspace defines it, with every preset Pending.
 * It records NO decision: only the reviewer can, from the Visual Review (Review Decision → Scarica report JSON).
 *   node docs/m643a/tools/make-decisions.mjs
 */
import { writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';
const root = new URL('../../../', import.meta.url).pathname;
const { module: d } = await runnerImport(`${root}src/lab/experimental/jelly/review/decisions.ts`);
writeFileSync(`${root}docs/m643a/review-decisions.json`, `${JSON.stringify(d.emptyDecisionSet(), null, 2)}\n`);
console.log('docs/m643a/review-decisions.json written (all pending)');
