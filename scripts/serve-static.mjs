#!/usr/bin/env node
/** Tiny static server for the examples and unpacked packages (no dependencies). */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 4175);
const host = process.argv[4] ?? '127.0.0.1';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.ts': 'text/plain; charset=utf-8',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
  let file = normalize(join(root, path));
  if (!file.startsWith(root)) {
    res.statusCode = 403;
    return res.end();
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) {
    res.statusCode = 404;
    return res.end('not found');
  }
  res.setHeader('content-type', TYPES[extname(file)] ?? 'application/octet-stream');
  res.setHeader('cache-control', 'no-store');
  createReadStream(file).pipe(res);
}).listen(port, host, () => console.log(`http://${host}:${port}/ → ${root}`));
