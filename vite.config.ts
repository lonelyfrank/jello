import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vitest/config';

const LIB = new URL('./dist-lib/', import.meta.url).pathname;
const JELLY = new URL('./dist-jelly/', import.meta.url).pathname;

/**
 * Serves the built runtime (dist-lib) next to the lab under runtime/, so the
 * lab can embed it in export packages. Dev: middleware; build: copied into
 * dist/runtime. The lab never aliases the runtime sources for exports.
 */
function runtimeFiles(dir: string = LIB, prefix = 'runtime', build = 'build:lib'): Plugin {
  const manifest = () => {
    const p = join(dir, 'manifest.json');
    return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as { version: string; files: string[] }) : null;
  };
  return {
    name: `jello-${prefix}-files`,
    configureServer(server) {
      server.middlewares.use(`/${prefix}/`, (req, res, next) => {
        const m = manifest();
        const path = decodeURIComponent((req.url ?? '/').split('?')[0]!.slice(1));
        if (!m) {
          res.statusCode = 404;
          res.end(`${dir.split('/').slice(-2)[0]} mancante: esegui npm run ${build}`);
          return;
        }
        if (path !== 'manifest.json' && !m.files.includes(path)) return next();
        const type = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.json') ? 'application/json' : 'text/plain';
        res.setHeader('content-type', type);
        res.end(readFileSync(join(dir, path)));
      });
    },
    writeBundle(options) {
      const m = manifest();
      const out = join(options.dir ?? 'dist', prefix);
      if (!m) {
        this.warn(`${dir.split('/').slice(-2)[0]} mancante: il laboratorio costruito non potrà esportare pacchetti con questo runtime (npm run ${build}).`);
        return;
      }
      for (const f of [...m.files, 'manifest.json']) {
        mkdirSync(dirname(join(out, f)), { recursive: true });
        copyFileSync(join(dir, f), join(out, f));
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [runtimeFiles(), runtimeFiles(JELLY, 'runtime-jelly', 'build:jelly')],
  server: { port: 5173, strictPort: true, host: true },
  preview: { port: 4173, strictPort: true, host: true },
  build: {
    target: 'es2022',
    // Source maps expose the whole source tree: not part of a distributed build. JELLO_SOURCEMAP=1 for debugging a build.
    sourcemap: process.env.JELLO_SOURCEMAP === '1',
    rolldownOptions: {
      input: {
        lab: new URL('./index.html', import.meta.url).pathname,
        preview: new URL('./preview.html', import.meta.url).pathname,
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
