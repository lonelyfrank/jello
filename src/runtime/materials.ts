/**
 * Runtime side of the material registry (src/model/registry.ts): how a
 * family renders on DOM components. Components ask for a MaterialGroup and
 * never import a family's renderer directly, so a BottomNavigation (or any
 * later component) gets Glass today and another registered family tomorrow
 * through the same calls.
 *
 *   const group = createMaterialGroup({ source, material });   // dispatches on material.family
 *   const surface = group.attach(host, { sizing: 'element', radius: 'capsule' });
 *   group.setMaterial(next);  group.detach(surface);  group.destroy();
 */

import type { GlassSurface } from '../core/surface';
import type { MaterialDocument } from '../model/document';
import type { FamilyId } from '../model/families';
import { createGlassGroup, type AttachOptions, type GlassGroupOptions, type GroupStatus, type UpdateReport } from './glass-group';

/** What a component needs from a material renderer. GlassGroup implements it. */
export interface MaterialGroup {
  readonly material: MaterialDocument;
  readonly status: GroupStatus;
  attach(host: HTMLElement, options?: AttachOptions): GlassSurface;
  detach(surface: GlassSurface): void;
  setMaterial(doc: MaterialDocument): UpdateReport;
  onStatus(listener: (s: GroupStatus) => void): () => void;
  invalidate(): void;
  suspend(): void;
  resume(): void;
  destroy(): void;
}

export type MaterialGroupOptions = GlassGroupOptions;

export interface MaterialRuntime {
  family: FamilyId;
  createGroup(options: MaterialGroupOptions): MaterialGroup;
}

const RUNTIMES = new Map<string, MaterialRuntime>([['glass', { family: 'glass', createGroup: (o) => createGlassGroup(o) }]]);

export function materialRuntime(family: string): MaterialRuntime | undefined {
  return RUNTIMES.get(family);
}

export function createMaterialGroup(options: MaterialGroupOptions): MaterialGroup {
  const rt = RUNTIMES.get(options.material.family);
  if (!rt) throw new Error(`Nessun runtime per la famiglia "${options.material.family}"`);
  return rt.createGroup(options);
}
