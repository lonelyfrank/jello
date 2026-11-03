#!/usr/bin/env node
/**
 * After `vite build --config vite.jelly.config.ts`: writes dist-jelly/manifest.json, the list of
 * files an experimental Jelly package embeds (same shape as dist-lib/manifest.json).
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../dist-jelly/', import.meta.url).pathname;
const version = /RUNTIME_VERSION = '([^']+)'/.exec(readFileSync(new URL('../src/model/version.ts', import.meta.url), 'utf8'))[1];
const walk = (dir) => readdirSync(dir).flatMap((name) => { const p = join(dir, name); return statSync(p).isDirectory() ? walk(p) : [relative(root, p)]; });
const files = walk(root).filter((f) => !f.endsWith('.map') && f !== 'manifest.json').sort();
for (const required of ['jello-jelly-experimental.js', 'jello-jelly-experimental.css']) if (!files.includes(required)) throw new Error(`dist-jelly: manca ${required}`);
const sha = Object.fromEntries(files.map((f) => [f, createHash('sha256').update(readFileSync(join(root, f))).digest('hex')]));
writeFileSync(join(root, 'manifest.json'), JSON.stringify({ version, experimental: true, files, sha256: sha }, null, 2) + '\n');
console.log(`dist-jelly: runtime sperimentale ${version}, ${files.length} file`);
