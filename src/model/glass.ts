/**
 * Glass family: how the flat engine parameters (core/params.ts, the single
 * source of defaults, ranges, units, descriptions and `affects`) are split
 * into the document sections.
 *
 *   geometry  shape and size of the surface (shape, width, height, radius)
 *   material  what Glass looks like (optics, tint, light, shadow)
 *   behavior  how it responds (spring, stretch, press)
 *
 * The section of each key is derived from its descriptor group, so a new
 * parameter cannot be left out of the document by accident.
 */

import { checkKeys, type KeysCheck } from '../core/descriptors';
import {
  PARAMS,
  PARAM_INDEX,
  defaultParams,
  type GlassParams,
  type ParamDescriptor,
  type ParamGroup,
  type ParamKey,
  type ParamStage,
} from '../core/params';

export type SectionId = 'geometry' | 'material' | 'behavior';

const SECTION_OF_GROUP: Record<ParamGroup, SectionId> = {
  shape: 'geometry',
  optics: 'material',
  material: 'material',
  light: 'material',
  shadow: 'material',
  motion: 'behavior',
};

export const SECTIONS: readonly SectionId[] = ['material', 'geometry', 'behavior'];

export function sectionOf(key: ParamKey): SectionId {
  return SECTION_OF_GROUP[PARAM_INDEX[key].group];
}

export const SECTION_KEYS: Readonly<Record<SectionId, readonly ParamKey[]>> = {
  geometry: PARAMS.filter((d) => sectionOf(d.key) === 'geometry').map((d) => d.key),
  material: PARAMS.filter((d) => sectionOf(d.key) === 'material').map((d) => d.key),
  behavior: PARAMS.filter((d) => sectionOf(d.key) === 'behavior').map((d) => d.key),
};

type Pick2<K extends ParamKey> = { [P in K]: GlassParams[P] };
export type GlassGeometry = Pick2<'shape' | 'width' | 'height' | 'radius'>;
export type GlassBehavior = Pick2<'stiffness' | 'damping' | 'stretch' | 'pressScale' | 'pressRefraction' | 'pressLight'>;
export type GlassMaterial = Omit<GlassParams, keyof GlassGeometry | keyof GlassBehavior>;

export interface GlassSections {
  material: GlassMaterial;
  geometry: GlassGeometry;
  behavior: GlassBehavior;
}

export function splitParams(p: GlassParams): GlassSections {
  const pick = (section: SectionId) => Object.fromEntries(SECTION_KEYS[section].map((k) => [k, p[k]]));
  return {
    material: pick('material') as unknown as GlassMaterial,
    geometry: pick('geometry') as unknown as GlassGeometry,
    behavior: pick('behavior') as unknown as GlassBehavior,
  };
}

export function joinSections(s: GlassSections): GlassParams {
  const out = defaultParams() as unknown as Record<string, unknown>;
  for (const section of SECTIONS) {
    const values = s[section] as unknown as Record<string, unknown>;
    for (const k of SECTION_KEYS[section]) out[k] = values[k];
  }
  return out as unknown as GlassParams;
}

export type SectionCheck = KeysCheck;

/**
 * Validates one section against the descriptor table. Same policy as the
 * v1 import: an invalid value rejects the document, a missing key takes its
 * default (warning), an unknown key is ignored (warning).
 */
export function checkSection(section: SectionId, input: unknown): SectionCheck {
  return checkKeys(descriptorsOf(section), input, {
    scope: section,
    elsewhere: (key) => (key in PARAM_INDEX ? `appartiene alla sezione ${sectionOf(key as ParamKey)}, ignorato qui` : null),
  });
}

/** Stages touched by a set of keys: lets renderers keep cheap updates cheap. */
export function stagesFor(keys: readonly ParamKey[]): Set<ParamStage> {
  return new Set(keys.map((k) => PARAM_INDEX[k].affects));
}

export function descriptorsOf(section: SectionId): ParamDescriptor[] {
  return SECTION_KEYS[section].map((k) => PARAM_INDEX[k]);
}
