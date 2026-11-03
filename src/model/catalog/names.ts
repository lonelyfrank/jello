/**
 * Display names of the built-in presets: the ONE place a preset label is written.
 *
 * Deliberately tiny and dependency-free: `core/presets.ts` and `model/solid.ts` read their labels
 * from here, so the exportable runtime carries the names it already carried and nothing else of
 * the catalog. Descriptions, treatments and capabilities live in `./index.ts` (lab only).
 *
 * A display name is NOT an identifier. Persisted documents reference presets by id (`jello`,
 * `satin`, `solid-neutral`, `jelly-soft`…); renaming one here never touches a stored document.
 * Names chosen by a user for a personal material are stored in that material and never come from here.
 */
export const PRESET_DISPLAY_NAMES = {
  // Glass
  jello: 'Glass · Default',
  satin: 'Glass · Frosted',
  deep: 'Glass · Refractive',
  navbar: 'Glass · Subtle',
  // Diagnostic configuration (Glass family)
  optics: 'Refraction Test',
  // Solid
  'solid-neutral': 'Solid · Matte',
  'solid-dark': 'Solid · Dark',
  'solid-accent': 'Solid · Accent Blue',
  'solid-outline': 'Solid · Outlined',
  // Jello (technical family id `jelly`), experimental candidates
  'jelly-soft': 'Jello · Soft',
  'jelly-clear': 'Jello · Clear',
  'jelly-candy': 'Jello · Candy',
  'jelly-dense': 'Jello · Dense',
} as const;

export type CatalogPresetId = keyof typeof PRESET_DISPLAY_NAMES;

export const isCatalogPresetId = (id: string): id is CatalogPresetId => Object.hasOwn(PRESET_DISPLAY_NAMES, id);

/** Display name of a built-in preset; throws for an id the catalog does not know (a typo must not ship). */
export function presetName(id: CatalogPresetId): string {
  return PRESET_DISPLAY_NAMES[id];
}

/** Display name when the id may be anything (a stored reference); undefined when it is not a catalog preset. */
export function presetDisplayName(id: string | null | undefined): string | undefined {
  return id && isCatalogPresetId(id) ? PRESET_DISPLAY_NAMES[id] : undefined;
}

/**
 * Names the built-in presets had BEFORE M6.4.1. A component stores `material.revision`, a content hash that
 * (historically) includes the material's name, so a rename must not change what is hashed: otherwise every
 * component bound to a preset would read «the preset changed» (`outdated`) after a pure relabelling.
 * `revisionName` is the name to hash; user-chosen names are never touched.
 */
export const LEGACY_PRESET_NAMES: Readonly<Record<string, string>> = {
  jello: 'Jello · iniziale',
  optics: 'Ottica nuda',
  satin: 'Satinato',
  deep: 'Lente marcata',
  navbar: 'Jello · navbar',
  'solid-neutral': 'Solid · neutro',
  'solid-dark': 'Solid · scuro',
  'solid-accent': 'Solid · accento',
  'solid-outline': 'Solid · contorno',
};

/** The name to hash for `materialRevision`: the pre-M6.4.1 name for a built-in preset carrying its current display name. */
export function revisionName(id: string, name: string): string {
  return isCatalogPresetId(id) && name === PRESET_DISPLAY_NAMES[id] && Object.hasOwn(LEGACY_PRESET_NAMES, id) ? LEGACY_PRESET_NAMES[id]! : name;
}
