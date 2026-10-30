/**
 * Runtime side of the material registry (src/model/registry.ts): how a
 * family renders on DOM components. Components ask for a group and never
 * import a family's renderer directly.
 *
 *   const glass = createMaterialGroup({ source, material });   // GlassDocument → MaterialGroup
 *   const solid = createMaterialGroup({ material: solidDoc }); // SolidDocument → SolidGroup
 *   const surface = group.attach(host, { … });
 *   group.setMaterial(next);  group.detach(surface);  group.destroy();
 *
 * Each family keeps its own group type (Glass has backends and a source,
 * Solid has states), so the overloads are chosen by the document's family.
 * Code that only needs lifecycle and status uses `BaseMaterialGroup`
 * (material-types.ts). Adding a family means one entry in RUNTIMES, with the
 * same `renderer` id as its registry definition (tests/unit/registry.test.ts
 * checks that every definition has a runtime and the other way round).
 */
import type { GlassSurface } from '../core/surface';
import type { FamilyId } from '../model/families';
import type { GlassDocument } from '../model/document';
import { createGlassGroup, type AttachOptions, type GlassGroupOptions, type GroupStatus, type UpdateReport } from './glass-group';
import type { BaseMaterialGroup } from './material-types';
import { createSolidGroup, type SolidGroup, type SolidGroupOptions } from './solid-group';

/** What a component needs from a Glass renderer. GlassGroup implements it. */
export interface MaterialGroup extends BaseMaterialGroup {
  readonly material: GlassDocument;
  readonly status: GroupStatus;
  attach(host: HTMLElement, options?: AttachOptions): GlassSurface;
  detach(surface: GlassSurface): void;
  setMaterial(doc: GlassDocument): UpdateReport;
  onStatus(listener: (s: GroupStatus) => void): () => void;
}

export type MaterialGroupOptions = GlassGroupOptions;

export interface MaterialRuntime {
  family: FamilyId;
  /** Id of the registry definition's `renderer`. */
  renderer: string;
  createGroup(options: GlassGroupOptions | SolidGroupOptions): BaseMaterialGroup;
}

const RUNTIMES = new Map<string, MaterialRuntime>([
  ['glass', { family: 'glass', renderer: 'glass-group', createGroup: (o) => createGlassGroup(o as GlassGroupOptions) }],
  ['solid', { family: 'solid', renderer: 'solid-group', createGroup: (o) => createSolidGroup(o as SolidGroupOptions) }],
]);

export function materialRuntime(family: string): MaterialRuntime | undefined {
  return RUNTIMES.get(family);
}

export function createMaterialGroup(options: GlassGroupOptions): MaterialGroup;
export function createMaterialGroup(options: SolidGroupOptions): SolidGroup;
export function createMaterialGroup(options: GlassGroupOptions | SolidGroupOptions): BaseMaterialGroup {
  const family = (options.material as { family: string }).family;
  const rt = RUNTIMES.get(family);
  if (!rt) throw new Error(`Nessun runtime per la famiglia "${family}"`);
  return rt.createGroup(options);
}
