import { defineConfig } from 'vite';

// No plugins: TSX goes through Vite's built-in transform. The Jello package is a plain dependency.
export default defineConfig({ base: './', build: { target: 'es2022' } });
