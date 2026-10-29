#!/usr/bin/env node
/**
 * Jello development relay: forwards the lab state to phone previews on the
 * local network. Development only; never part of the runtime or of an
 * export package. No dependencies (node:http).
 *
 *   POST /state?token=T          lab → relay: full state (JSON, ≤ 256 KB)
 *   GET  /events?token=T         preview ← relay: Server-Sent Events; the last
 *                                state is sent again on every (re)connection
 *   PUT  /assets/<sha256>?token  lab → relay: image bytes (checked against the hash)
 *   GET  /assets/<sha256>?token  preview ← relay
 *   GET  /health
 *
 * The relay stores data only in memory, checks sizes and the hash of every
 * asset, and forwards messages without executing anything. Validation of
 * the content (protocol, view, material) happens in the preview.
 *
 *   npm run relay                      # 0.0.0.0:5174
 *   JELLO_RELAY_PORT=6000 npm run relay
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';

export const PROTOCOL = 1;
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;
const SHA = /^[0-9a-f]{64}$/;
const MAX_STATE = 256 * 1024;
const MAX_ASSET = 12 * 1024 * 1024;
const MAX_ASSETS_PER_SESSION = 16;
const MAX_SESSIONS = 32;
const IDLE_MS = 60 * 60 * 1000;

export function createRelay({ log = () => {} } = {}) {
  /** @type {Map<string, { last: string | null, clients: Set<import('node:http').ServerResponse>, assets: Map<string, { type: string, data: Buffer }>, seen: number }>} */
  const sessions = new Map();

  const session = (token, create) => {
    let s = sessions.get(token);
    if (!s && create) {
      if (sessions.size >= MAX_SESSIONS) {
        // Drop the session idle for the longest time.
        const oldest = [...sessions.entries()].sort((a, b) => a[1].seen - b[1].seen)[0];
        if (oldest) close(oldest[0]);
      }
      s = { last: null, clients: new Set(), assets: new Map(), seen: Date.now() };
      sessions.set(token, s);
      log(`sessione ${token.slice(0, 6)}… creata`);
    }
    if (s) s.seen = Date.now();
    return s ?? null;
  };

  const close = (token) => {
    const s = sessions.get(token);
    if (!s) return;
    for (const c of s.clients) c.end();
    sessions.delete(token);
  };

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [t, s] of sessions) if (!s.clients.size && now - s.seen > IDLE_MS) close(t);
    for (const s of sessions.values()) for (const c of s.clients) c.write(': keep-alive\n\n');
  }, 15_000);
  sweep.unref();

  const cors = (res) => {
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-max-age', '600');
  };
  const send = (res, status, body, type = 'application/json') => {
    res.statusCode = status;
    res.setHeader('content-type', type);
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  };
  const readBody = (req, limit) =>
    new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > limit) {
          reject(Object.assign(new Error('corpo troppo grande'), { status: 413 }));
          req.destroy();
        } else chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

  const server = createServer(async (req, res) => {
    cors(res);
    if (req.method === 'OPTIONS') return send(res, 204, '');
    const url = new URL(req.url ?? '/', 'http://relay');
    const token = url.searchParams.get('token') ?? '';
    try {
      if (url.pathname === '/health') return send(res, 200, { ok: true, protocol: PROTOCOL, sessions: sessions.size });
      if (!TOKEN.test(token)) return send(res, 401, { ok: false, error: 'token mancante o non valido' });

      if (url.pathname === '/state' && req.method === 'POST') {
        const body = (await readBody(req, MAX_STATE)).toString('utf8');
        let msg;
        try {
          msg = JSON.parse(body);
        } catch {
          return send(res, 400, { ok: false, error: 'JSON non valido' });
        }
        if (msg?.type !== 'state' || msg?.protocol !== PROTOCOL || !Number.isInteger(msg?.seq)) {
          return send(res, 400, { ok: false, error: `atteso un messaggio "state" del protocollo ${PROTOCOL}` });
        }
        const s = session(token, true);
        // One line of JSON: SSE framing never depends on how the client formatted it.
        s.last = JSON.stringify(msg);
        for (const c of s.clients) c.write(`event: state\nid: ${msg.seq}\ndata: ${s.last}\n\n`);
        return send(res, 200, { ok: true, previews: s.clients.size });
      }

      if (url.pathname === '/events' && req.method === 'GET') {
        const s = session(token, true);
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'access-control-allow-origin': '*' });
        res.write(`retry: 2000\n\n`);
        if (s.last) res.write(`event: state\ndata: ${s.last}\n\n`);
        s.clients.add(res);
        log(`anteprima collegata (${s.clients.size})`);
        req.on('close', () => {
          s.clients.delete(res);
          log(`anteprima scollegata (${s.clients.size})`);
        });
        return;
      }

      const asset = /^\/assets\/([0-9a-f]+)$/.exec(url.pathname);
      if (asset) {
        const hash = asset[1];
        if (!SHA.test(hash)) return send(res, 400, { ok: false, error: 'hash SHA-256 atteso' });
        if (req.method === 'PUT') {
          const data = await readBody(req, MAX_ASSET);
          if (createHash('sha256').update(data).digest('hex') !== hash) return send(res, 400, { ok: false, error: 'hash non corrispondente' });
          const s = session(token, true);
          if (!s.assets.has(hash) && s.assets.size >= MAX_ASSETS_PER_SESSION) s.assets.delete(s.assets.keys().next().value);
          const type = String(req.headers['content-type'] ?? 'application/octet-stream');
          if (!/^image\//.test(type)) return send(res, 415, { ok: false, error: 'solo immagini' });
          s.assets.set(hash, { type, data });
          return send(res, 200, { ok: true });
        }
        if (req.method === 'GET') {
          const a = session(token, false)?.assets.get(hash);
          if (!a) return send(res, 404, { ok: false, error: 'asset non trovato' });
          res.setHeader('cache-control', 'private, max-age=3600');
          return send(res, 200, a.data, a.type);
        }
      }
      return send(res, 404, { ok: false, error: 'percorso sconosciuto' });
    } catch (e) {
      return send(res, e.status ?? 500, { ok: false, error: e.message });
    }
  });

  server.on('close', () => {
    clearInterval(sweep);
    for (const t of [...sessions.keys()]) close(t);
  });
  return { server, sessions, close: () => new Promise((r) => server.close(() => r())) };
}

export function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.JELLO_RELAY_PORT ?? 5174);
  const host = process.env.JELLO_RELAY_HOST ?? '0.0.0.0';
  const { server } = createRelay({ log: (m) => console.log(`[relay] ${m}`) });
  server.listen(port, host, () => {
    console.log(`Jello relay (protocollo ${PROTOCOL}) su http://${host}:${port}`);
    const ips = lanAddresses();
    if (ips.length) {
      console.log('Indirizzi raggiungibili dal telefono (stessa rete):');
      for (const ip of ips) console.log(`  relay     http://${ip}:${port}`);
      for (const ip of ips) console.log(`  anteprima http://${ip}:5173/preview.html  (npm run dev; il link completo con token è nel laboratorio)`);
    } else console.log('Nessun indirizzo LAN trovato: il telefono non potrà raggiungere il relay.');
    console.log('Firewall: consenti in ingresso le porte 5173 (Vite) e ' + port + ' (relay), solo sulla rete locale.');
  });
}
