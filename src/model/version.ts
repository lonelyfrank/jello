/**
 * Versions that travel with every material document.
 *
 * - RUNTIME_VERSION: the runtime that reads and renders documents. A document
 *   declares the minimum runtime it needs (`runtime.min`).
 * - SCHEMA_VERSION: the shape of the `jello-material` envelope. Older
 *   documents are migrated (see migrate.ts); newer ones are refused with a
 *   readable message instead of being half-applied.
 */

export const RUNTIME_VERSION = '0.2.0';
export const MATERIAL_FORMAT = 'jello-material';
export const SCHEMA_VERSION = 2;

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function isVersion(v: string): boolean {
  return SEMVER.test(v);
}

/** Negative when a < b, 0 when equal, positive when a > b. Both must be x.y.z. */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) throw new Error(`versione non valida: ${pa ? b : a}`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d) return d;
  }
  return 0;
}
