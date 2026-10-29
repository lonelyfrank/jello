import { defineConfig } from 'vite';

/**
 * Library build of the runtime (src/runtime/index.ts) → dist-lib/.
 *   jello.js            ESM entry (model, DOM backends, lazy WebGL2 loader)
 *   chunks/*.js         WebGL2 backend, fetched on the first createSceneView()
 *   jello.css           runtime CSS (surfaces, paths, accessibility fallbacks)
 *   types/              declarations (tsc -p tsconfig.lib.json)
 * Nothing from src/lab, React or the sync relay may end up here
 * (tests/unit/boundaries.test.ts checks the sources and this output).
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-lib',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: 'src/runtime/index.ts',
      formats: ['es'],
      fileName: () => 'jello.js',
      cssFileName: 'jello',
    },
    rolldownOptions: {
      output: { chunkFileNames: 'chunks/[name]-[hash].js' },
    },
  },
});
