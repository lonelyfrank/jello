#!/usr/bin/env node
/** Writes screenshots/<dir>/manifest.json (file, size, sha256 prefix of the pixels' file) for every PNG: a record, not a baseline that updates itself. */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../screenshots/', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = `${dir}/${f}`; return statSync(p).isDirectory() ? walk(p) : p.endsWith('.png') ? [p] : []; });
for (const d of readdirSync(root).filter((n) => statSync(`${root}${n}`).isDirectory())) {
  const files = walk(`${root}${d}`).map((p) => { const b = readFileSync(p); return { file: p.slice(root.length + d.length + 1), bytes: b.length, sha256: createHash('sha256').update(b).digest('hex').slice(0, 16) }; });
  writeFileSync(`${root}${d}/manifest.json`, `${JSON.stringify({ engine: 'chromium', note: 'File names encode variant_size_background_dpr; see docs/m643/tools', files }, null, 2)}\n`);
  console.log(d, files.length);
}
