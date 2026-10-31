/**
 * Architectural boundaries. The exportable runtime must never reach the
 * editor, lab storage, the sync relay, the preview pages or React.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repo = resolve(__dirname, '../..');
const IMPORT = /^(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^import\s+['"]([^'"]+)['"]/gm;

/** Code only: comments and template strings (example sources written as text) are not imports. */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``');

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return spec;
  const base = resolve(dirname(from), spec);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** Every module reachable from `entry` (relative paths) and every bare package imported. */
function graph(entry: string) {
  const seen = new Set<string>();
  const packages = new Set<string>();
  const stack = [resolve(repo, entry)];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    if (!/\.tsx?$/.test(f)) continue;
    const src = strip(readFileSync(f, 'utf8'));
    for (const m of src.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2] ?? m[3]!;
      const r = resolveImport(f, spec);
      if (r === null) throw new Error(`import non risolto ${spec} in ${f}`);
      if (r === spec) packages.add(spec.split('/').slice(0, spec.startsWith('@') ? 2 : 1).join('/'));
      else stack.push(r);
    }
  }
  return { files: [...seen].map((f) => relative(repo, f)), packages: [...packages] };
}

describe('runtime boundary', () => {
  const g = graph('src/runtime/index.ts');

  it('reaches only core, model, component model and runtime modules', () => {
    for (const f of g.files) expect(f, f).toMatch(/^src\/(core|model|components|runtime)\//);
  });

  it('imports no framework and no lab-only package', () => {
    expect(g.packages.sort()).toEqual(['zod']);
  });

  it('the WebGL2 backend is reached only through a dynamic import', () => {
    const index = readFileSync(join(repo, 'src/runtime/scene.ts'), 'utf8');
    expect(index).toMatch(/import\('\.\/webgl2\/scene-view'\)/);
    expect(index).not.toMatch(/^import .*webgl2/m);
  });
});

describe('other boundaries', () => {
  it('experimental Jelly reaches only pure model/descriptors and stays outside every production entry', () => {
    const g = graph('src/model/experimental/jelly-presets.ts');
    for (const f of g.files) expect(f, f).toMatch(/^src\/(core\/(descriptors|params)\.ts|model\/)/);
    expect(g.packages).toEqual(['zod']);
    for (const entry of ['src/model/index.ts', 'src/runtime/index.ts', 'src/lab/main.tsx', 'src/export/adapters.ts']) {
      expect(graph(entry).files.filter((f) => f.includes('/experimental/')), entry).toEqual([]);
    }
  });

  it('the phone preview does not load the editor or React', () => {
    const g = graph('src/preview/main.ts');
    expect(g.files.filter((f) => f.startsWith('src/lab/'))).toEqual([]);
    expect(g.packages).not.toContain('react');
    expect(g.packages).not.toContain('react-dom');
  });

  it('the exporter is pure: no DOM stage, no runtime renderer, no lab, no React', () => {
    for (const entry of ['src/export/package.ts', 'src/export/adapters.ts']) {
      const g = graph(entry);
      for (const f of g.files) expect(f, f).toMatch(/^src\/(core|model|components|export)\//);
      expect(g.packages.sort()).toEqual(['zod']);
    }
  });

  it('the component model is pure data: no DOM renderer, no stage, no lab', () => {
    const g = graph('src/components/index.ts');
    for (const f of g.files) expect(f, f).toMatch(/^src\/(core|model|components)\//);
    expect(g.packages.sort()).toEqual(['zod']);
  });

  it('components reach a material only through the material interface', () => {
    const src = readFileSync(join(repo, 'src/runtime/bottom-navigation.ts'), 'utf8');
    expect(src).toMatch(/from '\.\/materials'/);
    expect(src).not.toMatch(/glass-group'|core\/renderer|core\/context/);
  });

  it('the shared stage does not import the editor', () => {
    const g = graph('src/stage/controller.ts');
    expect(g.files.filter((f) => f.startsWith('src/lab/'))).toEqual([]);
    expect(g.packages).not.toContain('react');
  });
});

describe('legacy migration module', () => {
  /** Where a file may reach `src/migration/`: only code that takes data from outside. */
  const ALLOWED = [/^src\/lab\//, /^src\/project\/(importer|package)\.ts$/, /^src\/migration\//];

  function sources(dir: string): string[] {
    return readdirSync(join(repo, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
  }

  it('only the lab and the project importers import it; the runtime, model, exporters, stage and preview never do', () => {
    const importers = sources('src').filter((f) => /from\s*['"](\.\.?\/)+migration(\/[^'"]*)?['"]/.test(strip(readFileSync(join(repo, f), 'utf8'))));
    expect(importers.length).toBeGreaterThan(0);
    for (const f of importers) expect(ALLOWED.some((re) => re.test(f)), f).toBe(true);
  });

  it('nothing the public runtime, the exporters or the templates reach contains an identifier of another application', () => {
    for (const entry of ['src/runtime/index.ts', 'src/export/adapters.ts', 'src/components/index.ts', 'src/stage/controller.ts', 'src/preview/main.ts']) {
      const g = graph(entry);
      expect(g.files.filter((f) => f.startsWith('src/migration/')), entry).toEqual([]);
      for (const f of g.files.filter((x) => /\.tsx?$/.test(x))) {
        expect(strip(readFileSync(join(repo, f), 'utf8')), f).not.toMatch(/['"`](cable|bt|bt-darts)['"`]/);
      }
    }
  });

  it('is only a table and converters: no DOM, no React, no storage', () => {
    const g = graph('src/migration/index.ts');
    for (const f of g.files) expect(f, f).toMatch(/^src\/(core|model|components|migration)\//);
    expect(g.packages.sort()).toEqual(['zod']);
  });
});

describe('built library (when present)', () => {
  const lib = join(repo, 'dist-lib');
  it.skipIf(!existsSync(join(lib, 'manifest.json')))('contains no React, editor, relay or repository paths', () => {
    const files = readdirSync(join(lib, 'chunks')).map((f) => join(lib, 'chunks', f)).concat(join(lib, 'jello.js'));
    for (const f of files.filter((x) => x.endsWith('.js'))) {
      const code = readFileSync(f, 'utf8');
      expect(code, f).not.toMatch(/from\s*["']react/);
      expect(code, f).not.toMatch(/src\/lab|tools\/relay|jello-lab/);
      // Legacy identifiers live in the lab's migration module, never in what a consumer installs.
      expect(code, f).not.toMatch(/["'`](cable|bt-darts)["'`]|jello-component["'`]/);
    }
    const manifest = JSON.parse(readFileSync(join(lib, 'manifest.json'), 'utf8')) as { files: string[] };
    expect(manifest.files.some((f) => f.endsWith('.map'))).toBe(false);
    expect(manifest.files).toContain('types/runtime/index.d.ts');
  });
});
