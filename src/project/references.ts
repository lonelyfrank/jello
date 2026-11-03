/**
 * Material references of components, pure.
 *
 * Invariants of a project (see docs/projects.md, «Riferimenti ai materiali»):
 *  1. Every material and component record belongs to exactly one project
 *     (`projectId`).
 *  2. `component.material.preset` is null, the id of a built-in preset (code,
 *     shared by every project, never edited) or the id of a material of the
 *     same project. There is no cross-project («global») link.
 *  3. Built-in ids are reserved: a reference that names one is a built-in
 *     reference even if a material document with that id travels along.
 *  4. Copying materials into a project (duplicate, import) gives them new
 *     ids; every reference is rewritten through the id map of that same
 *     operation, never by name or by guess.
 *  5. A reference that cannot be resolved (material missing, deleted, or
 *     ambiguous because two copied materials had the same id) is unlinked:
 *     the component keeps its embedded material document, so it looks the
 *     same, and stops following. The operation reports it.
 */

import type { ComponentDefinition } from '../components';
import { MATERIALS } from '../model';

export type MaterialIdMap = ReadonlyMap<string, string>;

export const isBuiltinPreset = (id: string): boolean => MATERIALS.preset(id) !== undefined;

export interface IdMapping {
  map: Map<string, string>;
  /** Source ids given more than once: references to them cannot be resolved. */
  ambiguous: Set<string>;
}

/** Old → new id for the materials an operation copies. */
export function materialIdMap(pairs: Iterable<readonly [from: string, to: string]>): IdMapping {
  const map = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const [from, to] of pairs) {
    if (ambiguous.has(from)) continue;
    if (map.has(from)) {
      map.delete(from);
      ambiguous.add(from);
    } else map.set(from, to);
  }
  return { map, ambiguous };
}

/** The component no longer follows a library material; its embedded document stays. */
export function unlinkMaterial(doc: ComponentDefinition): ComponentDefinition {
  return { ...doc, material: { ...doc.material, preset: null, revision: null } };
}

export interface RemappedReference {
  doc: ComponentDefinition;
  /** The local id that could not be resolved (the component was unlinked), or null. */
  unlinked: string | null;
}

/**
 * Rewrites the material link of a component copied into another project:
 * built-in references stay, local ones go through `ids`, anything else is
 * unlinked and reported.
 */
export function remapMaterialReference(doc: ComponentDefinition, ids: MaterialIdMap): RemappedReference {
  const preset = doc.material.preset;
  if (!preset || isBuiltinPreset(preset)) return { doc, unlinked: null };
  const to = ids.get(preset);
  if (to === undefined) return { doc: unlinkMaterial(doc), unlinked: preset };
  return { doc: to === preset ? doc : { ...doc, material: { ...doc.material, preset: to } }, unlinked: null };
}

/** Components of a project whose link names neither a built-in nor one of `materialIds` (invariant 2). */
export function unresolvedReferences(components: readonly ComponentDefinition[], materialIds: ReadonlySet<string>): ComponentDefinition[] {
  return components.filter((c) => {
    const p = c.material.preset;
    return p !== null && !isBuiltinPreset(p) && !materialIds.has(p);
  });
}
