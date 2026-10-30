#!/usr/bin/env node
/**
 * Exports a React package with the same adapter the lab uses
 * (src/export/adapters.ts → component-react) and installs it in the
 * independent consumer project examples/react-consumer, then typechecks and
 * builds that project with its own toolchain.
 *
 *   node scripts/prepare-consumer.mjs                     Bottom Navigation template + a fourth tab added "in the builder"
 *   node scripts/prepare-consumer.mjs --component x.json  a component exported from the builder
 *   --skip-build                                          export and install only
 *
 * Run `npm run build:lib` first (npm run consumer:prepare does).
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runnerImport } from 'vite';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const repo = resolve(new URL('..', import.meta.url).pathname);
const lib = join(repo, 'dist-lib');
const app = join(repo, 'examples/react-consumer');
if (!existsSync(join(lib, 'manifest.json'))) throw new Error('dist-lib mancante: esegui npm run build:lib');

const { module: adapters } = await runnerImport(join(repo, 'src/export/adapters.ts'));
const { module: c } = await runnerImport(join(repo, 'src/components/index.ts'));

let component;
const file = opt('component');
if (file) {
  const r = c.parseComponentText(readFileSync(file, 'utf8'));
  if (!r.ok) throw new Error(`Componente non valida:\n${r.errors.join('\n')}`);
  component = r.doc;
} else {
  // The edits of the builder walkthrough: a fourth tab with its own icon and value, a custom SVG icon, a taller bar.
  const doc = c.componentTemplate('bottom-navigation').create();
  const added = c.addTab(doc.root, { label: 'Settings', icon: { kind: 'builtin', name: 'settings' } });
  let root = c.updateTab(added.root, added.id, { value: '/settings' });
  const icon = c.iconFromSvg('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>', 'dot.svg');
  root = c.updateTab(root, 'explore', { icon: icon.icon });
  root = c.setRootField(root, 'layout.height', 66);
  component = { ...doc, root };
}

const manifest = JSON.parse(readFileSync(join(lib, 'manifest.json'), 'utf8'));
const runtime = { version: manifest.version, files: manifest.files.map((path) => ({ path, data: new Uint8Array(readFileSync(join(lib, path))) })) };
const result = await adapters.componentReactAdapter.build({ component, runtime, now: opt('now') });

const vendor = join(app, 'vendor');
const out = join(vendor, result.root);
rmSync(out, { recursive: true, force: true });
for (const f of result.files) {
  const p = join(vendor, f.path);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, f.data);
}
writeFileSync(join(vendor, 'exported.jello-component.json'), c.serializeComponent(component) + '\n');
console.log(`${result.root}: ${result.files.length} file in ${out}`);

const run = (cmd) => execSync(cmd, { cwd: app, stdio: 'inherit' });
// A real install: the package is a dependency like any other (file:), React comes from the registry/cache.
run('npm install --no-audit --no-fund --loglevel=error');
// npm copies file: dependencies only on the first install; refresh it so a new export is picked up.
run(`npm install --no-audit --no-fund --loglevel=error --install-links ./vendor/${result.root}`);
if (!args.includes('--skip-build')) {
  run('npx tsc --noEmit');
  run('npx vite build');
}
process.exit(0);
