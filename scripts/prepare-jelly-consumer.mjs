#!/usr/bin/env node
/**
 * Builds the experimental Jelly packages with the code the Studio uses
 * (src/lab/experimental/jelly/package.ts) and the built experimental runtime (dist-jelly),
 * and unpacks them where an external consumer would put them:
 *
 *   node scripts/prepare-jelly-consumer.mjs [--out examples/jelly-consumer] [--material file.jelly.json] [--now ISO]
 *
 * Without --material, one package per candidate preset. Serve with `npm run jelly-consumer:serve`
 * and open /<package>/example/. Run `npm run build:jelly` first (npm run jelly-consumer:prepare does).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runnerImport } from 'vite';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const repo = resolve(new URL('..', import.meta.url).pathname);
const lib = join(repo, 'dist-jelly');
if (!existsSync(join(lib, 'manifest.json'))) throw new Error('dist-jelly mancante: esegui npm run build:jelly');

const { module: pkg } = await runnerImport(join(repo, 'src/lab/experimental/jelly/package.ts'));
const { module: model } = await runnerImport(join(repo, 'src/model/experimental/jelly.ts'));
const { module: presets } = await runnerImport(join(repo, 'src/model/experimental/jelly-presets.ts'));

const manifest = JSON.parse(readFileSync(join(lib, 'manifest.json'), 'utf8'));
const runtime = { version: manifest.version, files: manifest.files.map((path) => ({ path, data: new Uint8Array(readFileSync(join(lib, path))) })) };
const file = opt('material');
const docs = file ? [(() => { const r = model.parseExperimentalJellyText(readFileSync(file, 'utf8')); if (!r.ok) throw new Error(`Documento non valido:\n${r.errors.join('\n')}`); return r.doc; })()] : presets.JELLY_CANDIDATE_PRESETS.map((p) => p.doc);

const out = resolve(opt('out', join(repo, 'examples/jelly-consumer')));
for (const doc of docs) {
  const result = await pkg.buildJellyPackage({ doc, runtime, now: opt('now', '2026-01-01T00:00:00.000Z') });
  rmSync(join(out, result.root), { recursive: true, force: true });
  for (const f of result.files) {
    const p = join(out, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.data);
  }
  console.log(`${result.root}: ${result.files.length} file in ${out}`);
  for (const w of result.warnings) console.log(`avviso: ${w}`);
}
