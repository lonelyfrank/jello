/**
 * Sends the lab state to the local development relay (tools/relay), which
 * forwards it to the phone preview. Optional: off until the user starts it.
 * Full state every time, debounced; failed posts are retried with backoff.
 */

import { encodeState } from '../sync/protocol';
import type { MaterialDocument } from '../model';
import type { ViewOptions } from '../stage/view';

export type SyncState =
  | { kind: 'off' }
  | { kind: 'connecting'; relay: string; token: string }
  | { kind: 'live'; relay: string; token: string; previews: number; seq: number; at: number }
  | { kind: 'error'; relay: string; token: string; message: string; retryIn: number };

export interface SyncSnapshot {
  material: MaterialDocument;
  view: ViewOptions;
  /** Local image to publish (blob), or null for the bundled photo. */
  image: Blob | null;
}

export class SyncSender {
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retry = 0;
  private stopped = true;
  private imageKey: Blob | null = null;
  private imageUrl: string | null = null;
  private state: SyncState = { kind: 'off' };

  constructor(
    private readonly snapshot: () => SyncSnapshot,
    private readonly onState: (s: SyncState) => void,
  ) {}

  get status(): SyncState {
    return this.state;
  }

  start(relay: string, token: string): void {
    this.stopped = false;
    this.retry = 0;
    this.relay = relay.replace(/\/$/, '');
    this.token = token;
    this.imageKey = null;
    this.set({ kind: 'connecting', relay: this.relay, token });
    this.push(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.set({ kind: 'off' });
  }

  /** State changed: send it soon (coalesces slider drags). */
  push(delay = 120): void {
    if (this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.send();
    }, delay);
  }

  private relay = '';
  private token = '';

  private async send() {
    const snap = this.snapshot();
    const seq = ++this.seq;
    try {
      const image = await this.publishImage(snap.image);
      const body = encodeState({ seq, sentAt: Date.now(), material: snap.material, view: snap.view, image });
      const r = await fetch(`${this.relay}/state?token=${encodeURIComponent(this.token)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      if (!r.ok) throw new Error(`relay: HTTP ${r.status} ${await r.text()}`);
      const info = (await r.json()) as { previews?: number };
      this.retry = 0;
      if (!this.stopped) this.set({ kind: 'live', relay: this.relay, token: this.token, previews: info.previews ?? 0, seq, at: Date.now() });
    } catch (e) {
      if (this.stopped) return;
      const wait = Math.min(10_000, 500 * 2 ** this.retry++);
      this.set({ kind: 'error', relay: this.relay, token: this.token, message: (e as Error).message, retryIn: wait });
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.send();
      }, wait);
    }
  }

  /** Uploads the local image once (content-addressed); the phone gets a relay URL. */
  private async publishImage(blob: Blob | null): Promise<string | null> {
    if (!blob) return null;
    if (blob === this.imageKey && this.imageUrl) return this.imageUrl;
    const buf = await blob.arrayBuffer();
    const digest = await sha256(buf);
    const url = `${this.relay}/assets/${digest}?token=${encodeURIComponent(this.token)}`;
    const r = await fetch(url, { method: 'PUT', headers: { 'content-type': blob.type || 'application/octet-stream' }, body: buf });
    if (!r.ok) throw new Error(`relay: caricamento immagine HTTP ${r.status}`);
    this.imageKey = blob;
    this.imageUrl = url;
    return url;
  }

  private set(s: SyncState) {
    this.state = s;
    this.onState(s);
  }
}

export async function sha256(buf: ArrayBuffer): Promise<string> {
  // crypto.subtle needs a secure context; the lab runs on localhost, which is one.
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
