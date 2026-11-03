import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { unzip } from '../../src/export/zip';
import { JELLY_RUNTIME_CSS, JELLY_RUNTIME_ENTRY, buildJellyPackage, jellyPackageRoot, jellyPackageZip, type JellyRuntimeBundle } from '../../src/lab/experimental/jelly/package';
import { parseExperimentalJelly, parseExperimentalJellyText } from '../../src/model/experimental/jelly';
import { presetDoc } from '../../src/lab/experimental/jelly/workbench';

const enc = new TextEncoder();
const runtime: JellyRuntimeBundle = { version: '0.3.0', files: [{ path: 'jello-jelly-experimental.js', data: enc.encode('export const a=1;') }, { path: 'jello-jelly-experimental.css', data: enc.encode('.jelly-surface{}') }] };
const now = '2026-11-02T10:00:00.000Z';

describe('experimental Jelly package', () => {
  it('contains the validated document, runtime, styles, manifest, instructions and a Button example', async () => {
    const r = await buildJellyPackage({ doc: presetDoc('jelly-candy')!, runtime, now });
    const paths = r.files.map((f) => f.path.slice(r.root.length + 1)).sort();
    expect(paths).toEqual(['README.md', 'example/index.html', 'example/main.js', 'jelly.json', 'manifest.json', JELLY_RUNTIME_ENTRY, JELLY_RUNTIME_CSS].sort());
    expect(r.root).toBe('jello-jelly-jelly-candy');
    const doc = JSON.parse(new TextDecoder().decode(r.files.find((f) => f.path.endsWith('/jelly.json'))!.data));
    expect(parseExperimentalJelly(doc).ok).toBe(true);
    expect(doc.family).toBe('jelly');
  });

  it('is deterministic and its manifest hashes match the bytes', async () => {
    const a = await buildJellyPackage({ doc: presetDoc('jelly-soft')!, runtime, now });
    const b = await buildJellyPackage({ doc: presetDoc('jelly-soft')!, runtime, now });
    expect(jellyPackageZip(a)).toEqual(jellyPackageZip(b));
    for (const entry of a.manifest.files) {
      const bytes = a.files.find((f) => f.path === `${a.root}/${entry.path}`)!.data;
      expect(createHash('sha256').update(bytes).digest('hex'), entry.path).toBe(entry.sha256);
      expect(bytes.length).toBe(entry.bytes);
    }
  });

  it('round-trips through the zip writer', async () => {
    const r = await buildJellyPackage({ doc: presetDoc('jelly-clear')!, runtime, now });
    const files = unzip(jellyPackageZip(r));
    expect(files.map((f) => f.path).sort()).toEqual(r.files.map((f) => f.path).sort());
  });

  it('declares exactly what is and is not supported, and never claims WebGL2, Android or a volumetric simulation', async () => {
    const r = await buildJellyPackage({ doc: presetDoc('jelly-soft')!, runtime, now });
    expect(r.manifest).toMatchObject({ format: 'jello-jelly-experimental-package', experimental: true, runtime: { types: null }, backends: { supported: ['svg', 'css'] } });
    expect(r.manifest.backends.unsupported).toEqual(expect.arrayContaining(['webgl2', 'android-native', 'volumetric-simulation']));
    const readme = new TextDecoder().decode(r.files.find((f) => f.path.endsWith('README.md'))!.data);
    expect(readme).toMatch(/SPERIMENTALE/);
    expect(readme).toMatch(/Non supportato/);
    expect(readme).not.toMatch(/WebGL2 (è )?supportato|supporto Android nativo:|simulazione volumetrica completa/i);
  });

  it('refuses an invalid document or an incomplete runtime and produces nothing', async () => {
    const bad = presetDoc('jelly-soft')!;
    bad.bubbles.radiusMin = 11;
    await expect(buildJellyPackage({ doc: bad, runtime, now })).rejects.toThrow(/non valido/);
    await expect(buildJellyPackage({ doc: presetDoc('jelly-soft')!, runtime: { version: '0.3.0', files: [runtime.files[0]!] }, now })).rejects.toThrow(/incompleto/);
    await expect(buildJellyPackage({ doc: presetDoc('jelly-soft')!, runtime: { version: '0.3.0', files: [...runtime.files, { path: '../src/x.js', data: enc.encode('') }] }, now })).rejects.toThrow(/non ammesso/);
  });

  it('keeps ids filesystem-safe', () => {
    expect(jellyPackageRoot({ ...presetDoc('jelly-soft')!, id: 'a b/c' })).toBe('jello-jelly-a-b-c');
  });

  it.skipIf(!existsSync(join(__dirname, '../../dist-jelly/manifest.json')))('ships the real built runtime, byte for byte, with no framework', async () => {
    const dir = join(__dirname, '../../dist-jelly');
    const m = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { version: string; files: string[] };
    const real: JellyRuntimeBundle = { version: m.version, files: m.files.map((path) => ({ path, data: new Uint8Array(readFileSync(join(dir, path))) })) };
    const r = await buildJellyPackage({ doc: presetDoc('jelly-soft')!, runtime: real, now });
    const js = r.files.find((f) => f.path.endsWith('.js') && f.path.includes('runtime/'))!;
    expect(js.data).toEqual(real.files.find((f) => f.path.endsWith('.js'))!.data);
    const code = new TextDecoder().decode(js.data);
    expect(code).toMatch(/jelly-decoration/);
    expect(code).not.toMatch(/from\s*["']react/);
    expect(parseExperimentalJellyText(new TextDecoder().decode(r.files.find((f) => f.path.endsWith('jelly.json'))!.data)).ok).toBe(true);
  });
});
