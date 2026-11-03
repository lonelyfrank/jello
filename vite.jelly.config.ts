import { defineConfig } from 'vite';

/**
 * Build of the EXPERIMENTAL Jelly runtime → dist-jelly/ (separate from dist-lib on purpose:
 * the production library, its manifest and its hashes must not change because of Jelly).
 *   jello-jelly-experimental.js    ESM entry (src/runtime/experimental/index.ts)
 *   jello-jelly-experimental.css   renderer styles
 * The Studio serves it under /runtime-jelly/ for the experimental export package.
 */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist-jelly',
    emptyOutDir: true,
    target: 'es2022',
    cssCodeSplit: false,
    lib: {
      entry: 'src/runtime/experimental/index.ts',
      formats: ['es'],
      fileName: () => 'jello-jelly-experimental.js',
      cssFileName: 'jello-jelly-experimental',
    },
  },
});
