#!/usr/bin/env node
/**
 * Servers for the Playwright suite, started in order from one process:
 *   1. build the library, the lab, the consumer example package and the
 *      independent React project (sequentially: they share dist-lib);
 *   2. serve the example (4175), the React project (4176) and the relay (5174) on 127.0.0.1;
 *   3. serve the built lab (4173) last: Playwright waits for it.
 */
import { execSync, spawn } from 'node:child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
run('npm run build:lib');
run('npx vite build');
run('node scripts/prepare-example.mjs --now 2026-01-01T00:00:00.000Z');
run('node scripts/prepare-consumer.mjs --now 2026-01-01T00:00:00.000Z');

const children = [
  spawn('node', ['scripts/serve-static.mjs', 'examples/navbar-bt', '4175'], { stdio: 'inherit' }),
  spawn('node', ['scripts/serve-static.mjs', 'examples/react-consumer/dist', '4176'], { stdio: 'inherit' }),
  spawn('node', ['tools/relay/relay.mjs'], { stdio: 'inherit', env: { ...process.env, JELLO_RELAY_HOST: '127.0.0.1', JELLO_RELAY_PORT: '5174' } }),
  spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'inherit' }),
];
const stop = () => {
  for (const c of children) c.kill('SIGTERM');
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
for (const c of children) c.on('exit', (code) => code && stop());
