/**
 * Reading any document Jello has produced.
 *
 *   jello-glass v1      { format: 'jello-glass', version: 1, params: {…24 keys} }
 *                       → migrated to jello-material v2, every parameter kept.
 *   jello-material v2   validated as is.
 *   newer versions      refused with a message naming both versions.
 *
 * The opposite direction (v2 → v1) exists for tools that still read v1: it
 * reports every field v1 cannot represent instead of dropping it silently.
 */

import { FORMAT as V1_FORMAT, FORMAT_VERSION as V1_VERSION, PARAMS, validateParams, type GlassParams } from '../core/params';
import {
  checkFamily,
  contentHash,
  createGlassDocument,
  DEFAULT_QUALITY,
  DEFAULT_SOURCE,
  DEFAULT_TARGET,
  glassParams,
  validateDocumentV2,
  type ImportResult,
  type MaterialDocument,
} from './document';
import { MATERIAL_FORMAT, RUNTIME_VERSION, SCHEMA_VERSION } from './version';

export const LEGACY_V1 = `${V1_FORMAT}@${V1_VERSION}`;

export function parseMaterial(input: unknown): ImportResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: ['Il documento deve essere un oggetto JSON'] };
  }
  const doc = input as Record<string, unknown>;
  if (doc.format === V1_FORMAT) return migrateV1(doc);
  if (doc.format !== MATERIAL_FORMAT) {
    return { ok: false, errors: [`format: atteso "${MATERIAL_FORMAT}" (o il precedente "${V1_FORMAT}")`] };
  }
  const v = doc.schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    return { ok: false, errors: ['schemaVersion: atteso un intero'] };
  }
  if (v > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `schemaVersion ${v}: il documento è stato creato da una versione più recente di Jello. ` +
          `Questo runtime (${RUNTIME_VERSION}) legge fino alla versione ${SCHEMA_VERSION}: aggiorna il runtime. Nessuna modifica applicata.`,
      ],
    };
  }
  if (v < SCHEMA_VERSION) {
    // v1 was only ever written as "jello-glass"; a "jello-material" v1 never existed.
    return { ok: false, errors: [`schemaVersion ${v}: non esiste un documento ${MATERIAL_FORMAT} di questa versione`] };
  }
  const family = checkFamily(doc.family, doc.familyVersion);
  if (family) return { ok: false, errors: [family] };
  return validateDocumentV2(doc);
}

export function parseMaterialText(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSON non valido: ${(e as Error).message}`] };
  }
  return parseMaterial(data);
}

function migrateV1(doc: Record<string, unknown>): ImportResult {
  if (typeof doc.version === 'number' && doc.version > V1_VERSION) {
    return {
      ok: false,
      errors: [`version ${doc.version}: ${V1_FORMAT} più recente di quello supportato (${V1_VERSION}). Nessuna modifica applicata.`],
    };
  }
  const r = validateParams(doc);
  if (!r.ok) return r;
  const hash = contentHash(JSON.stringify(PARAMS.map((d) => r.params[d.key])));
  const migrated = createGlassDocument({
    id: `glass-${hash}`,
    name: 'Glass importato (v1)',
    params: r.params,
    meta: { notes: `Migrato da ${LEGACY_V1}.` },
  });
  return { ok: true, doc: migrated, warnings: r.warnings, migratedFrom: LEGACY_V1 };
}

export interface LegacyExport {
  text: string;
  params: GlassParams;
  /** Fields of the v2 document that v1 cannot carry. */
  dropped: string[];
}

/** v2 → jello-glass v1. Parameters survive unchanged; everything else is listed in `dropped`. */
export function toLegacyV1(doc: MaterialDocument): LegacyExport {
  const params = glassParams(doc);
  const dropped: string[] = [`id (${doc.id})`, `name (${doc.name})`];
  const q = doc.quality;
  if (q.profile !== DEFAULT_QUALITY.profile || q.dprCap !== null || q.internalScale !== null || q.adaptive) {
    dropped.push(`quality (${q.profile}${q.adaptive ? ', adattiva' : ''})`);
  }
  if (JSON.stringify(doc.source) !== JSON.stringify(DEFAULT_SOURCE)) dropped.push(`source (${describeSource(doc)})`);
  if (doc.target.backend !== DEFAULT_TARGET.backend || doc.target.fallback !== DEFAULT_TARGET.fallback) {
    dropped.push(`target (${doc.target.backend}, fallback ${doc.target.fallback})`);
  }
  if (doc.meta.notes || doc.meta.basedOn) dropped.push('meta (note, preset di origine)');
  const ordered = Object.fromEntries(PARAMS.map((d) => [d.key, params[d.key]]));
  const text = JSON.stringify({ format: V1_FORMAT, version: V1_VERSION, params: ordered }, null, 2);
  return { text, params, dropped };
}

function describeSource(doc: MaterialDocument): string {
  const s = doc.source;
  if (s.kind === 'dom') return 'DOM';
  const t = s.texture;
  return t.kind === 'pattern' ? `pattern ${t.pattern}` : t.kind === 'image' ? `immagine ${t.url}` : 'esterna';
}
