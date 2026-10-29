/**
 * Built-in materials: the existing presets (core/presets.ts) as v2
 * documents. Their ids equal the preset ids, so `?preset=navbar` and
 * `?material=navbar` open the same material. They are read-only: editing one
 * in the lab produces a personal copy.
 */

import { PRESETS } from '../core/presets';
import { createGlassDocument, type MaterialDocument } from './document';

export interface BuiltinMaterial {
  doc: MaterialDocument;
  /** True when the preset approximates another project's treatment. */
  approximation: boolean;
  note: string;
}

export const BUILTIN_MATERIALS: readonly BuiltinMaterial[] = PRESETS.map((p) => ({
  doc: createGlassDocument({ id: p.id, name: p.label, params: p.params, meta: { basedOn: p.id, notes: p.note } }),
  approximation: p.approximation,
  note: p.note,
}));

export function builtinMaterial(id: string): BuiltinMaterial | undefined {
  return BUILTIN_MATERIALS.find((b) => b.doc.id === id);
}

export const isBuiltinId = (id: string) => BUILTIN_MATERIALS.some((b) => b.doc.id === id);
