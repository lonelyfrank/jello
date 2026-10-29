#!/usr/bin/env node
/**
 * Builds an export package with the same code the lab uses
 * (src/export/package.ts) and the built library (dist-lib), then unpacks it
 * where a consumer would put it:
 *
 *   node scripts/prepare-example.mjs                         → examples/navbar-bt/jello/  (built-in "navbar")
 *   node scripts/prepare-example.mjs --material file.json --out dir [--kind css-only] [--zip out.zip]
 *
 * The example then imports ./jello/runtime/jello.js: the built artifact, not
 * the lab sources. Run `npm run build:lib` first (npm run example:prepare does).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runnerImport } from 'vite';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const repo = resolve(new URL('..', import.meta.url).pathname);
const lib = join(repo, 'dist-lib');
if (!existsSync(join(lib, 'manifest.json'))) throw new Error('dist-lib mancante: esegui npm run build:lib');

const { module: pkg } = await runnerImport(join(repo, 'src/export/package.ts'));
const { module: model } = await runnerImport(join(repo, 'src/model/index.ts'));

let material;
const file = opt('material');
if (file) {
  const r = model.parseMaterialText(readFileSync(file, 'utf8'));
  if (!r.ok) throw new Error(`Materiale non valido:\n${r.errors.join('\n')}`);
  material = r.doc;
} else material = model.builtinMaterial(opt('builtin', 'navbar')).doc;

const manifest = JSON.parse(readFileSync(join(lib, 'manifest.json'), 'utf8'));
const runtime = { version: manifest.version, files: manifest.files.map((path) => ({ path, data: new Uint8Array(readFileSync(join(lib, path))) })) };
const result = await pkg.buildPackage({
  material,
  kind: opt('kind', 'runtime'),
  runtime,
  now: opt('now', undefined),
  resolveAsset: async (url) =>
    url === 'example:tulips'
      ? { data: new Uint8Array(readFileSync(join(repo, 'public/assets/tulips-kuznietsov-cc0.jpg'))), type: 'image/jpeg', name: 'tulips-kuznietsov-cc0.jpg' }
      : null,
});

const out = resolve(opt('out', join(repo, 'examples/navbar-bt/jello')));
rmSync(out, { recursive: true, force: true });
for (const f of result.files) {
  const p = join(out, f.path.slice(result.root.length + 1));
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.data);
}
const zipPath = opt('zip');
if (zipPath) writeFileSync(zipPath, pkg.packageZip(result));
console.log(`${result.root}: ${result.files.length} file in ${out}`);
for (const w of result.warnings) console.log(`avviso: ${w}`);
process.exit(0);
