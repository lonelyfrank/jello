/**
 * What the Library shows about a material, read from the catalog (src/model/catalog). Views never write
 * a family name, a treatment or a description themselves: they ask here, so the vocabulary has one source.
 */
import { availabilityLabel, catalogEntry, entryMeta, familyLabel, treatmentInfo, type MaterialCatalogEntry } from '../../model/catalog';
import type { LibraryItem } from '../store';

export interface MaterialPresentation {
  /** «Glass», «Solid», «Jello» — an explicit mapping, never «anything but Glass is Solid». */
  family: string;
  /** «Frosted»: only for a built-in preset, whose treatment is known. A personal material may have been edited. */
  treatment: string | null;
  /** «Glass · Frosted», or just the family for a personal material. */
  meta: string;
  description: string | null;
  limitations: readonly string[];
  /** «Disponibile» / «Sperimentale» / null for a personal material. */
  availability: string | null;
  experimental: boolean;
  diagnostic: boolean;
  entry: MaterialCatalogEntry | null;
}

/** Catalog data of a library item. A personal material keeps its own name and gets only its family. */
export function presentItem(item: Pick<LibraryItem, 'id' | 'origin' | 'doc'>): MaterialPresentation {
  const entry = item.origin === 'builtin' ? (catalogEntry(item.id) ?? null) : null;
  const family = familyLabel(item.doc.family);
  return {
    family,
    treatment: entry ? (treatmentInfo(entry.familyId, entry.treatment)?.label ?? null) : null,
    meta: entry ? entryMeta(entry) : family,
    description: entry?.description ?? null,
    limitations: entry?.limitations ?? [],
    availability: entry ? availabilityLabel(entry.availability) : null,
    experimental: entry?.availability === 'experimental',
    diagnostic: entry?.kind === 'diagnostic',
    entry,
  };
}

export const isDiagnosticId = (id: string): boolean => catalogEntry(id)?.kind === 'diagnostic';

/** Wording of the origin of a library item. «Jello» is a family and the product, never the label of «built in». */
export const originLabel = (origin: 'builtin' | 'template' | 'user'): string => (origin === 'user' ? 'Personale' : 'Incluso');
