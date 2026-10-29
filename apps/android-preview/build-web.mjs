#!/usr/bin/env node
/**
 * Builds the lab's preview page (preview.html, no editor) into www/ and makes
 * it the app's start page. Same sources and runtime as the browser preview.
 *
 *   JELLO_PREVIEW_QUERY="relay=http://192.168.1.20:5174&token=…"  start connected
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const here = resolve(new URL('.', import.meta.url).pathname);
const repo = resolve(here, '../..');
const www = join(here, 'www');
rmSync(www, { recursive: true, force: true });
execFileSync('npx', ['vite', 'build', '--outDir', www, '--emptyOutDir'], { cwd: repo, stdio: 'inherit' });
// The app opens index.html: make it the preview page (the editor is not shipped).
copyFileSync(join(www, 'preview.html'), join(www, 'index.html'));
rmSync(join(www, 'preview.html'));
const q = process.env.JELLO_PREVIEW_QUERY;
if (q) {
  const p = join(www, 'index.html');
  const html = readFileSync(p, 'utf8').replace('<head>', `<head>\n    <script>if (!location.search) history.replaceState(null, '', '?${q.replace(/'/g, '')}');</script>`);
  writeFileSync(p, html);
}
console.log(`www/ pronto (anteprima Jello${q ? `, avvio con ${q}` : ''})`);
