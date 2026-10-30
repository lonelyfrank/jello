/**
 * Lab → phone preview sync, protocol version 1.
 *
 * Only data travels: a full material document (validated by the material
 * model on arrival), the view options (validated here) and asset URLs the
 * phone can reach (served by the relay, never desktop blob: URLs). Every
 * message carries the whole state, so a preview that reconnects is correct
 * after the first message it receives.
 *
 * Not part of the runtime: the exported package never contains it.
 */

import * as z from 'zod/mini';
import { formatIssues, parseGlassMaterial, type GlassDocument } from '../model';
import { CUSTOM_LIMITS, DEVICES, MODES, NAV_ITEMS, OBJECTS, PATHS, TEXTURES, type ViewOptions } from '../stage/view';
import { SCENES } from '../stage/scenes';

export const PROTOCOL = 1;
export const MAX_MESSAGE_BYTES = 256 * 1024;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

const enumOf = <T extends string>(values: readonly T[]) => z.enum(values as unknown as [T, ...T[]]);

const viewSchema = z.object({
  mode: enumOf(MODES),
  object: enumOf(OBJECTS.map((o) => o.id)),
  nav: enumOf(NAV_ITEMS.map((n) => n.id)),
  scene: enumOf(SCENES.map((s) => s.id)),
  texture: enumOf(TEXTURES),
  animate: z.boolean(),
  theme: z.enum(['system', 'light', 'dark']),
  path: enumOf(PATHS),
  compare: z.boolean(),
  device: enumOf(DEVICES),
  width: z.number().check(z.gte(CUSTOM_LIMITS.minWidth), z.lte(CUSTOM_LIMITS.maxWidth)),
  height: z.number().check(z.gte(CUSTOM_LIMITS.minHeight), z.lte(CUSTOM_LIMITS.maxHeight)),
  showMap: z.boolean(),
  components: z.boolean(),
  reduceMotion: z.boolean(),
  reduceTransparency: z.boolean(),
});

const stateSchema = z.object({
  type: z.literal('state'),
  protocol: z.literal(PROTOCOL),
  seq: z.number().check(z.int(), z.gte(0)),
  sentAt: z.number(),
  material: z.unknown(),
  view: viewSchema,
  /** Image of the photo scene / texture, reachable by the phone, or null for the bundled one. */
  image: z.nullable(z.string().check(z.maxLength(2048))),
});

export interface StateMessage {
  type: 'state';
  protocol: typeof PROTOCOL;
  seq: number;
  sentAt: number;
  material: GlassDocument;
  view: ViewOptions;
  image: string | null;
}

export type DecodeResult = { ok: true; message: StateMessage; warnings: string[] } | { ok: false; errors: string[] };

export function encodeState(m: Omit<StateMessage, 'type' | 'protocol'>): string {
  return JSON.stringify({ type: 'state', protocol: PROTOCOL, ...m });
}

/** Validates a message received from the relay. Nothing is applied unless all of it is valid. */
export function decodeState(text: string): DecodeResult {
  if (text.length > MAX_MESSAGE_BYTES) return { ok: false, errors: ['messaggio troppo grande'] };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['messaggio non JSON'] };
  }
  const p = (data as { protocol?: unknown } | null)?.protocol;
  if (typeof p === 'number' && p > PROTOCOL) {
    return { ok: false, errors: [`protocollo ${p} più recente di quello di questa anteprima (${PROTOCOL}): aggiorna l’anteprima`] };
  }
  const env = stateSchema.safeParse(data);
  if (!env.success) return { ok: false, errors: formatIssues(env.error.issues as never) };
  const material = parseGlassMaterial(env.data.material);
  if (!material.ok) return { ok: false, errors: material.errors.map((e) => `material: ${e}`) };
  if (env.data.image !== null && !/^https?:\/\//.test(env.data.image) && !env.data.image.startsWith('/')) {
    return { ok: false, errors: ['image: atteso un URL http(s) raggiungibile dal telefono'] };
  }
  return {
    ok: true,
    message: { ...env.data, material: material.doc, view: env.data.view as ViewOptions } as StateMessage,
    warnings: material.warnings,
  };
}

/** Random session token (URL-safe). Uses getRandomValues: also available outside secure contexts. */
export function newToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[b & 63];
  return s;
}
