#!/usr/bin/env node
/**
 * Exports a React package with the same adapter the lab uses
 * (src/export/adapters.ts → component-react) and installs it in the
 * independent consumer project examples/react-consumer, then typechecks and
 * builds that project with its own toolchain.
 *
 *   node scripts/prepare-consumer.mjs                     Mobile Navbar template + a fourth tab added "in the builder",
 *                                                         plus two Buttons (a Glass action and a Solid link) exported the same way
 *   node scripts/prepare-consumer.mjs --component x.json  a component exported from the builder (no extra buttons)
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
/** Components installed next to the main one: the Button, on both materials, exported by the same adapter. */
const extras = [];
const file = opt('component');
if (file) {
  const r = c.parseDefinitionText(readFileSync(file, 'utf8'));
  if (!r.ok) throw new Error(`Componente non valida:\n${r.errors.join('\n')}`);
  component = r.doc;
} else {
  // The edits of the builder walkthrough: a fourth tab with its own icon and value, a custom SVG icon, a taller bar.
  const doc = c.componentTemplate('mobile-navbar').create();
  const added = c.addTab(c.navbarView(doc), { label: 'Settings', icon: { kind: 'builtin', name: 'settings' } });
  let root = c.updateTab(added.root, added.id, { value: '/settings' });
  const icon = c.iconFromSvg('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="currentColor"/></svg>', 'dot.svg');
  root = c.updateTab(root, 'explore', { icon: icon.icon });
  root = c.setRootField(root, 'layout.height', 66);
  component = c.applyNavbarView(doc, root);
  const button = c.componentTemplate('button').create();
  extras.push({ file: 'exported-button-action.jello-component.json', doc: { ...button, name: 'Call to action' } });
  let link = c.switchMaterialFamily({ ...button, name: 'Solid link' }, 'solid').definition;
  link = c.setButtonField(link, 'style.variant', 'secondary');
  link = c.setButtonLink(link, 'link', '/docs');
  extras.push({ file: 'exported-button-link.jello-component.json', doc: link });
}

const manifest = JSON.parse(readFileSync(join(lib, 'manifest.json'), 'utf8'));
const runtime = { version: manifest.version, files: manifest.files.map((path) => ({ path, data: new Uint8Array(readFileSync(join(lib, path))) })) };
const vendor = join(app, 'vendor');
const install = [];
const exportInto = async (comp, jsonName) => {
  const result = await adapters.componentReactAdapter.build({ component: comp, runtime, now: opt('now') });
  rmSync(join(vendor, result.root), { recursive: true, force: true });
  for (const f of result.files) {
    const p = join(vendor, f.path);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, f.data);
  }
  writeFileSync(join(vendor, jsonName), c.serializeDefinition(comp) + '\n');
  console.log(`${result.root}: ${result.files.length} file in ${join(vendor, result.root)}`);
  install.push(result.root);
  return result;
};
await exportInto(component, 'exported.jello-component.json');
for (const e of extras) await exportInto(e.doc, e.file);

const run = (cmd) => execSync(cmd, { cwd: app, stdio: 'inherit' });
// A real install: the package is a dependency like any other (file:), React comes from the registry/cache.
run('npm install --no-audit --no-fund --loglevel=error');
// npm copies file: dependencies only on the first install; refresh it so a new export is picked up.
for (const root of install) run(`npm install --no-audit --no-fund --loglevel=error --install-links ./vendor/${root}`);
// The exported sources are part of the project's own typecheck.
const tsconfigPath = join(app, 'tsconfig.json');
const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf8'));
tsconfig.include = ['src', ...install.map((root) => `vendor/${root}/src`)];
writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
if (!args.includes('--skip-build')) {
  run('npx tsc --noEmit');
  run('npx vite build');
}
process.exit(0);
