/**
 * Material registry: what a material *is*, independent of any component.
 *
 * Each entry describes one family that can be rendered today: identity,
 * version, parameter schema, defaults, built-in presets, the backends it can
 * run on (with their requirements), its fallback chain and what an export
 * needs to ship. The DOM side (how a group of surfaces is created) is bound
 * in src/runtime/materials.ts; components only ever talk to that interface,
 * never to Glass internals.
 *
 * Planned families (families.ts) are not registered: they cannot be parsed,
 * edited or rendered, the editor shows them as "in sviluppo".
 */

import { defaultParams, PARAMS, type ParamDescriptor } from '../core/params';
import { BUILTIN_MATERIALS, type BuiltinMaterial } from './builtins';
import { createGlassDocument, type MaterialDocument } from './document';
import { FAMILIES, type FamilyId } from './families';
import { BACKEND_LABEL, BACKEND_REQUIRES, type Backend } from './support';
import { MATERIAL_FORMAT, RUNTIME_VERSION, SCHEMA_VERSION } from './version';

export interface MaterialDefinition {
  id: FamilyId;
  name: string;
  /** Version of the family's own sections (familyVersion in documents). */
  version: number;
  description: string;
  document: { format: typeof MATERIAL_FORMAT; schemaVersion: number };
  /** Parameter schema: label, unit, range, step, default, pipeline stage. */
  params: readonly ParamDescriptor[];
  defaults(): Record<string, unknown>;
  /** A new document of this family with default values. */
  create(id: string, name: string): MaterialDocument;
  presets: readonly BuiltinMaterial[];
  capabilities: {
    backends: readonly { backend: Backend; label: string; requires: readonly string[] }[];
    /** What the renderer needs from the integrator. */
    source: string;
  };
  /** Order the runtime tries when the requested backend is not usable. */
  fallbacks: readonly ('css' | 'opaque')[];
  export: {
    /** Package and entry a consumer imports. */
    module: string;
    entry: string;
    css: string;
    minRuntime: string;
  };
}

const GLASS: MaterialDefinition = {
  id: 'glass',
  name: 'Glass',
  version: 1,
  description: FAMILIES.find((f) => f.id === 'glass')!.description,
  document: { format: MATERIAL_FORMAT, schemaVersion: SCHEMA_VERSION },
  params: PARAMS,
  defaults: () => ({ ...defaultParams() }),
  create: (id, name) => createGlassDocument({ id, name }),
  presets: BUILTIN_MATERIALS,
  capabilities: {
    backends: (['svg', 'css', 'webgl2'] as const).map((b) => ({ backend: b, label: BACKEND_LABEL[b], requires: BACKEND_REQUIRES[b] })),
    source: 'Componenti DOM: una GlassSource opaca dietro le superfici (SVG), altrimenti backdrop-filter (CSS). Scene: una texture controllata (WebGL2).',
  },
  fallbacks: ['css', 'opaque'],
  export: { module: '@jello/runtime', entry: 'createMaterialGroup', css: 'jello.css', minRuntime: RUNTIME_VERSION },
};

export class MaterialRegistry {
  private readonly entries = new Map<string, MaterialDefinition>();

  register(def: MaterialDefinition): void {
    if (this.entries.has(def.id)) throw new Error(`Materiale già registrato: ${def.id}`);
    const family = FAMILIES.find((f) => f.id === def.id);
    if (!family || family.status !== 'available') throw new Error(`La famiglia ${def.id} non è disponibile in questo runtime`);
    this.entries.set(def.id, def);
  }

  get(id: string): MaterialDefinition | undefined {
    return this.entries.get(id);
  }

  list(): MaterialDefinition[] {
    return [...this.entries.values()];
  }

  /** Built-in preset of any registered family. */
  preset(id: string): BuiltinMaterial | undefined {
    for (const d of this.entries.values()) {
      const p = d.presets.find((b) => b.doc.id === id);
      if (p) return p;
    }
    return undefined;
  }
}

export const MATERIALS = new MaterialRegistry();
MATERIALS.register(GLASS);

export function materialDefinition(id: string): MaterialDefinition | undefined {
  return MATERIALS.get(id);
}
