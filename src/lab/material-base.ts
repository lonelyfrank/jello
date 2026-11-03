/**
 * The base of a material: the built-in preset it is, or was copied from. «Ripristina» goes back to it (M6.4.2).
 *
 * A built-in opened in the Material Lab is its own base. A personal material is based on the preset recorded in
 * `meta.basedOn` when it was copied. A material with no recorded preset has no base: its reset falls back to the
 * family's descriptor defaults, which the panel says (it never invents a base).
 */
import { MATERIALS, type MaterialDocument } from '../model';

export function baseMaterial(doc: MaterialDocument, origin: 'builtin' | 'user', materialId: string): MaterialDocument | null {
  const def = MATERIALS.get(doc.family);
  if (!def) return null;
  const id = origin === 'builtin' ? materialId : doc.meta.basedOn;
  return (id && def.presets.find((p) => p.doc.id === id)?.doc) || null;
}

/** The value a parameter goes back to: the base's, or null when there is no base (the descriptor default then applies). */
export function baseValue(doc: MaterialDocument | null, key: string): number | string | null {
  if (!doc) return null;
  const def = MATERIALS.get(doc.family);
  const v = def?.read(doc).params[key];
  return typeof v === 'number' || typeof v === 'string' ? v : null;
}
