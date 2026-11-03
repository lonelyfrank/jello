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

/**
 * Every module reachable from `entry` (relative paths) and every bare package imported.
 * `dynamic: false` follows static imports only: what is linked into the entry's own chunk.
 */
function graph(entry: string, { dynamic = true }: { dynamic?: boolean } = {}) {
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
      if (m[2] !== undefined && !dynamic) continue;
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

  it('never reaches the experimental Jelly modules, statically or dynamically', () => {
    expect(g.files.filter((f) => f.includes('/experimental/'))).toEqual([]);
  });

  it('the WebGL2 backend is reached only through a dynamic import', () => {
    const index = readFileSync(join(repo, 'src/runtime/scene.ts'), 'utf8');
    expect(index).toMatch(/import\('\.\/webgl2\/scene-view'\)/);
    expect(index).not.toMatch(/^import .*webgl2/m);
  });
});

describe('other boundaries', () => {
  it('experimental Jelly model reaches only pure model/descriptors and stays outside every production entry', () => {
    const g = graph('src/model/experimental/jelly-presets.ts');
    for (const f of g.files) expect(f, f).toMatch(/^src\/(core\/(descriptors|params)\.ts|model\/)/);
    expect(g.packages).toEqual(['zod']);
    for (const entry of ['src/model/index.ts', 'src/runtime/index.ts', 'src/export/adapters.ts', 'src/export/package.ts']) {
      expect(graph(entry).files.filter((f) => f.includes('/experimental/')), entry).toEqual([]);
    }
  });

  it('private Jelly fixture and experimental renderer stay out of every production entry; visual calculations stay pure', () => {
    const fixture = graph('tests/fixtures/jelly/main.ts');
    expect(fixture.files).toContain('src/runtime/experimental/jelly.ts');
    for (const f of [...graph('src/model/experimental/jelly-visual.ts').files, ...graph('src/model/experimental/jelly-motion.ts').files]) expect(f, f).toMatch(/^src\/(model|core)\//);
    for (const f of graph('src/runtime/experimental/jelly.ts').files) expect(f, f).not.toMatch(/^tests\/|src\/(lab|stage|preview)\//);
    for (const entry of ['src/core/index.ts', 'src/model/index.ts', 'src/runtime/index.ts', 'src/preview/main.ts', 'src/export/adapters.ts']) {
      expect(graph(entry).files.filter((f) => f.includes('/experimental/') || f.startsWith('tests/fixtures/')), entry).toEqual([]);
    }
    expect(graph('src/lab/main.tsx').files.filter((f) => f.startsWith('tests/fixtures/'))).toEqual([]);
    const vite = readFileSync(join(repo, 'vite.config.ts'), 'utf8');
    expect(vite).not.toMatch(/fixtures\/jelly|runtime\/experimental/);
  });
});

/**
 * M6.4: the Studio MAY use Jelly, but only through one explicit, lazy door. These tests pin the door:
 * what the lab can reach, how, and what the experimental Studio code is allowed to reach in return.
 */
describe('experimental Jelly Studio boundary (M6.4)', () => {
  /** The only Studio modules allowed to name an experimental module, and only with import(). StudioLibrary (M6.4.1) loads the live Jello preview of a catalog card, only when the Jello family is chosen. */
  const DOORS = ['src/lab/app/App.tsx', 'src/lab/app/BuilderJellyTrial.tsx', 'src/lab/app/StudioLibrary.tsx'];
  const EXPERIMENTAL = /^src\/(lab\/experimental|model\/experimental|runtime\/experimental)\//;

  it('the Studio entry links no Jelly module into its own chunk: the startup path is Jelly-free', () => {
    const startup = graph('src/lab/main.tsx', { dynamic: false });
    expect(startup.files.filter((f) => f.includes('/experimental/'))).toEqual([]);
  });

  it('the lab reaches Jelly only through the authorised dynamic imports', () => {
    const all = graph('src/lab/main.tsx');
    expect(all.files.some((f) => f.startsWith('src/lab/experimental/jelly/'))).toBe(true);
    const outside = all.files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx')).filter((f) => !EXPERIMENTAL.test(f));
    const importers = outside.filter((f) => [...strip(readFileSync(join(repo, f), 'utf8')).matchAll(IMPORT)].some((m) => /\/experimental\//.test(m[1] ?? m[2] ?? m[3] ?? '')));
    expect(importers.sort()).toEqual([...DOORS].filter((d) => existsSync(join(repo, d))).sort());
    for (const f of importers) {
      const matches = [...strip(readFileSync(join(repo, f), 'utf8')).matchAll(IMPORT)].filter((m) => /\/experimental\//.test(m[1] ?? m[2] ?? m[3] ?? ''));
      for (const m of matches) expect(m[2], `${f} deve importare Jelly solo con import()`).toBeDefined();
    }
  });

  it('every experimental Studio module imports only models, the experimental runtime, a few Studio building blocks and React', () => {
    const dir = 'src/lab/experimental/jelly';
    const files = readdirSync(join(repo, dir)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${dir}/${f}`);
    expect(files.length).toBeGreaterThan(8);
    const STUDIO = /^src\/lab\/(session|store|studio-preferences)\.ts$|^src\/lab\/app\/(PanelResize|ParamField|StudioNav|ui)\.tsx$/;
    for (const f of files) {
      for (const m of strip(readFileSync(join(repo, f), 'utf8')).matchAll(IMPORT)) {
        const spec = m[1] ?? m[2] ?? m[3]!;
        if (!spec.startsWith('.')) { expect(['react', 'react-dom', 'zod', 'fake-indexeddb'], `${f} → ${spec}`).toContain(spec.split('/')[0]); continue; }
        const target = relative(repo, resolveImport(join(repo, f), spec) ?? '');
        const ok = /^src\/(core|model|components)\//.test(target) || /^src\/runtime\/(experimental\/|material-types\.ts$)/.test(target) || target === 'src/export/zip.ts' || target.startsWith(`${dir}/`) || STUDIO.test(target) || target === 'src/model/experimental/jelly.ts';
        expect(ok, `${f} → ${target}`).toBe(true);
      }
    }
  });

  it('the experimental Studio never imports the production material runtime, the stage or the preview directly', () => {
    const g = graph('src/runtime/experimental/index.ts');
    expect(g.files.filter((f) => /^src\/runtime\/(materials|glass-group|solid-group|scene|surface-binding|components|button|index)/.test(f))).toEqual([]);
  });

  it('the experimental repository, package builder and models are pure (no DOM renderer, no React)', () => {
    for (const entry of ['src/lab/experimental/jelly/package.ts', 'src/lab/experimental/jelly/inspector-model.ts', 'src/lab/experimental/jelly/workbench.ts']) {
      const g = graph(entry);
      for (const f of g.files) expect(f, `${entry} → ${f}`).toMatch(/^src\/(core|model|components|export\/zip|lab\/experimental\/jelly\/)/);
      expect(g.packages.sort(), entry).toEqual(['zod']);
    }
  });

  it('the experimental runtime bundle entry is standalone: runtime and models only, nothing of the Studio', () => {
    const g = graph('src/runtime/experimental/index.ts');
    for (const f of g.files) expect(f, f).toMatch(/^src\/(core|model|runtime\/(experimental\/|material-types\.ts$))/);
    expect(g.packages).toEqual(['zod']);
  });

  it('the stable repository, project and export formats do not know about Jelly', () => {
    for (const f of ['src/lab/storage/repository.ts', 'src/lab/storage/autosave.ts', 'src/project/document.ts', 'src/project/package.ts', 'src/project/importer.ts', 'src/export/package.ts', 'src/export/adapters.ts', 'src/model/registry.ts']) {
      expect(strip(readFileSync(join(repo, f), 'utf8')), f).not.toMatch(/experimental|jelly/i);
    }
    // Jelly stays a planned family in the catalogue: not available, no editor, no registered material.
    const families = strip(readFileSync(join(repo, 'src/model/families.ts'), 'utf8'));
    expect(families).not.toMatch(/experimental/);
    expect(families).toMatch(/id: 'jelly'[^}]*status: 'planned'/);
  });

  it('the production library build does not contain Jelly (when present)', () => {
    const lib = join(repo, 'dist-lib');
    if (!existsSync(join(lib, 'manifest.json'))) return;
    const manifest = JSON.parse(readFileSync(join(lib, 'manifest.json'), 'utf8')) as { files: string[] };
    for (const f of manifest.files.filter((x) => /\.(js|css)$/.test(x))) expect(readFileSync(join(lib, f), 'utf8'), f).not.toMatch(/jelly-decoration|ExperimentalJelly|jelly-surface/);
  });

  it('the built Studio keeps the Jelly renderer in a lazy chunk, not in the entry chunk (when present)', () => {
    const assets = join(repo, 'dist/assets');
    if (!existsSync(assets)) return;
    const js = readdirSync(assets).filter((f) => f.endsWith('.js'));
    const withJelly = js.filter((f) => readFileSync(join(assets, f), 'utf8').includes('jelly-decoration'));
    if (!withJelly.length) return; // a build from before M6.4
    expect(withJelly.filter((f) => /^lab-/.test(f)), 'il chunk di ingresso contiene il renderer Jelly').toEqual([]);
    const entry = js.find((f) => /^lab-/.test(f));
    if (entry) expect(readFileSync(join(assets, entry), 'utf8')).toMatch(/import\(["'`]\.\/[^"'`]*JellyMain|import\(["'`]\.\/Jelly/);
  });

  it('the experimental runtime build is separate from the production one and has no framework (when present)', () => {
    const dir = join(repo, 'dist-jelly');
    if (!existsSync(join(dir, 'manifest.json'))) return;
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as { files: string[]; experimental: boolean };
    expect(manifest.experimental).toBe(true);
    for (const f of manifest.files.filter((x) => x.endsWith('.js'))) {
      const code = readFileSync(join(dir, f), 'utf8');
      expect(code, f).not.toMatch(/from\s*["']react/);
      expect(code, f).not.toMatch(/src\/lab|tools\/relay|jello-lab/);
    }
  });
});

describe('other boundaries', () => {
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

/** M6.4.1: the catalog is lab-only metadata; the exportable runtime carries at most the preset names it always carried. */
describe('material catalog boundary (M6.4.1)', () => {
  it('the exportable runtime and every export entry reach only the display names, never the catalog', () => {
    for (const entry of ['src/runtime/index.ts', 'src/export/adapters.ts', 'src/export/package.ts', 'src/core/index.ts']) {
      const files = graph(entry).files;
      expect(files.filter((f) => f.startsWith('src/model/catalog/') && f !== 'src/model/catalog/names.ts'), entry).toEqual([]);
    }
  });

  it('the exportable runtime never carries the experimental Jello vocabulary', () => {
    for (const entry of ['src/runtime/index.ts', 'src/export/adapters.ts', 'src/export/package.ts']) {
      expect(graph(entry).files.filter((f) => f.endsWith('experimental-names.ts')), entry).toEqual([]);
    }
  });

  it('the names module is dependency-free', () => {
    const g = graph('src/model/catalog/names.ts');
    expect(g.files).toEqual(['src/model/catalog/names.ts']);
    expect(g.packages).toEqual([]);
  });

  it('the catalog itself never imports the experimental Jelly model, runtime or Studio', () => {
    const g = graph('src/model/catalog/index.ts');
    expect(g.files.filter((f) => f.includes('/experimental/') || f.startsWith('src/lab/') || f.startsWith('src/runtime/'))).toEqual([]);
  });

  it('the Library views reach the catalog but no experimental module statically', () => {
    for (const entry of ['src/lab/app/StudioLibrary.tsx', 'src/lab/app/Library.tsx', 'src/lab/app/Home.tsx']) {
      const g = graph(entry, { dynamic: false });
      expect(g.files).toContain(entry === 'src/lab/app/Home.tsx' ? 'src/model/catalog/index.ts' : 'src/lab/app/catalog-ui.ts');
      expect(g.files.filter((f) => f.includes('/experimental/')), entry).toEqual([]);
    }
  });
});
