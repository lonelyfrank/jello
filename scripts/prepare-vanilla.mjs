#!/usr/bin/env node
/** Build independent HTML consumers from the same adapters the Studio offers. */
import { desktopConsumerFixture } from './desktop-consumer-fixture.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runnerImport } from 'vite';

const repo = resolve(new URL('..', import.meta.url).pathname);
const app = join(repo, 'examples/vanilla-consumer');
const { module: adapters } = await runnerImport(join(repo, 'src/export/adapters.ts'));
const { module: components } = await runnerImport(join(repo, 'src/components/index.ts'));
const { module: model } = await runnerImport(join(repo, 'src/model/index.ts'));
const manifest = JSON.parse(readFileSync(join(repo, 'dist-lib/manifest.json'), 'utf8'));
const runtime = { version: manifest.version, files: manifest.files.map((path) => ({ path, data: new Uint8Array(readFileSync(join(repo, 'dist-lib', path))) })) };
const links = [];
const checks = [];
for (const type of ['button', 'mobile-navbar', 'desktop-navbar']) {
  for (const family of ['glass', 'solid']) {
    const base = { ...components.componentTemplate(type).create(), name: `${type} ${family}` };
    const component = type === 'desktop-navbar' ? desktopConsumerFixture(components, family) : components.switchMaterialFamily(base, family).definition;
    const result = await adapters.componentVanillaAdapter.build({ component, runtime, now: '2026-10-30T00:00:00.000Z' });
    for (const f of result.files) { const path = join(app, f.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, f.data); }
    links.push(`<li><a href="${result.root}/example/">${type} ${family}</a></li>`);
    const n = checks.length;
    checks.push(`import { mount as mount${n}, config as config${n} } from './${result.root}/index.js';\nconst instance${n} = mount${n}({ container: document.body }); instance${n}.update(config${n}); instance${n}.unmount(); instance${n}.mount(); instance${n}.destroy();`);
  }
}
const solid = await adapters.materialRuntimeAdapter.build({ material: model.SOLID_PRESETS[0].doc, runtime });
for (const f of solid.files) { const path = join(app, f.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, f.data); }
checks.push(`import { createGroup } from './${solid.root}/index.js'; const group = createGroup(); group.attach(document.body); group.destroy();`);
links.push(`<li><a href="${solid.root}/example/">Materiale Solid</a></li>`);
writeFileSync(join(app, 'index.html'), `<!doctype html><html lang="it"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Jello Vanilla consumers</title><h1>Vanilla consumers</h1><ul>${links.join('')}</ul></html>`);
writeFileSync(join(app, 'typecheck.ts'), checks.join('\n'));
execFileSync(process.execPath, [join(repo, 'node_modules/typescript/lib/tsc.js'), '--ignoreConfig', '--noEmit', '--strict', '--skipLibCheck', '--moduleResolution', 'bundler', '--module', 'esnext', '--target', 'es2022', join(app, 'typecheck.ts')], { stdio: 'inherit' });
console.log('Vanilla: six component packages + Solid material; consumer types passed. No React install or build.');
process.exit(0);
