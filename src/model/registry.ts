/**
 * Material registry: what a material *is*, independent of any component.
 *
 * Each entry describes one family that can be rendered today: identity,
 * version, parameter schema and defaults, editor control groups, per-state
 * overrides, built-in presets, supported features, interactions and states,
 * the backends it can run on (with their requirements), its fallback chain
 * and what an export needs to ship. The DOM side (how a group of surfaces is
 * created) is bound in src/runtime/materials.ts; components only ever talk to
 * that interface, never to a family's internals.
 *
 * Adding a family (Jelly next) means one document type, one definition
 * registered here and one runtime binding. `validateDefinition` checks that a
 * definition is complete and consistent; `register` refuses one that is not.
 * Planned families (families.ts) are not registered: they cannot be parsed,
 * edited or rendered, the editor shows them as "in sviluppo".
 */

import { checkKeys, checkValue, type Descriptor, type KeysCheck } from '../core/descriptors';
import { defaultParams, PARAMS, type GlassParams } from '../core/params';
import { BUILTIN_MATERIALS } from './builtins';
import { createGlassDocument, glassParams, serializeMaterial, withGlassParams, type ImportResult, type MaterialDocument } from './document';
import { FAMILIES, type FamilyId, type MaterialFeature } from './families';
import { parseMaterial } from './migrate';
import {
  createSolidDocument,
  defaultSolidParams,
  SOLID_GROUPS,
  SOLID_OVERRIDE_STATES,
  SOLID_PARAMS,
  SOLID_PRESETS,
  SOLID_STATE_PARAMS,
  SOLID_STATES,
  solidParams,
  withSolidParams,
  type SolidParams,
} from './solid';
import { BACKEND_LABEL, BACKEND_REQUIRES, type Backend } from './support';
import { FAMILY_MIN_RUNTIME, MATERIAL_FORMAT, SCHEMA_VERSION } from './version';

export type MaterialStateId = 'default' | 'hover' | 'pressed' | 'active' | 'disabled';
export type InteractionId = 'press' | 'hover' | 'drag';

const STATE_IDS: readonly MaterialStateId[] = ['default', 'hover', 'pressed', 'active', 'disabled'];
const INTERACTION_FEATURE: Readonly<Record<InteractionId, MaterialFeature>> = { press: 'press', drag: 'drag', hover: 'states' };

/** One block of editor controls: a labelled group and the parameter keys in it, in table order. */
export interface ControlGroup {
  id: string;
  label: string;
  keys: readonly string[];
}

export interface MaterialPresetEntry {
  doc: MaterialDocument;
  /** True when the preset approximates another project's treatment (none of the built-ins). */
  approximation: boolean;
  note: string;
}

export interface MaterialDefinition {
  id: FamilyId;
  name: string;
  /** Version of the family's own sections (familyVersion in documents). */
  version: number;
  description: string;
  document: { format: typeof MATERIAL_FORMAT; schemaVersion: number };
  /** Parameter schema (flat): label, unit, range, step, default, group, pipeline stage. */
  params: readonly Descriptor[];
  /** Editor groups in display order; every parameter's `group` names one of them. */
  groups: readonly { id: string; label: string }[];
  /** Keys a state may override, with their ranges. Empty when the family has no per-state values. */
  stateParams: readonly Descriptor[];
  /** States the family renders. `default` is always first. */
  states: readonly MaterialStateId[];
  /** Input the surface reacts to by itself. */
  interactions: readonly InteractionId[];
  features: readonly MaterialFeature[];
  defaults(): Record<string, unknown>;
  /** A new document of this family with default values. */
  create(id: string, name: string): MaterialDocument;
  /** Validates a flat set of parameters (what a component definition or an editor passes). */
  validateParams(values: unknown, options?: ValidateOptions): KeysCheck;
  /** Reads the values an inspector shows from a document of this family. */
  read(doc: MaterialDocument): MaterialValues;
  /**
   * Applies already-validated parameters (flat keys) and per-state overrides to a document of this family.
   * Returns a new document; families without per-state values ignore `states`.
   */
  customize(doc: MaterialDocument, changes: MaterialChanges): MaterialDocument;
  /**
   * What the family does for a component that asks for emphasis (a primary
   * button): parameter values and per-state overrides applied over the
   * material the component uses, before the component's own parameters. The
   * family decides the values, the component only asks, so a component never
   * knows another family's keys. A neutral component (secondary, ghost) applies nothing.
   */
  accent: AccentTreatment;
  /** Parses and validates a document of this family (atomic: complete or refused with every reason). */
  parse(input: unknown): ImportResult;
  serialize(doc: MaterialDocument): string;
  presets: readonly MaterialPresetEntry[];
  capabilities: {
    backends: readonly { backend: Backend; label: string; requires: readonly string[] }[];
    /** What the renderer needs from the integrator. */
    source: string;
  };
  /** The renderer that draws the family; src/runtime/materials.ts binds the same id. */
  renderer: { id: string; requires: readonly string[] };
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

/** `partial`: list only what changes (absent keys are not reported). `scope` prefixes the messages. */
export interface ValidateOptions {
  scope?: string;
  partial?: boolean;
}

/** Current values of a document in the shape an inspector shows: flat parameters and, per state, the overrides it has. */
export interface MaterialValues {
  params: Record<string, unknown>;
  states: Partial<Record<MaterialStateId, Record<string, unknown>>>;
}

export interface MaterialChanges {
  params?: Record<string, unknown>;
  states?: Partial<Record<MaterialStateId, Record<string, unknown>>>;
}

/** The family's own values for an emphasised component (what a primary button looks like on this material). */
export interface AccentTreatment extends MaterialChanges {
  /** Why these values: shown in the documentation, checked by tests (contrast of the content over the surface). */
  note: string;
}

/** Control groups of a definition, derived from the descriptors: one source for table, editor and docs. */
export function controlGroups(def: Pick<MaterialDefinition, 'params' | 'groups'>): ControlGroup[] {
  return def.groups
    .map((g) => ({ id: g.id, label: g.label, keys: def.params.filter((d) => d.group === g.id).map((d) => d.key) }))
    .filter((g) => g.keys.length > 0);
}

/**
 * Everything wrong with a definition, as readable sentences (empty when it is
 * complete and consistent). Registering a family means passing this.
 */
export function validateDefinition(def: MaterialDefinition): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const groups = new Set(def.groups.map((g) => g.id));
  if (def.groups.length !== groups.size) problems.push('gruppi duplicati');
  for (const d of def.params) {
    if (keys.has(d.key)) problems.push(`${d.key}: parametro duplicato`);
    keys.add(d.key);
    if (!groups.has(d.group)) problems.push(`${d.key}: gruppo «${d.group}» non dichiarato`);
    const bad = checkValue(d, d.default);
    if (bad) problems.push(`${d.key}: valore iniziale non valido (${bad})`);
  }
  if (!def.params.length) problems.push('nessun parametro');
  for (const d of def.stateParams) {
    const bad = checkValue(d, d.default);
    if (bad) problems.push(`stato · ${d.key}: valore iniziale non valido (${bad})`);
  }
  if (def.stateParams.length && !def.features.includes('states')) problems.push('override per stato dichiarati senza la capacità «states»');
  if (def.states[0] !== 'default') problems.push('il primo stato deve essere «default»');
  for (const s of def.states) if (!STATE_IDS.includes(s)) problems.push(`stato sconosciuto: ${s}`);
  for (const i of def.interactions) {
    const needs = INTERACTION_FEATURE[i];
    if (!needs) problems.push(`interazione sconosciuta: ${i}`);
    else if (!def.features.includes(needs)) problems.push(`interazione «${i}» richiede la capacità «${needs}»`);
  }
  if (!def.renderer.id) problems.push('renderer non dichiarato');
  if (def.document.schemaVersion !== SCHEMA_VERSION) problems.push(`schema ${def.document.schemaVersion}: questo runtime scrive lo schema ${SCHEMA_VERSION}`);
  const ids = new Set<string>();
  for (const p of def.presets) {
    if (p.doc.family !== def.id) problems.push(`preset ${p.doc.id}: famiglia ${p.doc.family}, atteso ${def.id}`);
    if (ids.has(p.doc.id)) problems.push(`preset ${p.doc.id}: id duplicato`);
    ids.add(p.doc.id);
    const again = def.parse(JSON.parse(def.serialize(p.doc)));
    if (!again.ok) problems.push(`preset ${p.doc.id}: non supera la propria validazione (${again.errors[0]})`);
  }
  const fresh = def.create('check', 'Check');
  if (fresh.family !== def.id) problems.push(`create(): documento di famiglia ${fresh.family}, atteso ${def.id}`);
  const parsed = def.parse(JSON.parse(def.serialize(fresh)));
  if (!parsed.ok) problems.push(`create(): il documento nuovo non supera la validazione (${parsed.errors[0]})`);
  const flat = def.validateParams(def.defaults());
  if (flat.errors.length) problems.push(`defaults(): ${flat.errors[0]}`);
  const values = def.read(fresh);
  const unknownKeys = Object.keys(values.params).filter((k) => !keys.has(k));
  if (unknownKeys.length) problems.push(`read(): chiavi non descritte: ${unknownKeys.join(', ')}`);
  const missingKeys = [...keys].filter((k) => !(k in values.params));
  if (missingKeys.length) problems.push(`read(): chiavi descritte ma non lette: ${missingKeys.join(', ')}`);
  const stateKeys = new Set(def.stateParams.map((d) => d.key));
  for (const [state, o] of Object.entries(values.states)) {
    if (!(def.states as readonly string[]).includes(state)) problems.push(`read(): stato «${state}» che la famiglia non rende`);
    for (const k of Object.keys(o ?? {})) if (!stateKeys.has(k)) problems.push(`read(): override non descritto: ${state}.${k}`);
  }
  const accent = def.validateParams(def.accent.params ?? {}, { scope: 'accent.params', partial: true });
  problems.push(...accent.errors.map((e) => `accent: ${e}`));
  for (const [state, o] of Object.entries(def.accent.states ?? {})) {
    if (!(def.states as readonly string[]).includes(state)) problems.push(`accent: stato «${state}» che la famiglia non rende`);
    else for (const e of checkKeys(def.stateParams, o, { scope: `accent.states.${state}`, partial: true }).errors) problems.push(e);
  }
  if (!def.accent.note) problems.push('accent: manca la nota');
  const same = def.customize(fresh, { params: def.defaults() });
  if (same.family !== def.id || def.serialize(same) !== def.serialize(fresh)) problems.push('customize(): applicare i valori iniziali deve restituire lo stesso documento');
  return problems;
}

/** Parses with the shared parser and refuses documents of another family. */
const parseAs =
  (family: FamilyId) =>
  (input: unknown): ImportResult => {
    const r = parseMaterial(input);
    if (r.ok && r.doc.family !== family) return { ok: false, errors: [`family: atteso "${family}", trovato "${r.doc.family}"`] };
    return r;
  };

const familyDescription = (id: FamilyId) => FAMILIES.find((f) => f.id === id)!.description;

const GLASS: MaterialDefinition = {
  id: 'glass',
  name: 'Glass',
  version: 1,
  description: familyDescription('glass'),
  document: { format: MATERIAL_FORMAT, schemaVersion: SCHEMA_VERSION },
  params: PARAMS,
  groups: [
    { id: 'shape', label: 'Forma' },
    { id: 'optics', label: 'Ottica' },
    { id: 'material', label: 'Materiale' },
    { id: 'light', label: 'Luce' },
    { id: 'shadow', label: 'Ombra' },
    { id: 'motion', label: 'Movimento' },
  ],
  stateParams: [],
  states: ['default', 'pressed'],
  interactions: ['press', 'drag'],
  features: ['backdrop', 'refraction', 'shadow', 'press', 'drag'],
  defaults: () => ({ ...defaultParams() }),
  create: (id, name) => createGlassDocument({ id, name }),
  validateParams: (values, o = {}) => checkKeys(PARAMS, values, { scope: 'params', ...o }),
  read: (doc) => ({ params: doc.family === 'glass' ? { ...glassParams(doc) } : {}, states: {} }),
  customize: (doc, { params }) => (doc.family === 'glass' && params ? withGlassParams(doc, { ...glassParams(doc), ...params } as GlassParams) : doc),
  // Deep blue tint, opaque enough that white content keeps ≥ 4.5:1 even over a white backdrop (tests/unit/button.test.ts).
  accent: { params: { tint: '#1d4ed8', tintOpacity: 0.85 }, note: 'Tinta blu profonda abbastanza opaca da dare ≥ 4,5:1 al contenuto bianco anche sopra uno sfondo bianco.' },
  parse: parseAs('glass'),
  serialize: serializeMaterial,
  presets: BUILTIN_MATERIALS,
  capabilities: {
    backends: (['svg', 'css', 'webgl2'] as const).map((b) => ({ backend: b, label: BACKEND_LABEL[b], requires: BACKEND_REQUIRES[b] })),
    source: 'Componenti DOM: una GlassSource opaca dietro le superfici (SVG), altrimenti backdrop-filter (CSS). Scene: una texture controllata (WebGL2).',
  },
  renderer: { id: 'glass-group', requires: ['SVG filter o backdrop-filter', 'WebGL2 per le scene'] },
  fallbacks: ['css', 'opaque'],
  export: { module: '@jello/runtime', entry: 'createMaterialGroup', css: 'jello.css', minRuntime: FAMILY_MIN_RUNTIME.glass },
};

const SOLID: MaterialDefinition = {
  id: 'solid',
  name: 'Solid',
  version: 1,
  description: familyDescription('solid'),
  document: { format: MATERIAL_FORMAT, schemaVersion: SCHEMA_VERSION },
  params: SOLID_PARAMS,
  groups: SOLID_GROUPS,
  stateParams: SOLID_STATE_PARAMS,
  states: SOLID_STATES,
  interactions: ['hover', 'press'],
  features: ['border', 'shadow', 'elevation', 'states', 'press', 'transitions'],
  defaults: () => ({ ...defaultSolidParams() }),
  create: (id, name) => createSolidDocument({ id, name }),
  validateParams: (values, o = {}) => checkKeys(SOLID_PARAMS, values, { scope: 'params', ...o }),
  read: (doc) => ({
    params: doc.family === 'solid' ? { ...solidParams(doc) } : {},
    states: doc.family === 'solid' ? Object.fromEntries(SOLID_OVERRIDE_STATES.map((s) => [s, { ...doc.states[s] }])) : {},
  }),
  customize: (doc, { params, states }) => {
    if (doc.family !== 'solid') return doc;
    const next = params ? withSolidParams(doc, { ...solidParams(doc), ...params } as SolidParams) : doc;
    if (!states) return next;
    const merged = { ...next.states };
    for (const s of SOLID_OVERRIDE_STATES) if (states[s]) merged[s] = { ...merged[s], ...states[s] };
    return { ...next, states: merged };
  },
  accent: {
    params: { fill: '#2563eb', foreground: '#ffffff', finish: 'soft', borderColor: '#1d4ed8', shadowColor: '#1e3a8a', shadowOpacity: 0.3 },
    states: {
      hover: { fill: '#1e56d4', elevation: 2 },
      pressed: { fill: '#1b4bbd', elevation: 0, scale: 0.98 },
      active: { fill: '#17399a', foreground: '#ffffff', borderColor: '#17399a' },
    },
    note: 'Blu pieno con contenuto bianco (≥ 4,5:1 in ogni stato), gli stessi valori del preset «Solid · accento» senza la forma.',
  },
  parse: parseAs('solid'),
  serialize: serializeMaterial,
  presets: SOLID_PRESETS,
  // Plain CSS: no backend choice, no fallback chain, nothing to fall back from.
  capabilities: { backends: [], source: 'Nessuna: la superficie si dipinge da sola con CSS.' },
  renderer: { id: 'solid-group', requires: [] },
  fallbacks: [],
  export: { module: '@jello/runtime', entry: 'createMaterialGroup', css: 'jello.css', minRuntime: FAMILY_MIN_RUNTIME.solid },
};

export class MaterialRegistry {
  private readonly entries = new Map<string, MaterialDefinition>();

  register(def: MaterialDefinition): void {
    if (this.entries.has(def.id)) throw new Error(`Materiale già registrato: ${def.id}`);
    const family = FAMILIES.find((f) => f.id === def.id);
    if (!family || family.status !== 'available') throw new Error(`La famiglia ${def.id} non è disponibile in questo runtime`);
    const problems = validateDefinition(def);
    if (problems.length) throw new Error(`Definizione del materiale ${def.id} non valida: ${problems.join('; ')}`);
    this.entries.set(def.id, def);
  }

  get(id: string): MaterialDefinition | undefined {
    return this.entries.get(id);
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  list(): MaterialDefinition[] {
    return [...this.entries.values()];
  }

  /** Built-in preset of any registered family. */
  preset(id: string): MaterialPresetEntry | undefined {
    for (const d of this.entries.values()) {
      const p = d.presets.find((b) => b.doc.id === id);
      if (p) return p;
    }
    return undefined;
  }

  /** Validates a flat set of parameters for a family; unknown family → one error. */
  validateParams(family: string, values: unknown, options?: ValidateOptions): KeysCheck {
    const def = this.entries.get(family);
    if (!def) return { values: {}, errors: [`family: «${family}» non è un materiale registrato`], warnings: [] };
    return def.validateParams(values, options);
  }
}

export const MATERIALS = new MaterialRegistry();
MATERIALS.register(GLASS);
MATERIALS.register(SOLID);

export function materialDefinition(id: string): MaterialDefinition | undefined {
  return MATERIALS.get(id);
}
