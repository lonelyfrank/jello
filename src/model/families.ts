/**
 * Material families. A family owns its `material` section: Glass has optics
 * (band, refraction, profile…), a future Gel family will have its own
 * properties and does not inherit Glass optics.
 *
 * Only `available` families can be parsed, edited or rendered. `planned`
 * families are listed so the editor can show them as "in sviluppo", never as
 * something usable.
 */

export type FamilyId = 'glass' | 'gel';
export type FamilyStatus = 'available' | 'planned';

export interface FamilyInfo {
  id: FamilyId;
  label: string;
  status: FamilyStatus;
  /** Latest version of the family's own sections. */
  version: number;
  description: string;
}

export const FAMILIES: readonly FamilyInfo[] = [
  {
    id: 'glass',
    label: 'Glass',
    status: 'available',
    version: 1,
    description: 'Vetro: rifrazione sul perimetro, blur, tinta, luce e ombra.',
  },
  {
    id: 'gel',
    label: 'Gel',
    status: 'planned',
    version: 0,
    description: 'Gelatina con massa e rimbalzo. In sviluppo: non disponibile in questa versione.',
  },
];

export function familyInfo(id: string): FamilyInfo | undefined {
  return FAMILIES.find((f) => f.id === id);
}
