/**
 * Project document: creation, validation of what comes back from storage or
 * from a `.jello` file, and small helpers (tokens, ids).
 */

import * as z from 'zod/mini';
import { HEX6 } from './color';
import {
  PROJECT_FORMAT,
  PROJECT_SCHEMA_VERSION,
  type ProjectAssets,
  type ProjectDoc,
  type Platform,
  type PreviewTheme,
  type DefaultPath,
} from './types';

const str = (max: number) => z.string().check(z.minLength(1), z.maxLength(max));
const token = z.string().check(z.regex(/^--[a-z0-9][a-z0-9-]{0,47}$/));

const colorSchema = z.object({
  id: str(64),
  name: str(80),
  token,
  hex: z.string().check(z.regex(HEX6)),
  alpha: z.number().check(z.minimum(0), z.maximum(1)),
});
const paletteSchema = z.object({ id: str(64), name: str(80), colors: z.array(colorSchema).check(z.maxLength(500)) });
const iconSchema = z.object({
  id: str(64),
  name: str(60),
  viewBox: str(64),
  body: z.string().check(z.maxLength(32 * 1024)),
  paint: z.enum(['stroke', 'fill']),
  warning: z.nullable(z.string()),
});
const iconSetSchema = z.object({ id: str(64), name: str(80), builtin: z.boolean(), icons: z.array(iconSchema).check(z.maxLength(2000)) });
const fontSchema = z.object({
  id: str(64),
  name: str(80),
  role: z.string().check(z.maxLength(60)),
  source: z.enum(['google', 'upload', 'system']),
  weights: z.array(z.number().check(z.minimum(100), z.maximum(900))).check(z.maxLength(9)),
  license: z.string().check(z.maxLength(120)),
  fallback: z.enum(['sans-serif', 'serif', 'monospace', 'system-ui']),
  fileHash: z.nullable(z.string()),
});
const typeSchema = z.object({
  id: str(64),
  token,
  label: str(60),
  sample: z.string().check(z.maxLength(200)),
  family: str(64),
  weight: z.number().check(z.minimum(100), z.maximum(900)),
  size: z.number().check(z.minimum(8), z.maximum(160)),
  lineHeight: z.number().check(z.minimum(8), z.maximum(200)),
});

const assetsSchema = z.object({
  palettes: z.array(paletteSchema).check(z.maxLength(100)),
  iconSets: z.array(iconSetSchema).check(z.maxLength(100)),
  fonts: z.array(fontSchema).check(z.maxLength(100)),
  typeStyles: z.array(typeSchema).check(z.maxLength(100)),
});

const projectSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  schemaVersion: z.number(),
  id: str(64),
  name: str(80),
  platform: z.enum(['web', 'android', 'both']),
  previewTheme: z.enum(['system', 'light', 'dark']),
  defaultPath: z.enum(['auto', 'refraction', 'satin', 'opaque']),
  favorites: z.array(z.string()).check(z.maxLength(2000)),
  assets: assetsSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ProjectParse = { ok: true; doc: ProjectDoc } | { ok: false; errors: string[] };

export function parseProject(input: unknown): ProjectParse {
  if (typeof input !== 'object' || input === null) return { ok: false, errors: ['il progetto deve essere un oggetto'] };
  const v = (input as { schemaVersion?: unknown }).schemaVersion;
  if (typeof v === 'number' && v > PROJECT_SCHEMA_VERSION) {
    return { ok: false, errors: [`schemaVersion: ${v} è più recente di quella supportata (${PROJECT_SCHEMA_VERSION})`] };
  }
  const r = z.safeParse(projectSchema, input);
  if (r.success) return { ok: true, doc: r.data as ProjectDoc };
  return { ok: false, errors: r.error.issues.slice(0, 6).map((i) => `${i.path.join('.') || 'progetto'}: ${i.message}`) };
}

export interface CreateProjectOptions {
  id: string;
  name: string;
  platform?: Platform;
  previewTheme?: PreviewTheme;
  defaultPath?: DefaultPath;
  assets: ProjectAssets;
  at?: string;
}

export function createProject(o: CreateProjectOptions): ProjectDoc {
  const at = o.at ?? new Date().toISOString();
  return {
    format: PROJECT_FORMAT,
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: o.id,
    name: o.name.trim() || 'Nuovo progetto',
    platform: o.platform ?? 'web',
    previewTheme: o.previewTheme ?? 'system',
    defaultPath: o.defaultPath ?? 'auto',
    favorites: [],
    assets: o.assets,
    createdAt: at,
    updatedAt: at,
  };
}

/** Stable key order, two-space indent. */
export function serializeProject(doc: ProjectDoc): string {
  return JSON.stringify(
    {
      format: doc.format,
      schemaVersion: doc.schemaVersion,
      id: doc.id,
      name: doc.name,
      platform: doc.platform,
      previewTheme: doc.previewTheme,
      defaultPath: doc.defaultPath,
      favorites: doc.favorites,
      assets: doc.assets,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    },
    null,
    2,
  );
}

/** "Viola Jello" → "--jello-viola-jello": a CSS custom property name from a label. */
export function tokenFor(name: string, prefix = 'jello'): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);
  return `--${prefix}-${slug || 'colore'}`;
}

/** First token of the form `base`, `base-2`, `base-3`… that is not in `taken`. */
export function uniqueToken(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
}

/** "Navbar" → "Navbar 2" → "Navbar 3"… */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  const stem = base.replace(/ \d+$/, '');
  for (let i = 2; i < 1000; i++) if (!taken.has(`${stem} ${i}`)) return `${stem} ${i}`;
  return `${stem} ${Date.now()}`;
}

export function usedTokens(a: ProjectAssets): Set<string> {
  const t = new Set<string>();
  for (const p of a.palettes) for (const c of p.colors) t.add(c.token);
  for (const s of a.typeStyles) t.add(s.token);
  return t;
}
