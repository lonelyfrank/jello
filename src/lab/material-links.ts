/**
 * Which saved components follow an edited personal material. Pure (no DOM,
 * no storage): the session stages what this returns and the autosave
 * commits it with the material.
 *
 * A component follows only when it links to the material, belongs to the
 * same project (a link never crosses projects, see project/references) and
 * its binding is `outdated`: the material changed since it was applied and
 * the component has no values of its own. Components with their own values
 * keep them; the inspector offers «Aggiorna dal preset».
 */

import { bindingState, bindMaterial, hasMaterialOverrides } from '../components';
import type { StoredComponent, StoredMaterial } from './storage/repository';

/** `open`: the component open in the builder, which follows through the builder instead. */
export function followingComponents(material: StoredMaterial, components: Iterable<StoredComponent>, open: string | null): StoredComponent[] {
  const out: StoredComponent[] = [];
  for (const rec of components) {
    if (rec.projectId !== material.projectId || rec.id === open || rec.doc.material.preset !== material.id) continue;
    if (bindingState(rec.doc.material, material.doc, hasMaterialOverrides(rec.doc)) !== 'outdated') continue;
    out.push({ ...rec, doc: { ...rec.doc, material: bindMaterial(material.doc, material.id) } });
  }
  return out;
}
