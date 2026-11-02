import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builtinMaterial, serializeMaterial } from '../../src/model';
import { optionsFromQuery } from '../../src/lab/state';
import { decodeState, encodeState, newToken, PROTOCOL, TOKEN_PATTERN } from '../../src/sync/protocol';
// @ts-expect-error plain JS module without declarations
import { createRelay } from '../../tools/relay/relay.mjs';

const view = optionsFromQuery(new URLSearchParams('object=navbar'), false).options;
const material = builtinMaterial('navbar')!.doc;

describe('sync protocol', () => {
  it('round-trips a full state', () => {
    const text = encodeState({ seq: 3, sentAt: 1, material, view, image: null });
    const r = decodeState(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.message.material).toEqual(material);
      expect(r.message.view).toEqual(view);
      expect(r.message.protocol).toBe(PROTOCOL);
    }
  });

  it('refuses newer protocols, invalid views, invalid materials and unreachable images — atomically', () => {
    const base = JSON.parse(encodeState({ seq: 1, sentAt: 1, material, view, image: null }));
    expect(decodeState(JSON.stringify({ ...base, protocol: PROTOCOL + 1 }))).toMatchObject({ ok: false });
    const badView = decodeState(JSON.stringify({ ...base, view: { ...view, object: 'sphere' } }));
    expect(badView.ok).toBe(false);
    const badMaterial = JSON.parse(serializeMaterial(material));
    badMaterial.material.refraction = 1e9;
    const r = decodeState(JSON.stringify({ ...base, material: badMaterial }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/^material: /);
    expect(decodeState(JSON.stringify({ ...base, image: 'blob:http://localhost/abc' })).ok).toBe(false);
    expect(decodeState(JSON.stringify({ ...base, image: 'javascript:alert(1)' })).ok).toBe(false);
    expect(decodeState('{').ok).toBe(false);
    expect(decodeState('x'.repeat(300_000)).ok).toBe(false);
  });

  it('tokens are URL-safe and long enough', () => {
    const t = newToken();
    expect(TOKEN_PATTERN.test(t)).toBe(true);
    expect(newToken()).not.toBe(t);
  });
});

describe('development relay', () => {
  let base = '';
  let relay: { server: import('node:http').Server; close(): Promise<void> };
  const token = newToken();

  beforeAll(async () => {
    relay = createRelay();
    await new Promise<void>((r) => relay.server.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(relay.server.address() as AddressInfo).port}`;
  });
  afterAll(() => relay.close());

  /** Reads Server-Sent Events until `count` "state" events arrived. */
  async function events(count: number, onOpen?: () => Promise<void>) {
    const ctrl = new AbortController();
    const res = await fetch(`${base}/events?token=${token}`, { signal: ctrl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const got: string[] = [];
    if (onOpen) await onOpen();
    while (got.length < count) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (block.startsWith('event: state')) got.push(block.split('\n').find((l) => l.startsWith('data: '))!.slice(6));
      }
    }
    ctrl.abort();
    return got;
  }

  const post = (body: unknown, t = token) =>
    fetch(`${base}/state?token=${t}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

  it('requires a token and a protocol-1 state message', async () => {
    expect((await post({ type: 'state', protocol: 1, seq: 1 }, 'short')).status).toBe(401);
    expect((await post({ type: 'hello' })).status).toBe(400);
    expect((await post('{nope')).status).toBe(400);
  });

  it('forwards the full state and replays the last one on (re)connection', async () => {
    const first = encodeState({ seq: 1, sentAt: 1, material, view, image: null });
    const live = await events(1, async () => {
      const r = await post(first);
      expect(r.status).toBe(200);
    });
    expect(decodeState(live[0]!).ok).toBe(true);
    // A preview that connects later (or reconnects) gets the last state at once.
    const second = encodeState({ seq: 2, sentAt: 2, material, view: { ...view, nav: 'explore' }, image: null });
    await post(second);
    const replay = await events(1);
    const r = decodeState(replay[0]!);
    expect(r.ok && r.message.seq).toBe(2);
    expect(r.ok && r.message.view.nav).toBe('explore');
  });

  it('stores assets by hash and refuses mismatching bytes', async () => {
    const data = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const hash = createHash('sha256').update(data).digest('hex');
    const bad = await fetch(`${base}/assets/${'0'.repeat(64)}?token=${token}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: data });
    expect(bad.status).toBe(400);
    const ok = await fetch(`${base}/assets/${hash}?token=${token}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: data });
    expect(ok.status).toBe(200);
    const get = await fetch(`${base}/assets/${hash}?token=${token}`);
    expect(new Uint8Array(await get.arrayBuffer())).toEqual(data);
    expect(get.headers.get('content-type')).toBe('image/png');
    const other = await fetch(`${base}/assets/${hash}?token=${newToken()}`);
    expect(other.status).toBe(404);
    const notImage = await fetch(`${base}/assets/${hash}?token=${token}`, { method: 'PUT', headers: { 'content-type': 'text/html' }, body: data });
    expect(notImage.status).toBe(415);
    // SVG would be a document on the relay's origin: refused like any non-raster type.
    const svg = await fetch(`${base}/assets/${hash}?token=${token}`, { method: 'PUT', headers: { 'content-type': 'image/svg+xml' }, body: data });
    expect(svg.status).toBe(415);
    expect(get.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('a refused upload never evicts a stored asset, even with the session full', async () => {
    const t = newToken();
    const put = (bytes: Uint8Array, type = 'image/png', hash = createHash('sha256').update(bytes).digest('hex')) =>
      fetch(`${base}/assets/${hash}?token=${t}`, { method: 'PUT', headers: { 'content-type': type }, body: new Blob([bytes as BlobPart]) });
    const first = new Uint8Array([1]);
    const firstHash = createHash('sha256').update(first).digest('hex');
    for (let i = 1; i <= 16; i++) expect((await put(new Uint8Array([i]))).status).toBe(200);
    // Full (16). Wrong type, wrong hash, too large: none of them may push the oldest asset out.
    expect((await put(new Uint8Array([99]), 'text/plain')).status).toBe(415);
    expect((await put(new Uint8Array([99]), 'image/png', '0'.repeat(64))).status).toBe(400);
    expect((await put(new Uint8Array(13 * 1024 * 1024))).status).toBe(413);
    expect((await fetch(`${base}/assets/${firstHash}?token=${t}`)).status).toBe(200);
    // A valid new asset does evict the oldest one.
    expect((await put(new Uint8Array([200]))).status).toBe(200);
    expect((await fetch(`${base}/assets/${firstHash}?token=${t}`)).status).toBe(404);
  });
});

describe('relay shutdown', () => {
  it('closes with a preview still connected over SSE, and the preview sees the stream end', async () => {
    const relay = createRelay();
    await new Promise<void>((r) => relay.server.listen(0, '127.0.0.1', () => r()));
    const url = `http://127.0.0.1:${(relay.server.address() as AddressInfo).port}/events?token=${newToken()}`;
    const res = await fetch(url);
    const reader = res.body!.getReader();
    await reader.read(); // "retry:" line: the stream is open
    const t0 = Date.now();
    const closed = await Promise.race([relay.close().then(() => 'closed'), new Promise((r) => setTimeout(() => r('timeout'), 3000))]);
    expect(closed).toBe('closed');
    expect(Date.now() - t0).toBeLessThan(3000);
    // The client gets the end of the stream, not a hang.
    let done = false;
    for (let i = 0; i < 5 && !done; i++) done = (await reader.read()).done;
    expect(done).toBe(true);
    expect(relay.sessions.size).toBe(0);
  });
});
