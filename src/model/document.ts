/**
 * The `jello-material` document, schema version 2.
 *
 *   {
 *     format: 'jello-material', schemaVersion: 2,
 *     id, name, family: 'glass', familyVersion: 1,
 *     runtime: { min: '0.2.0' },            // oldest runtime that can read it
 *     material, geometry, behavior,          // family sections (glass.ts)
 *     quality: { profile, dprCap, internalScale, adaptive },
 *     source:  { kind: 'dom' } | { kind: 'texture', texture: … },
 *     target:  { backend: 'auto'|'css'|'svg'|'webgl2', fallback: 'css'|'opaque' },
 *     meta:    { createdAt, updatedAt, basedOn, notes }
 *   }
 *
 * Parsing is atomic: a document either validates completely (missing values
 * take defaults and are reported) or is refused with every reason, so a
 * partial, inconsistent material is never applied.
 */

import * as z from 'zod/mini';
import { defaultParams, type GlassParams } from '../core/params';
import { familyInfo, type FamilyId } from './families';
import { checkSection, joinSections, splitParams, SECTIONS, type GlassBehavior, type GlassGeometry, type GlassMaterial } from './glass';
import { QUALITY_IDS, type QualitySettings } from './quality';
import type { BackendRequest } from './support';
import { compareVersions, isVersion, MATERIAL_FORMAT, RUNTIME_VERSION, SCHEMA_VERSION } from './version';

export type PatternId = 'grid' | 'blocks' | 'bands';
export const PATTERNS: readonly { id: PatternId; label: string }[] = [
  { id: 'grid', label: 'Griglia' },
  { id: 'blocks', label: 'Blocchi' },
  { id: 'bands', label: 'Bande' },
];

/**
 * A texture the WebGL2 backend can sample. `external` means the integrator
 * hands a canvas (or, later, a video) to the runtime: it cannot be described
 * in JSON. Image URLs may be `example:<name>` (bundled example assets) or
 * `asset:<sha256>` (assets stored by the lab, resolved by whoever renders).
 */
export type TextureSpec =
  | { kind: 'pattern'; pattern: PatternId; animated: boolean }
  | { kind: 'image'; url: string }
  | { kind: 'external' };

export type MaterialSource = { kind: 'dom' } | { kind: 'texture'; texture: TextureSpec };

export interface MaterialTarget {
  backend: BackendRequest;
  /** End of the fallback chain when the requested backend is not usable. */
  fallback: 'css' | 'opaque';
}

export interface MaterialMeta {
  createdAt: string | null;
  updatedAt: string | null;
  /** Built-in preset the material was derived from. */
  basedOn: string | null;
  notes: string;
}

export interface GlassDocument {
  format: typeof MATERIAL_FORMAT;
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  family: Extract<FamilyId, 'glass'>;
  familyVersion: 1;
  runtime: { min: string };
  material: GlassMaterial;
  geometry: GlassGeometry;
  behavior: GlassBehavior;
  quality: QualitySettings;
  source: MaterialSource;
  target: MaterialTarget;
  meta: MaterialMeta;
}

/** Only Glass exists today; a Gel document will join this union with its own sections. */
export type MaterialDocument = GlassDocument;

export type ImportResult =
  | { ok: true; doc: MaterialDocument; warnings: string[]; migratedFrom: string | null }
  | { ok: false; errors: string[] };

export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

const qualitySchema = z.object({
  profile: z.enum(QUALITY_IDS as [string, ...string[]]),
  dprCap: z.optional(z.nullable(z.number().check(z.gte(0.5), z.lte(4)))),
  internalScale: z.optional(z.nullable(z.number().check(z.gte(0.25), z.lte(1)))),
  adaptive: z.optional(z.boolean()),
});

const textureSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pattern'), pattern: z.enum(['grid', 'blocks', 'bands']), animated: z.boolean() }),
  z.object({ kind: z.literal('image'), url: z.string().check(z.minLength(1), z.maxLength(2048)) }),
  z.object({ kind: z.literal('external') }),
]);

const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('dom') }),
  z.object({ kind: z.literal('texture'), texture: textureSchema }),
]);

const targetSchema = z.object({
  backend: z.enum(['auto', 'css', 'svg', 'webgl2']),
  fallback: z.optional(z.enum(['css', 'opaque'])),
});

const metaSchema = z.object({
  createdAt: z.optional(z.nullable(z.string())),
  updatedAt: z.optional(z.nullable(z.string())),
  basedOn: z.optional(z.nullable(z.string())),
  notes: z.optional(z.string().check(z.maxLength(4000))),
});

const envelopeSchema = z.object({
  format: z.literal(MATERIAL_FORMAT),
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string().check(z.regex(ID_PATTERN)),
  name: z.string().check(z.minLength(1), z.maxLength(80)),
  family: z.literal('glass'),
  familyVersion: z.literal(1),
  runtime: z.object({ min: z.string() }),
  material: z.unknown(),
  geometry: z.unknown(),
  behavior: z.unknown(),
  quality: z.optional(qualitySchema),
  source: z.optional(sourceSchema),
  target: z.optional(targetSchema),
  meta: z.optional(metaSchema),
});

const ENVELOPE_KEYS = new Set(Object.keys(envelopeSchema.def.shape));

interface Issue {
  code: string;
  path: PropertyKey[];
  expected?: unknown;
  values?: unknown[];
  minimum?: unknown;
  maximum?: unknown;
}

/** Zod issues as short Italian sentences, path first (as the v1 messages). */
export function formatIssues(issues: readonly Issue[]): string[] {
  return issues.map((i) => {
    const path = i.path.map(String).join('.') || 'documento';
    switch (i.code) {
      case 'invalid_type':
        return `${path}: atteso ${String(i.expected)}`;
      case 'invalid_value':
        return `${path}: atteso ${(i.values ?? []).map((v) => JSON.stringify(v)).join(' o ')}`;
      case 'too_small':
        return `${path}: minimo ${String(i.minimum)}`;
      case 'too_big':
        return `${path}: massimo ${String(i.maximum)}`;
      case 'invalid_format':
        return `${path}: formato non valido`;
      case 'invalid_union':
        return `${path}: tipo non riconosciuto`;
      default:
        return `${path}: valore non valido`;
    }
  });
}

export const DEFAULT_QUALITY: QualitySettings = { profile: 'balanced', dprCap: null, internalScale: null, adaptive: false };
export const DEFAULT_TARGET: MaterialTarget = { backend: 'auto', fallback: 'css' };
export const DEFAULT_SOURCE: MaterialSource = { kind: 'dom' };

/** Validates a value that already claims to be a v2 document. */
export function validateDocumentV2(input: unknown): ImportResult {
  const parsed = envelopeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: formatIssues(parsed.error.issues as unknown as Issue[]) };
  const env = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isVersion(env.runtime.min)) errors.push('runtime.min: attesa una versione x.y.z');
  else if (compareVersions(env.runtime.min, RUNTIME_VERSION) > 0) {
    errors.push(`runtime.min: il documento richiede il runtime ${env.runtime.min}, questo è ${RUNTIME_VERSION}`);
  }
  const sections: Record<string, Record<string, unknown>> = {};
  for (const section of SECTIONS) {
    const r = checkSection(section, env[section]);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    sections[section] = r.values;
  }
  for (const key of Object.keys(input as object)) {
    if (!ENVELOPE_KEYS.has(key)) warnings.push(`${key}: campo sconosciuto, ignorato`);
  }
  if (!env.quality) warnings.push('quality: assente, uso il profilo Balanced');
  if (!env.target) warnings.push('target: assente, backend automatico');
  if (errors.length) return { ok: false, errors };
  const doc: GlassDocument = {
    format: MATERIAL_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    id: env.id,
    name: env.name,
    family: 'glass',
    familyVersion: 1,
    runtime: { min: env.runtime.min },
    material: sections.material as unknown as GlassMaterial,
    geometry: sections.geometry as unknown as GlassGeometry,
    behavior: sections.behavior as unknown as GlassBehavior,
    quality: {
      profile: (env.quality?.profile ?? DEFAULT_QUALITY.profile) as QualitySettings['profile'],
      dprCap: env.quality?.dprCap ?? null,
      internalScale: env.quality?.internalScale ?? null,
      adaptive: env.quality?.adaptive ?? false,
    },
    source: (env.source as MaterialSource | undefined) ?? DEFAULT_SOURCE,
    target: { backend: env.target?.backend ?? 'auto', fallback: env.target?.fallback ?? 'css' },
    meta: {
      createdAt: env.meta?.createdAt ?? null,
      updatedAt: env.meta?.updatedAt ?? null,
      basedOn: env.meta?.basedOn ?? null,
      notes: env.meta?.notes ?? '',
    },
  };
  return { ok: true, doc, warnings, migratedFrom: null };
}

/** Rejects families that exist only as plans with a message, not a schema error. */
export function checkFamily(family: unknown, familyVersion: unknown): string | null {
  if (typeof family !== 'string') return 'family: attesa una stringa';
  const info = familyInfo(family);
  if (!info) return `family: "${family}" sconosciuta a questo runtime (${RUNTIME_VERSION})`;
  if (info.status !== 'available') return `family: "${info.label}" non è ancora disponibile in questo runtime (${RUNTIME_VERSION})`;
  if (typeof familyVersion === 'number' && familyVersion > info.version) {
    return `familyVersion: ${info.label} versione ${familyVersion} è più recente di quella supportata (${info.version})`;
  }
  return null;
}

export interface CreateOptions {
  id: string;
  name: string;
  params?: GlassParams;
  quality?: Partial<QualitySettings>;
  source?: MaterialSource;
  target?: Partial<MaterialTarget>;
  meta?: Partial<MaterialMeta>;
}

export function createGlassDocument(o: CreateOptions): GlassDocument {
  const s = splitParams(o.params ?? defaultParams());
  return {
    format: MATERIAL_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    id: o.id,
    name: o.name,
    family: 'glass',
    familyVersion: 1,
    runtime: { min: RUNTIME_VERSION },
    ...s,
    quality: { ...DEFAULT_QUALITY, ...o.quality },
    source: o.source ?? DEFAULT_SOURCE,
    target: { ...DEFAULT_TARGET, ...o.target },
    meta: { createdAt: null, updatedAt: null, basedOn: null, notes: '', ...o.meta },
  };
}

/** Flat engine parameters of a Glass document (what core/ renders). */
export function glassParams(doc: GlassDocument): GlassParams {
  return joinSections(doc);
}

export function withGlassParams(doc: GlassDocument, params: GlassParams): GlassDocument {
  return { ...doc, ...splitParams(params) };
}

/** Stable key order, two-space indent: diffs of exported files stay readable. */
export function serializeMaterial(doc: MaterialDocument): string {
  const ordered = {
    format: doc.format,
    schemaVersion: doc.schemaVersion,
    id: doc.id,
    name: doc.name,
    family: doc.family,
    familyVersion: doc.familyVersion,
    runtime: doc.runtime,
    material: doc.material,
    geometry: doc.geometry,
    behavior: doc.behavior,
    quality: doc.quality,
    source: doc.source,
    target: doc.target,
    meta: doc.meta,
  };
  return JSON.stringify(ordered, null, 2);
}

/** Small deterministic hash (FNV-1a, hex) for ids derived from content. */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
