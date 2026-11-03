/**
 * Material families. A family owns its `material` section: Glass has optics
 * (band, refraction, profile…), Solid has fill, border and elevation, and a
 * future Jelly family will have its own properties without inheriting either.
 *
 * Only `available` families can be parsed, edited or rendered. `planned`
 * families are listed so the editor can show them as "in sviluppo", never as
 * something usable. Adding a family means: a document type (model/<family>.ts),
 * a MaterialDefinition in the registry (registry.ts) and a runtime binding
 * (runtime/materials.ts); `validateDefinition` and the registry tests check
 * that the three agree.
 */

export type FamilyId = 'glass' | 'solid' | 'jelly';
export type FamilyStatus = 'available' | 'planned';

/** What a family can do. The registry declares these per material; the editor and the exporters read them. */
export type MaterialFeature =
  /** Reads the content behind the surface (blur, saturation). */
  | 'backdrop'
  | 'refraction'
  | 'border'
  | 'shadow'
  | 'elevation'
  /** Per-state appearance (hover, pressed, active, disabled). */
  | 'states'
  | 'press'
  | 'drag'
  | 'transitions'
  /** Reserved for Jelly: not implemented by any available family. */
  | 'physics'
  | 'deformation'
  | 'bubbles';

export interface FamilyInfo {
  id: FamilyId;
  label: string;
  status: FamilyStatus;
  /** Latest version of the family's own sections. */
  version: number;
  description: string;
  /** The material lab can edit documents of this family. Informative: Jello is edited in its own lab, not in the stable Material Lab. */
  editor: boolean;
  /** Features a planned family intends to provide; informative, never rendered. */
  planned?: readonly MaterialFeature[];
}

export const FAMILIES: readonly FamilyInfo[] = [
  {
    id: 'glass',
    label: 'Glass',
    status: 'available',
    version: 1,
    description: 'Vetro: rifrazione sul perimetro, blur, tinta, luce e ombra.',
    editor: true,
  },
  {
    id: 'solid',
    label: 'Solid',
    status: 'available',
    version: 1,
    description: 'Superficie piena: colore, bordo, ombra ed elevazione, con stati e transizioni leggere. Nessun filtro SVG.',
    editor: true,
  },
  {
    // `id` is the technical id persisted in documents and stays `jelly`; the family is shown as «Jello».
    id: 'jelly',
    label: 'Jello',
    status: 'planned',
    version: 0,
    description: 'Materiale gelatinoso digitale con corpo traslucido, inclusioni interne e deformazione elastica controllata. Sperimentale: disponibile solo nel laboratorio Jello, non in questa versione produttiva.',
    editor: false,
    planned: ['physics', 'deformation', 'bubbles'],
  },
];

export function familyInfo(id: string): FamilyInfo | undefined {
  return FAMILIES.find((f) => f.id === id);
}
