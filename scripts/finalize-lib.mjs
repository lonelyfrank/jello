#!/usr/bin/env node
/**
 * After `vite build --config vite.lib.config.ts` and the declaration build:
 * writes dist-lib/package.json (installable with `npm install <path>/dist-lib`)
 * and dist-lib/manifest.json, the list of files an export package embeds.
 * Source maps are left out of the list: they reference repository paths.
 *
 * Declarations: CSS side-effect imports are removed from types/ (a consumer
 * with noUncheckedSideEffectImports would fail on them; the CSS ships as
 * jello.css), and jello.d.ts makes `import … from './runtime/jello.js'` typed.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../dist-lib/', import.meta.url).pathname;
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = /RUNTIME_VERSION = '([^']+)'/.exec(readFileSync(new URL('../src/model/version.ts', import.meta.url), 'utf8'))[1];
if (version !== pkg.version) throw new Error(`RUNTIME_VERSION ${version} ≠ package.json ${pkg.version}`);

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [relative(root, p)];
  });
for (const f of walk(join(root, 'types')).filter((f) => f.endsWith('.d.ts'))) {
  const p = join(root, f);
  const src = readFileSync(p, 'utf8');
  const out = src.replace(/^import\s+['"][^'"]+\.css['"];\n/gm, '');
  if (out !== src) writeFileSync(p, out);
}
writeFileSync(join(root, 'jello.d.ts'), "export * from './types/runtime/index';\n");

const files = walk(root)
  .filter((f) => !f.endsWith('.map') && f !== 'manifest.json' && f !== 'package.json')
  .sort();

writeFileSync(
  join(root, 'package.json'),
  JSON.stringify(
    {
      name: '@jello/runtime',
      version,
      description: 'Jello runtime: Glass material for DOM components (CSS, SVG) and controlled scenes (WebGL2).',
      type: 'module',
      license: pkg.license,
      main: './jello.js',
      types: './jello.d.ts',
      exports: {
        '.': { types: './jello.d.ts', import: './jello.js' },
        './jello.css': './jello.css',
      },
      sideEffects: ['*.css'],
    },
    null,
    2,
  ) + '\n',
);
writeFileSync(join(root, 'manifest.json'), JSON.stringify({ version, files: [...files, 'package.json'] }, null, 2) + '\n');
console.log(`dist-lib: @jello/runtime ${version}, ${files.length + 1} file nel manifest`);
