#!/usr/bin/env node
/** M6.1 data artifacts only. Same module runner as the existing consumer preparation scripts. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runnerImport } from 'vite';

const { module: { JELLY_CANDIDATE_PRESETS } } = await runnerImport(new URL('../src/model/experimental/jelly-presets.ts', import.meta.url).pathname);
const { module: { serializeExperimentalJelly } } = await runnerImport(new URL('../src/model/experimental/jelly.ts', import.meta.url).pathname);
const root = new URL('../docs/examples/jelly/', import.meta.url);
const check = process.argv.includes('--check');
if (!check) mkdirSync(root, { recursive: true });
for (const { doc } of JELLY_CANDIDATE_PRESETS) {
  const url = new URL(`${doc.id}.json`, root);
  const text = serializeExperimentalJelly(doc) + '\n';
  if (check) {
    if (readFileSync(url, 'utf8') !== text) throw new Error(`Esempio non aggiornato: ${url.pathname}`);
  } else writeFileSync(url, text);
}
console.log(`${JELLY_CANDIDATE_PRESETS.length} esempi Jelly ${check ? 'verificati' : 'generati'} dal serializer sperimentale`);
